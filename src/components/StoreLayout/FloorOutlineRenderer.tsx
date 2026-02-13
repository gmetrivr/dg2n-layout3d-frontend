import { useMemo } from 'react';
import type { FloorOutline } from '../../utils/floorOutlineExtractor';

interface FloorOutlineRendererProps {
  outline: FloorOutline;
  zoom: number;
}

export function FloorOutlineRenderer({ outline, zoom }: FloorOutlineRendererProps) {
  // Path is in world coordinates — parent <g> handles pan/zoom transform
  const pathData = useMemo(() => {
    if (outline.edges.length === 0) return '';

    const parts: string[] = [];
    for (const [[x1, y1], [x2, y2]] of outline.edges) {
      parts.push(`M${x1},${y1}L${x2},${y2}`);
    }
    return parts.join('');
  }, [outline]);

  return (
    <g>
      {/* Floor outline edges */}
      {pathData && (
        <path
          d={pathData}
          fill="none"
          stroke="#334155"
          strokeWidth={1.5 / zoom}
          opacity={0.8}
          className="dark:stroke-slate-300"
        />
      )}

      {/* Columns */}
      {outline.columns.map((col, i) => (
        <rect
          key={`col-${i}`}
          x={col.cx - col.width / 2}
          y={col.cy - col.depth / 2}
          width={col.width}
          height={col.depth}
          fill="#64748b"
          opacity={0.7}
          stroke="#334155"
          strokeWidth={1 / zoom}
          className="dark:fill-slate-500"
        />
      ))}
    </g>
  );
}
