import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ZoneAnnotation {
  x_percent: number;
  y_percent: number;
  radius_percent: number;
  label: string;
  severity: string;
}

export async function pdfPageToImage(pdfBase64: string): Promise<string> {
  const binaryString = atob(pdfBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const scale = 1.5;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL('image/jpeg', 0.85);
}

export function annotateImage(
  imageDataUrl: string,
  annotations: ZoneAnnotation[]
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);

      annotations.forEach((ann) => {
        const x = (ann.x_percent / 100) * canvas.width;
        const y = (ann.y_percent / 100) * canvas.height;
        const radius = (ann.radius_percent / 100) * canvas.width;

        const colors: Record<string, { fill: string; stroke: string }> = {
          alta: { fill: 'rgba(220, 38, 38, 0.15)', stroke: '#DC2626' },
          media: { fill: 'rgba(217, 119, 6, 0.15)', stroke: '#D97706' },
          baixa: { fill: 'rgba(37, 99, 235, 0.15)', stroke: '#2563EB' },
        };
        const color = colors[ann.severity] || colors.media;

        // Filled circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color.fill;
        ctx.fill();

        // Dashed border
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        const label = ann.label;
        ctx.font = 'bold 16px Arial';
        const textWidth = ctx.measureText(label).width;
        const labelX = x - textWidth / 2 - 6;
        const labelY = y - radius - 20;

        ctx.fillStyle = color.stroke;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY - 14, textWidth + 12, 22, 4);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(label, labelX + 6, labelY + 3);

        // Arrow
        ctx.beginPath();
        ctx.moveTo(x, labelY + 8);
        ctx.lineTo(x - 6, labelY + 16);
        ctx.lineTo(x + 6, labelY + 16);
        ctx.closePath();
        ctx.fillStyle = color.stroke;
        ctx.fill();
      });

      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = imageDataUrl;
  });
}
