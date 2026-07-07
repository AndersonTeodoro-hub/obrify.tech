// Utilitários partilhados de imagem para o fluxo Silva (parecer + legenda).
// Reutilizados pelo SilvaAnalysisButton (parecer) e pelo PhotoReports (legendas em lote).
const DEFAULT_MAX_BYTES = 4_500_000;
const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_QUALITY = 0.85;

// Blob -> base64 (sem prefixo data:).
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Falha a ler ficheiro'));
    reader.readAsDataURL(blob);
  });
}

// Comprime via Canvas e devolve base64 (sem prefixo data:).
export function compressBlobToBase64(
  blob: Blob,
  maxWidth = DEFAULT_MAX_WIDTH,
  quality = DEFAULT_QUALITY,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas não suportado'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (out) => {
            if (!out) {
              reject(new Error('Falha na compressão'));
              return;
            }
            blobToBase64(out).then(resolve, reject);
          },
          'image/jpeg',
          quality,
        );
      } catch (err) {
        reject(err as Error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha a carregar imagem'));
    };

    img.src = url;
  });
}

// Devolve base64 garantidamente abaixo do limite (comprime se necessário).
export async function toBase64UnderLimit(
  blob: Blob,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<string> {
  let b64 = await blobToBase64(blob);
  if (b64.length > maxBytes) {
    b64 = await compressBlobToBase64(blob);
  }
  if (b64.length > maxBytes) {
    throw new Error('Imagem demasiado grande mesmo após compressão');
  }
  return b64;
}
