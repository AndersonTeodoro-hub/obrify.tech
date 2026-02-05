import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ImageViewerWithZoomProps {
  src: string;
  alt: string;
  className?: string;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;

export function ImageViewerWithZoom({ src, alt, className }: ImageViewerWithZoomProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [lastTouchDist, setLastTouchDist] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom and position when image changes
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
    
    if (newZoom !== zoom) {
      // Calculate cursor position relative to container
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cursorX = e.clientX - rect.left - rect.width / 2;
        const cursorY = e.clientY - rect.top - rect.height / 2;
        
        // Adjust position to zoom towards cursor
        const scale = newZoom / zoom;
        setPosition({
          x: cursorX - (cursorX - position.x) * scale,
          y: cursorY - (cursorY - position.y) * scale,
        });
      }
      setZoom(newZoom);
    }
  }, [zoom, position]);

  // Touch distance for pinch
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  // Mouse pan start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    setStartPos({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [zoom, position]);

  // Mouse pan move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPosition({
      x: e.clientX - startPos.x,
      y: e.clientY - startPos.y,
    });
  }, [isPanning, startPos]);

  // Mouse pan end
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = getTouchDistance(e.touches);
      setLastTouchDist(dist);
    } else if (e.touches.length === 1 && zoom > 1) {
      setIsPanning(true);
      setStartPos({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  }, [zoom, position]);

  // Touch move (pinch & pan)
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    if (e.touches.length === 2 && lastTouchDist !== null) {
      // Pinch zoom
      const dist = getTouchDistance(e.touches);
      if (dist) {
        const scale = dist / lastTouchDist;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * scale));
        setZoom(newZoom);
        setLastTouchDist(dist);
      }
    } else if (e.touches.length === 1 && isPanning) {
      // Pan
      setPosition({
        x: e.touches[0].clientX - startPos.x,
        y: e.touches[0].clientY - startPos.y,
      });
    }
  }, [lastTouchDist, zoom, isPanning, startPos]);

  // Touch end
  const handleTouchEnd = useCallback(() => {
    setLastTouchDist(null);
    setIsPanning(false);
  }, []);

  // Double click to reset
  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Keyboard zoom controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP * 2));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP * 2));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex items-center justify-center w-full h-full overflow-hidden select-none",
        zoom > 1 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
        className
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain pointer-events-none transition-transform duration-100"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
        }}
        draggable={false}
      />
      
      {/* Zoom indicator */}
      {zoom !== 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-3 py-1 rounded-full">
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  );
}
