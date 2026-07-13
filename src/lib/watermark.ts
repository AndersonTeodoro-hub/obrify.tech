// Marca d'água RENDERIZADA (não destrutiva): desenha a faixa + texto sobre uma
// cópia da imagem em canvas e devolve uma nova base64. A imagem original nunca é
// alterada. Reutilizado na exportação do relatório (PDF/DOCX) e no "descarregar
// foto com carimbo". A geometria (faixa/fonte) é a mesma que o carimbo antigo
// queimava, para o resultado visual ser idêntico.

export type WatermarkMeta = {
  especialidade?: string | null;
  fase?: string | null;
  piso?: string | null;
  cota?: number | null;
  ambiente?: string | null;
  atividade?: string | null;
  captured_at?: string | null;
};

// Constrói as linhas do carimbo a partir dos metadados (data, especialidade,
// fase, piso/cota). Sem metadados úteis → devolve só a data de fallback (ou nada).
export function buildWatermarkLines(meta: WatermarkMeta | undefined | null, fallbackDate?: string): string[] {
  if (!meta) return fallbackDate ? [fallbackDate] : [];
  const nivel = meta.piso ? `${meta.piso}${meta.cota != null ? ` (${meta.cota})` : ''}` : '';
  const ctx = [
    meta.especialidade || '',
    meta.fase ? `Fase ${meta.fase}` : '',
    nivel,
  ].filter(Boolean).join(' · ');
  const date = meta.captured_at
    ? new Date(meta.captured_at).toLocaleString('pt-PT', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : (fallbackDate || '');
  return [ctx, date].filter(Boolean);
}

// Desenha o carimbo sobre a imagem (aceita data URL ou base64 puro) e devolve um
// data URL JPEG. Sem linhas → devolve a imagem original sem tocar nos pixels.
export function stampImageBase64(base64: string, lines: string[]): Promise<string> {
  const src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  return new Promise((resolve, reject) => {
    if (!lines || lines.length === 0) {
      resolve(src);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0);

        const w = canvas.width;
        const h = canvas.height;
        const fontSize = Math.max(14, Math.round(w * 0.028));
        const pad = Math.round(fontSize * 0.5);
        const lineH = Math.round(fontSize * 1.35);
        const bandH = lineH * lines.length + pad * 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, h - bandH, w, bandH);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.textBaseline = 'top';
        lines.forEach((ln, i) => ctx.fillText(ln, pad, h - bandH + pad + i * lineH));

        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        reject(err as Error);
      }
    };
    img.onerror = () => reject(new Error('Falha a carregar imagem para o carimbo'));
    img.src = src;
  });
}
