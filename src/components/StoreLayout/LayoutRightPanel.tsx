import { Button } from '@/shadcn/components/ui/button';
import { Pencil, RotateCcw, X } from 'lucide-react';
import type { LocationData } from '../../hooks/useFixtureSelection';

interface LayoutRightPanelProps {
  location: LocationData;
  fixtureType: string;
  onClose: () => void;
  onEditBrand: () => void;
  onEditFixtureType: () => void;
  onReset: () => void;
}

export function LayoutRightPanel({
  location,
  fixtureType,
  onClose,
  onEditBrand,
  onEditFixtureType,
  onReset,
}: LayoutRightPanelProps) {
  const isModified = location.wasBrandChanged || location.wasTypeChanged;

  return (
    <div className="absolute top-4 right-4 z-40 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg w-72">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold truncate max-w-[200px]">{location.blockName}</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 text-xs">
        {/* Fixture Type */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Fixture Type:</span>
          <div className="flex items-center gap-1">
            {location.wasTypeChanged && location.originalBlockName ? (
              <div className="flex flex-col items-end">
                <span className="line-through" style={{ color: '#ef4444' }}>
                  {location.originalBlockName}
                </span>
                <span style={{ color: '#22c55e' }}>{fixtureType}</span>
              </div>
            ) : (
              <span className="font-medium">{fixtureType}</span>
            )}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEditFixtureType}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Brand */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Brand:</span>
          <div className="flex items-center gap-1">
            {location.wasBrandChanged && location.originalBrand ? (
              <div className="flex flex-col items-end">
                <span className="line-through" style={{ color: '#ef4444' }}>
                  {location.originalBrand}
                </span>
                <span style={{ color: '#22c55e' }}>{location.brand}</span>
              </div>
            ) : (
              <span className="font-medium">{location.brand}</span>
            )}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEditBrand}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="border-t border-border my-2" />

        {/* Read-only info */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Floor:</span>
          <span className="font-medium">{location.floorIndex}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Position:</span>
          <span className="font-medium font-mono text-[10px]">
            {location.posX.toFixed(2)}, {location.posY.toFixed(2)}, {location.posZ.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Count:</span>
          <span className="font-medium">{location.count}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Hierarchy:</span>
          <span className="font-medium">{location.hierarchy}</span>
        </div>

        {location.fixtureId && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fixture ID:</span>
            <span className="font-medium font-mono text-[10px] truncate max-w-[140px]">
              {location.fixtureId}
            </span>
          </div>
        )}

        {/* Reset button */}
        {isModified && (
          <>
            <div className="border-t border-border my-2" />
            <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={onReset}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset Changes
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
