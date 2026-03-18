import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ZoneAnnotation {
  x_percent: number;
  y_percent: number;
  radius_percent: number;
  label: string;
  severity: string;
}

export async function pdfPageToImage(pdfBase64: string, pageNum = 1, scale = 1.5): Promise<string> {
  const binaryString = atob(pdfBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNum);

  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Get page count of a PDF */
export async function pdfPageCount(pdfBase64: string): Promise<number> {
  const binaryString = atob(pdfBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

/**
 * Overlay two PDF pages: base (full opacity) + overlay (tinted + transparent)
 * Returns a data URL of the composited image with conflict annotations
 */
export async function overlayPlans(
  basePdfBase64: string,
  overlayPdfBase64: string,
  annotations: ZoneAnnotation[],
  options: {
    basePage?: number;
    overlayPage?: number;
    overlayOpacity?: number;
    overlayTint?: [number, number, number]; // RGB tint for overlay
    scale?: number;
  } = {}
): Promise<string> {
  const {
    basePage = 1,
    overlayPage = 1,
    overlayOpacity = 0.35,
    overlayTint = [0, 100, 255], // blue tint
    scale = 2.0,
  } = options;

  // Render base PDF page
  const baseImg = await pdfPageToImage(basePdfBase64, basePage, scale);

  // Render overlay PDF page
  const overlayImg = await pdfPageToImage(overlayPdfBase64, overlayPage, scale);

  return new Promise((resolve) => {
    const imgBase = new Image();
    imgBase.onload = () => {
      const imgOverlay = new Image();
      imgOverlay.onload = () => {
        // Use the larger dimensions
        const w = Math.max(imgBase.width, imgOverlay.width);
        const h = Math.max(imgBase.height, imgOverlay.height);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;

        // Layer 1: White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);

        // Layer 2: Base project (full opacity, centered)
        const bx = (w - imgBase.width) / 2;
        const by = (h - imgBase.height) / 2;
        ctx.drawImage(imgBase, bx, by);

        // Layer 3: Overlay project (tinted + transparent)
        // First draw overlay to a temp canvas and apply tint
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d')!;

        const ox = (w - imgOverlay.width) / 2;
        const oy = (h - imgOverlay.height) / 2;
        tempCtx.drawImage(imgOverlay, ox, oy);

        // Apply tint using multiply blend
        tempCtx.globalCompositeOperation = 'multiply';
        tempCtx.fillStyle = `rgb(${overlayTint[0]}, ${overlayTint[1]}, ${overlayTint[2]})`;
        tempCtx.fillRect(0, 0, w, h);

        // Reset composite
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.drawImage(imgOverlay, ox, oy);

        // Draw tinted overlay with transparency
        ctx.globalAlpha = overlayOpacity;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalAlpha = 1.0;

        // Layer 4: Conflict annotations
        annotations.forEach((ann) => {
          const x = (ann.x_percent / 100) * w;
          const y = (ann.y_percent / 100) * h;
          const clampedRadius = Math.min(ann.radius_percent, 12);
          const radius = (clampedRadius / 100) * w;

          const colors: Record<string, { fill: string; stroke: string }> = {
            alta: { fill: 'rgba(220, 38, 38, 0.2)', stroke: '#DC2626' },
            critical: { fill: 'rgba(220, 38, 38, 0.2)', stroke: '#DC2626' },
            media: { fill: 'rgba(245, 158, 11, 0.2)', stroke: '#F59E0B' },
            warning: { fill: 'rgba(245, 158, 11, 0.2)', stroke: '#F59E0B' },
            baixa: { fill: 'rgba(37, 99, 235, 0.2)', stroke: '#2563EB' },
            info: { fill: 'rgba(37, 99, 235, 0.2)', stroke: '#2563EB' },
          };
          const color = colors[ann.severity] || colors.media;

          // Pulsing circle fill
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = color.fill;
          ctx.fill();

          // Bold dashed border
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = color.stroke;
          ctx.lineWidth = 4;
          ctx.setLineDash([12, 6]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Cross-hair lines through conflict point
          ctx.strokeStyle = color.stroke;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(x - radius * 1.3, y);
          ctx.lineTo(x + radius * 1.3, y);
          ctx.moveTo(x, y - radius * 1.3);
          ctx.lineTo(x, y + radius * 1.3);
          ctx.stroke();
          ctx.globalAlpha = 1.0;

          // Label badge
          const label = ann.label;
          ctx.font = 'bold 18px Arial';
          const textWidth = ctx.measureText(label).width;
          const labelX = x - textWidth / 2 - 8;
          const labelY = y - radius - 24;

          // Badge background with shadow
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = color.stroke;
          ctx.beginPath();
          ctx.roundRect(labelX, labelY - 16, textWidth + 16, 26, 6);
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;

          // Badge text
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 16px Arial';
          ctx.fillText(label, labelX + 8, labelY + 4);

          // Arrow pointer
          ctx.beginPath();
          ctx.moveTo(x, labelY + 10);
          ctx.lineTo(x - 8, labelY + 20);
          ctx.lineTo(x + 8, labelY + 20);
          ctx.closePath();
          ctx.fillStyle = color.stroke;
          ctx.fill();
        });

        // Legend in bottom-right corner
        const legendX = w - 220;
        const legendY = h - 70;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(legendX, legendY, 200, 55);
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX, legendY, 200, 55);

        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#1E293B';
        ctx.fillText('Legenda', legendX + 8, legendY + 15);

        ctx.font = '11px Arial';
        ctx.fillStyle = '#000000';
        ctx.fillText('Projecto Base (opaco)', legendX + 8, legendY + 30);

        ctx.fillStyle = `rgba(${overlayTint[0]}, ${overlayTint[1]}, ${overlayTint[2]}, 0.7)`;
        ctx.fillRect(legendX + 8, legendY + 36, 12, 12);
        ctx.fillStyle = '#000000';
        ctx.font = '11px Arial';
        ctx.fillText('Projecto Sobreposto', legendX + 24, legendY + 46);

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      imgOverlay.src = overlayImg;
    };
    imgBase.src = baseImg;
  });
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
        // Cap radius at 12% max to avoid oversized circles
        const clampedRadius = Math.min(ann.radius_percent, 12);
        const radius = (clampedRadius / 100) * canvas.width;

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
