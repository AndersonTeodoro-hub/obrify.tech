import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { supabase } from '@/integrations/supabase/client';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface Mark { x: number; y: number } // normalizado 0..1

const TARGET_WIDTH = 1600;
const bytesCache = new Map<string, Uint8Array>();
const baseCache = new Map<string, string>(); // filePath|page -> dataURL sem marca

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

/**
 * Renderiza a pagina com marcacao subtil (circulo laranja translucido) nas posicoes dadas.
 * positions vazio -> devolve a pagina sem marca (degradacao graciosa).
 * Erros ruidosos: qualquer falha lanca com mensagem completa.
 */
export async function renderPageWithMark(filePath: string, page: number, positions: Mark[]): Promise<string> {
  const baseDataUrl = await renderBase(filePath, page);
  if (!positions || positions.length === 0) return baseDataUrl;

  const img = await loadImage(baseDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nao foi possivel obter o contexto do canvas.');
  ctx.drawImage(img, 0, 0);

  const radius = 0.04 * canvas.width;
  for (const pos of positions) {
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
