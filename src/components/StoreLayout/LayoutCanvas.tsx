import { useRef, useEffect, useMemo } from 'react';
import { FloorOutlineRenderer } from './FloorOutlineRenderer';
import { FixtureSvgRenderer } from './FixtureSvgRenderer';
import { useLayoutViewport } from '../../hooks/useLayoutViewport';
import type { FloorOutline } from '../../utils/floorOutlineExtractor';
import type { LocationData } from '../../hooks/useFixtureSelection';
import { generateFixtureUID } from '../../hooks/useFixtureSelection';

interface LayoutCanvasProps {
  locationData: LocationData[];
  floorOutline: FloorOutline | null;
  selectedFloor: number;
  visibleFixtureTypes: string[];
  visibleBrands: string[];
  fixtureTypeMap: Map<string, string>;
  brandCategoryMapping: Record<string, string>;
  selectedLocation: LocationData | null;
  onSelectLocation: (location: LocationData | null) => void;
}

export function LayoutCanvas({
  locationData,
  floorOutline,
  selectedFloor,
  visibleFixtureTypes,
  visibleBrands,
  fixtureTypeMap,
  brandCategoryMapping,
  selectedLocation,
  onSelectLocation,
}: LayoutCanvasProps) {
  const {
    viewport,
    svgRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    fitToBounds,
  } = useLayoutViewport();

  // Fit to bounds on first load when outline is available
  const hasFitted = useRef(false);
  useEffect(() => {
    if (floorOutline && svgRef.current && !hasFitted.current) {
      const rect = svgRef.current.getBoundingClientRect();
      fitToBounds(floorOutline.bounds, rect.width, rect.height);
      hasFitted.current = true;
    }
  }, [floorOutline, fitToBounds, svgRef]);

  // Reset fit flag when floor changes
  useEffect(() => {
    hasFitted.current = false;
  }, [selectedFloor]);

  // Filter visible fixtures (memoized — only changes when data/filters change, NOT on pan/zoom)
  const showAllTypes = visibleFixtureTypes.length === 0 || visibleFixtureTypes.includes('all');
  const showAllBrands = visibleBrands.length === 0 || visibleBrands.includes('all');

  const visibleFixtures = useMemo(() =>
    locationData.filter((loc) => {
      if (loc.forDelete) return false;
      if (loc.floorIndex !== selectedFloor) return false;
      if (!showAllTypes) {
        const ft = fixtureTypeMap.get(loc.blockName) || loc.blockName;
        if (!visibleFixtureTypes.includes(ft)) return false;
      }
      if (!showAllBrands) {
        if (!visibleBrands.includes(loc.brand)) return false;
      }
      return true;
    }),
    [locationData, selectedFloor, showAllTypes, showAllBrands, visibleFixtureTypes, visibleBrands, fixtureTypeMap]
  );

  const handleBackgroundClick = () => {
    onSelectLocation(null);
  };

  // Pan/zoom via a single <g> transform — children use world coordinates
  const transformStr = `translate(${viewport.panX},${viewport.panY}) scale(${viewport.zoom})`;

  return (
    <svg
      ref={svgRef}
      className="w-full h-full bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 select-none"
      onMouseDown={(e) => {
        if (e.button === 1 || (e.target as SVGElement) === svgRef.current) {
          handleMouseDown(e);
        }
        if ((e.target as SVGElement) === svgRef.current) {
          handleBackgroundClick();
        }
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <g transform={transformStr}>
        {/* Floor outline — coordinates are in world space */}
        {floorOutline && <FloorOutlineRenderer outline={floorOutline} zoom={viewport.zoom} />}

        {/* Fixtures — positioned in world space */}
        {visibleFixtures.map((loc) => {
          const uid = generateFixtureUID(loc);
          const ft = fixtureTypeMap.get(loc.blockName) || loc.blockName;
          const isSelected = selectedLocation
            ? generateFixtureUID(selectedLocation) === uid
            : false;

          return (
            <FixtureSvgRenderer
              key={uid}
              location={loc}
              fixtureType={ft}
              svgX={loc.posX}
              svgY={-loc.posY}
              zoom={viewport.zoom}
              isSelected={isSelected}
              brandCategoryMapping={brandCategoryMapping}
              onClick={(location) => onSelectLocation(location)}
            />
          );
        })}
      </g>
    </svg>
  );
}
