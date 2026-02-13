import { useState, useCallback, useRef, useEffect } from 'react';
import type { FloorOutline } from '../utils/floorOutlineExtractor';

export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number; // pixels per meter
}

export function useLayoutViewport() {
  const [viewport, setViewport] = useState<ViewportState>({ panX: 0, panY: 0, zoom: 40 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Attach wheel listener as non-passive so preventDefault works
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;

      // Capture rect before entering the state updater
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      setViewport((prev) => {
        const newZoom = Math.max(5, Math.min(500, prev.zoom * factor));
        const newPanX = mx - (mx - prev.panX) * (newZoom / prev.zoom);
        const newPanY = my - (my - prev.panY) * (newZoom / prev.zoom);
        return { panX: newPanX, panY: newPanY, zoom: newZoom };
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (e.target as SVGElement).tagName === 'svg')) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    setViewport((prev) => ({
      ...prev,
      panX: prev.panX + dx,
      panY: prev.panY + dy,
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const fitToBounds = useCallback(
    (bounds: FloorOutline['bounds'], containerWidth: number, containerHeight: number) => {
      const worldW = bounds.maxX - bounds.minX;
      const worldH = bounds.maxY - bounds.minY;
      if (worldW <= 0 || worldH <= 0) return;

      const padding = 60; // px
      const availW = containerWidth - padding * 2;
      const availH = containerHeight - padding * 2;

      const zoom = Math.min(availW / worldW, availH / worldH);
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;

      setViewport({
        zoom,
        panX: containerWidth / 2 - centerX * zoom,
        panY: containerHeight / 2 - centerY * zoom,
      });
    },
    []
  );

  return {
    viewport,
    svgRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    fitToBounds,
  };
}
