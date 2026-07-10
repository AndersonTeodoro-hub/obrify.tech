import { useEffect, useState } from 'react';
import { renderPageWithMark, type EvidenceMark } from '@/lib/evidenceImage';

export default function EvidenceImage({ filePath, page, positions, caption }: {
  filePath?: string; page?: number | null; positions: EvidenceMark[]; caption?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath || !page) { setErr('Prancha indisponível (projeto sem ficheiro ou página).'); setSrc(null); return; }
    let cancelled = false;
    setLoading(true); setErr(null); setSrc(null);
    renderPageWithMark(filePath, page, positions)
      .then(d => { if (!cancelled) setSrc(d); })
      .catch(e => { if (!cancelled) setErr(e?.message || 'Falha a renderizar a prancha.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, page, JSON.stringify(positions)]);

  return (
    <div className="space-y-1">
      {loading && <div className="text-xs text-muted-foreground py-6 text-center">A renderizar prancha…</div>}
      {err && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/40 p-2 text-xs text-destructive whitespace-pre-wrap break-words">
          {err}
        </div>
      )}
      {src && <img src={src} alt="Prancha com marcação" className="rounded-lg border border-border w-full bg-muted" />}
      {caption && <p className="text-[11px] text-muted-foreground italic px-0.5">{caption}</p>}
    </div>
  );
}
