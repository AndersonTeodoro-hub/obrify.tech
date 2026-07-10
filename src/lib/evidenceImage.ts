import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { supabase } from '@/integrations/supabase/client';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface Mark { x: number; y: number } // posição resolvida, normalizada 0..1
export interface EvidenceMark { x?: number; y?: number; ref?: string | null } // estimativa + ref (âncora)

const TARGET_WIDTH = 1600;
const bytesCache = new Map<string, Uint8Array>();
const baseCache = new Map<string, string>(); // filePath|page -> dataURL sem marca
const textCache = new Map<string, { items: any[]; width: number; height: number; transform: number[]; scale: number }>();

async function loadBytes(filePath: string): Promise<Uint8Array> {
  const cached = bytesCache.get(filePath);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from('incompaticheck-files').download(filePath);
  if (error || !data) throw new Error(`Falha a descarregar prancha (${filePath}): ${error?.message || 'sem dados'}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  bytesCache.set(filePath, bytes);
  return bytes;
}

async function renderBase(filePath: string, page: number): Promise<string> {
  const key = `${filePath}|${page}`;
  const cached = baseCache.get(key);
  if (cached) return cached;

  const bytes = await loadBytes(filePath);
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; // copia: pdfjs pode destacar o buffer
  if (page < 1 || page > pdf.numPages) throw new Error(`Pagina ${page} fora do intervalo (documento tem ${pdf.numPages}).`);
  const pg = await pdf.getPage(page);
  const base = pg.getViewport({ scale: 1 });
  const scale = TARGET_WIDTH / base.width;
  const viewport = pg.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nao foi possivel obter o contexto do canvas.');
  await pg.render({ canvasContext: ctx, viewport }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  baseCache.set(key, dataUrl);
  return dataUrl;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha a carregar a imagem renderizada da prancha.'));
    img.src = src;
  });
}

// Camada de texto da página, na MESMA escala do render (para converter coordenadas
// do texto para o referencial em pixels da imagem). Cache por filePath|page.
async function getTextLayout(filePath: string, page: number) {
  const key = `${filePath}|${page}`;
  const cached = textCache.get(key);
  if (cached) return cached;

  const bytes = await loadBytes(filePath);
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; // copia: pdfjs pode destacar o buffer
  if (page < 1 || page > pdf.numPages) throw new Error(`Pagina ${page} fora do intervalo (documento tem ${pdf.numPages}).`);
  const pg = await pdf.getPage(page);
  const base = pg.getViewport({ scale: 1 });
  const scale = TARGET_WIDTH / base.width;
  const viewport = pg.getViewport({ scale });
  const tc = await pg.getTextContent();
  const layout = { items: tc.items as any[], width: viewport.width, height: viewport.height, transform: viewport.transform as number[], scale };
  textCache.set(key, layout);
  return layout;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const normRef = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const stripEnds = (s: string) => s.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

/**
 * Ancora a referência do elemento (ex: "Pb2a") na camada de texto do PDF e devolve
 * posições normalizadas 0..1 (top-down, mesmo referencial da imagem renderizada).
 * Compõe item.transform com viewport.transform (que já inclui escala + flip de y).
 *
 * LIMITAÇÃO CONHECIDA (memória futura): o pdfjs por vezes fragmenta um rótulo em
 * vários items ("P","b2a"). O match é por item; refs fragmentadas não casam aqui e
 * caem no fallback da estimativa em renderPageWithMark — aceitável nesta correção.
 */
function findRefPositions(
  layout: { items: any[]; width: number; height: number; transform: number[]; scale: number },
  ref: string,
  estimate?: { x: number; y: number },
): Mark[] {
  const target = stripEnds(normRef(ref));
  if (!target) return [];

  const hits: Mark[] = [];
  for (const it of layout.items) {
    if (!it || typeof it.str !== 'string' || !it.transform) continue;
    const normStr = normRef(it.str);
    if (!normStr) continue;
    const isMatch = normStr === target || normStr.split(/\s+/).map(stripEnds).includes(target);
    if (!isMatch) continue;

    const m = pdfjsLib.Util.transform(layout.transform, it.transform);
    const w = (it.width || 0) * layout.scale;
    const h = (it.height || 0) * layout.scale;
    const cx = m[4] + w / 2; // origem = baseline esquerda -> centro em x
    const cy = m[5] - h / 2; // baseline em baixo do glifo -> centro em y (y cresce p/ baixo)
    hits.push({ x: clamp01(cx / layout.width), y: clamp01(cy / layout.height) });
  }
  if (hits.length === 0) return [];

  if (estimate) {
    let best = hits[0];
    let bestD = Infinity;
    for (const p of hits) {
      const d = (p.x - estimate.x) ** 2 + (p.y - estimate.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return [best]; // várias ocorrências: a mais próxima da estimativa
  }
  return hits.slice(0, 3); // sem estimativa: até 3 marcas (a ref pode aparecer em vários sítios)
}

/**
 * Renderiza a pagina com marcacao subtil (circulo laranja translucido) nas posicoes dadas.
 * positions vazio -> devolve a pagina sem marca (degradacao graciosa).
 * Erros ruidosos: qualquer falha lanca com mensagem completa.
 */
export async function renderPageWithMark(filePath: string, page: number, marks: EvidenceMark[]): Promise<string> {
  const baseDataUrl = await renderBase(filePath, page);
  if (!marks || marks.length === 0) return baseDataUrl;

  // Resolver posições: ancorar na camada de texto (ref) com fallback para a estimativa.
  const resolved: Mark[] = [];
  let layout: Awaited<ReturnType<typeof getTextLayout>> | null = null;
  for (const mark of marks) {
    const estimate = (typeof mark.x === 'number' && typeof mark.y === 'number') ? { x: mark.x, y: mark.y } : undefined;
    let placed = false;
    if (mark.ref) {
      if (!layout) layout = await getTextLayout(filePath, page);
      const hits = findRefPositions(layout, mark.ref, estimate);
      if (hits.length > 0) { resolved.push(...hits); placed = true; }
    }
    if (!placed && estimate) resolved.push(estimate);
  }
  if (resolved.length === 0) return baseDataUrl;

  const img = await loadImage(baseDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nao foi possivel obter o contexto do canvas.');
  ctx.drawImage(img, 0, 0);

  const radius = 0.04 * canvas.width;
  for (const pos of resolved) {
    const cx = Math.max(0, Math.min(1, pos.x)) * canvas.width;
    const cy = Math.max(0, Math.min(1, pos.y)) * canvas.height;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 107, 53, 0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  return canvas.toDataURL('image/jpeg', 0.8);
}
