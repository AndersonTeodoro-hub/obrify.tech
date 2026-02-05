import { useEffect, useRef, useState } from 'react';
import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface PanoramaViewerProps {
  src: string;
  className?: string;
}

export function PanoramaViewer({ src, className }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);
    setError(null);

    // Destroy existing viewer
    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }

    try {
      viewerRef.current = new Viewer({
        container: containerRef.current,
        panorama: src,
        defaultYaw: 0,
        defaultPitch: 0,
        defaultZoomLvl: 50,
        navbar: ['zoom', 'move', 'fullscreen'],
        loadingTxt: '',
        touchmoveTwoFingers: false,
        mousewheelCtrlKey: false,
      });

      viewerRef.current.addEventListener('ready', () => {
        setIsLoading(false);
      });

      viewerRef.current.addEventListener('load-progress', (e) => {
        // Loading progress, could add a progress bar here
      });
    } catch (err) {
      setError('Failed to load panorama viewer');
      setIsLoading(false);
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [src]);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center w-full h-full bg-black/50", className)}>
        <p className="text-white/70">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full h-full", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}
      <div 
        ref={containerRef} 
        className="w-full h-full"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}
