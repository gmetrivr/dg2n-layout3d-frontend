import { memo } from 'react';
import { getFixtureSvgPath, getFixtureOffset, getFixtureSize } from '../../utils/fixtureSvgConfig';
import { getBrandCategoryColor } from '../../utils/brandColorUtils';
import type { LocationData } from '../../hooks/useFixtureSelection';

interface FixtureSvgRendererProps {
  location: LocationData;
  fixtureType: string;
  svgX: number;  // world X
  svgY: number;  // world Y (already negated)
  zoom: number;
  isSelected: boolean;
  isHighlighted?: boolean;
  brandCategoryMapping: Record<string, string>;
  onClick: (location: LocationData, e: React.MouseEvent) => void;
  showFixtureId?: boolean;
}

export const FixtureSvgRenderer = memo(function FixtureSvgRenderer({
  location,
  fixtureType,
  svgX,
  svgY,
  zoom,
  isSelected,
  isHighlighted,
  brandCategoryMapping,
  onClick,
  showFixtureId = false,
}: FixtureSvgRendererProps) {
  const svgPath = getFixtureSvgPath(fixtureType);
  const color = getBrandCategoryColor(brandCategoryMapping, location.brand);

  // Per-fixture-type size in world units (meters), derived from SVG viewBox
  const [w, h] = getFixtureSize(fixtureType);
  const halfW = w / 2;
  const halfH = h / 2;

  // Chrome rasterizes <image> SVGs at user-unit dimensions BEFORE applying
  // parent transforms. With sub-pixel world units (e.g. 0.6m) the SVG content
  // is invisible. Fix: render at IMG_SCALE× larger, then scale back down.
  const IMG_SCALE = 100;
  const invScale = 1 / IMG_SCALE;

  // Stroke widths need to be compensated for zoom so they appear constant on screen
  const borderWidth = 2.5 / zoom;
  const indicatorR = 3 / zoom;

  const rotation = -(location.rotationZ || 0);
  const [offsetX, offsetY] = getFixtureOffset(fixtureType);
  const isModified = location.wasBrandChanged || location.wasTypeChanged;

  // Wall-bay count logic: render N copies side-by-side along local X, centered
  const count = location.count || 1;
  const totalWidth = w * count;
  const totalHalfWidth = totalWidth / 2;

  return (
    <g
      transform={`translate(${svgX}, ${svgY}) rotate(${rotation}) translate(${offsetX}, ${offsetY})`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(location, e);
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* Render count copies side-by-side along local X axis, centered */}
      {Array.from({ length: count }, (_, i) => {
        const xOff = -totalHalfWidth + halfW + i * w;
        return (
          <g key={i} transform={`translate(${xOff}, 0)`}>
            {/* Background fill with brand category color */}
            <rect
              x={-halfW}
              y={-halfH}
              width={w}
              height={h}
              rx={2 / zoom}
              fill={color}
              opacity={0.6}
            />
            {/* Fixture SVG shape — rendered at IMG_SCALE× user units then scaled down
                so Chrome rasterizes at sufficient resolution */}
            <g transform={`scale(${invScale})`}>
              <image
                href={svgPath}
                x={-halfW * IMG_SCALE}
                y={-halfH * IMG_SCALE}
                width={w * IMG_SCALE}
                height={h * IMG_SCALE}
              />
            </g>
          </g>
        );
      })}

      {/* QR highlight — pulsing yellow double-border */}
      {isHighlighted && (
        <>
          <rect
            x={-totalHalfWidth - borderWidth * 2.5}
            y={-halfH - borderWidth * 2.5}
            width={totalWidth + borderWidth * 5}
            height={h + borderWidth * 5}
            rx={4 / zoom}
            fill="none"
            stroke="#facc15"
            strokeWidth={borderWidth * 1.5}
          >
            <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
          </rect>
          <rect
            x={-totalHalfWidth - borderWidth}
            y={-halfH - borderWidth}
            width={totalWidth + borderWidth * 2}
            height={h + borderWidth * 2}
            rx={3 / zoom}
            fill="none"
            stroke="#facc15"
            strokeWidth={borderWidth}
          />
        </>
      )}

      {/* Selection highlight — covers entire stack */}
      {isSelected && (
        <rect
          x={-totalHalfWidth - borderWidth}
          y={-halfH - borderWidth}
          width={totalWidth + borderWidth * 2}
          height={h + borderWidth * 2}
          rx={3 / zoom}
          fill="none"
          stroke="#ef4444"
          strokeWidth={borderWidth}
        />
      )}

      {/* Modification indicator */}
      {isModified && (
        <circle
          cx={totalHalfWidth - indicatorR}
          cy={-halfH + indicatorR}
          r={indicatorR}
          fill="#f59e0b"
        />
      )}

      {/* Brand label */}
      <text
        y={halfH + 10 / zoom}
        textAnchor="middle"
        fill="white"
        stroke="black"
        strokeWidth={0.3 / zoom}
        fontSize={Math.max(8, Math.min(11, zoom * 0.25)) * 1.2 / zoom}
        opacity={zoom > 20 ? 1 : 0}
        pointerEvents="none"
      >
        {showFixtureId ? (location.fixtureId || location.blockName) : location.brand}
      </text>

      {/* DEBUG: uncomment to show fixtureType and resolved size
      <text
        y={-halfH - 5 / zoom}
        textAnchor="middle"
        fill="red"
        fontSize={8 / zoom}
        pointerEvents="none"
      >
        {fixtureType} | {w.toFixed(2)}x{h.toFixed(2)}
      </text>
      */}
    </g>
  );
});
