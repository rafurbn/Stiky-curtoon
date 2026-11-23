import { useEffect, useRef } from 'react';
import { getComicDimensions, renderComicToCanvas } from '../lib/cartoonRenderer';
import type { BrandingConfig, ComicScript } from '../types/comic';

interface ComicPreviewCanvasProps {
  comic: ComicScript;
  branding: BrandingConfig;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

export function ComicPreviewCanvas({
  comic,
  branding,
  onCanvasReady,
}: ComicPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dims = getComicDimensions(comic.layout);

  useEffect(() => {
    let active = true;
    const draw = async () => {
      try {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      } catch {
        // Ignore font readiness fallback
      }
      if (!active || !canvasRef.current) return;
      renderComicToCanvas(canvasRef.current, comic, branding);
      onCanvasReady?.(canvasRef.current);
    };
    draw();
    return () => {
      active = false;
    };
  }, [comic, branding, onCanvasReady]);

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <canvas
          ref={canvasRef}
          className="block h-auto w-full select-none"
          aria-label={`Comic strip preview: ${comic.title}`}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-2 font-mono-tabular">
          <span>
            {dims.width} × {dims.height} px
          </span>
          <span aria-hidden="true">·</span>
          <span>Vector Canvas PNG</span>
          <span aria-hidden="true">·</span>
          <span>{comic.layout}</span>
        </div>
        <span>Zero AI image watermark · Crisp Bangla ink</span>
      </div>
    </div>
  );
}
