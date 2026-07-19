// Contagem de páginas de um PDF no browser (pdfjs). O custo corre no cliente — a
// lição do OOM da edge function NÃO se aplica aqui. Usado no upload para orçamentar
// as passagens da análise por PÁGINAS (limite Anthropic: 100pp de PDF por request).
// Best-effort: devolve null se não for PDF ou se a leitura falhar (warning ruidoso).
// O fallback da function trata null (isola o doc na sua própria passagem).
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const isPdf = (file: File) =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Nº de páginas de um File PDF, ou null (não-PDF, ou falha de leitura). */
export async function countPdfPages(file: File): Promise<number | null> {
  if (!isPdf(file)) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const n = pdf.numPages;
    await pdf.destroy();
    return n;
  } catch (err) {
    console.warn(`[PAM] contagem de páginas falhou para "${file.name}":`, err);
    return null;
  }
}
