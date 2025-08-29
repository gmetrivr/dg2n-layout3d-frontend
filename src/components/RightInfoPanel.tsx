import { Pencil, Copy, Trash2, Check } from 'lucide-react';
import { Button } from "@/shadcn/components/ui/button";
import { useState } from 'react';

interface LocationData {
  blockName: string;
  floorIndex: number;
  posX: number;
  posY: number;
  posZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  brand: string;
  glbUrl?: string;
  _updateTimestamp?: number;
}

interface FloorPlateData {
  surfaceId?: string;
  area?: number;
  centroid?: [number, number, number];
  bbox?: {
    min: [number, number];
    max: [number, number];
  };
  meshName?: string;
  layerSource?: string;
  brand: string;
}

interface RightInfoPanelProps {
  // Selected items
  selectedLocation?: LocationData | null;
  selectedFloorPlate?: FloorPlateData | null;
  
  // Mode flags
  editMode: boolean;
  editFloorplatesMode: boolean;
  
  // Data maps for tracking changes
  movedFixtures: Map<string, { originalPosition: [number, number, number]; newPosition: [number, number, number] }>;
  rotatedFixtures: Map<string, { originalRotation: [number, number, number]; rotationOffset: number }>;
  modifiedFixtureBrands: Map<string, { originalBrand: string; newBrand: string }>;
  modifiedFloorPlates: Map<string, any>;
  fixtureTypeMap: Map<string, string>;
  
  // Event handlers
  onCloseLocation: () => void;
  onCloseFloorPlate: () => void;
  onOpenFixtureTypeModal: () => void;
  onOpenBrandModal: () => void;
  onRotateFixture: (angle: number) => void;
  onResetLocation: (location: LocationData) => void;
  onResetFloorPlate: (plateData: FloorPlateData, modifiedData: any) => void;
  onDuplicateFixture?: (location: LocationData) => void;
  onDeleteFixture?: (location: LocationData) => void;
}

export function RightInfoPanel({
  selectedLocation,
  selectedFloorPlate,
  editMode,
  editFloorplatesMode,
  movedFixtures,
  rotatedFixtures,
  modifiedFixtureBrands,
  modifiedFloorPlates,
  fixtureTypeMap,
  onCloseLocation,
  onCloseFloorPlate,
  onOpenFixtureTypeModal,
  onOpenBrandModal,
  onRotateFixture,
  onResetLocation,
  onResetFloorPlate,
  onDuplicateFixture,
  onDeleteFixture,
}: RightInfoPanelProps) {
  const [isCustomRotationMode, setIsCustomRotationMode] = useState(false);
  const [customRotationValue, setCustomRotationValue] = useState('');
  
  const handleCustomRotation = () => {
    const angle = parseFloat(customRotationValue);
    if (!isNaN(angle)) {
      onRotateFixture(angle);
      setIsCustomRotationMode(false);
      setCustomRotationValue('');
    }
  };

  const handleCancelCustomRotation = () => {
    setIsCustomRotationMode(false);
    setCustomRotationValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCustomRotation();
    } else if (e.key === 'Escape') {
      handleCancelCustomRotation();
    }
  };
  
  // Location Info Panel
  if (selectedLocation && !editFloorplatesMode) {
    const key = `${selectedLocation.blockName}-${selectedLocation.posX}-${selectedLocation.posY}-${selectedLocation.posZ}`;
    const movedData = movedFixtures.get(key);
    const rotatedData = rotatedFixtures.get(key);
    const brandData = modifiedFixtureBrands.get(key);
    const hasMoved = movedData !== undefined;
    const hasRotated = rotatedData !== undefined;
    const hasBrandChanged = brandData !== undefined;
    const hasChanges = hasMoved || hasRotated || hasBrandChanged;
    
    return (
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg w-64">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Location Info</h3>
          <button 
            onClick={onCloseLocation}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </button>
        </div>
        <div className="space-y-1 text-xs">
          <div><span className="font-medium">Block:</span> {selectedLocation.blockName}</div>
          <div className="flex items-center justify-between">
            <span><span className="font-medium">Type:</span> {fixtureTypeMap.get(selectedLocation.blockName) || 'Unknown'}</span>
            {editMode && (
              <button
                onClick={onOpenFixtureTypeModal}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors ml-2"
                title="Change fixture type"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div style={{ color: hasBrandChanged ? '#ef4444' : 'inherit' }}>
              <span className="font-medium">Brand:</span> {hasBrandChanged ? brandData?.originalBrand : selectedLocation.brand}
            </div>
            {editMode && (
              <button
                onClick={onOpenBrandModal}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Change brand"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {hasBrandChanged && (
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Brand:</span> {brandData?.newBrand}
            </div>
          )}
          <div><span className="font-medium">Floor:</span> {selectedLocation.floorIndex}</div>
          <div style={{ color: hasMoved ? '#ef4444' : 'inherit' }}>
            <span className="font-medium">Position:</span> ({selectedLocation.posX.toFixed(2)}, {selectedLocation.posY.toFixed(2)}, {selectedLocation.posZ.toFixed(2)})
          </div>
          {hasMoved && movedData && (
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Position:</span> ({movedData.newPosition[0].toFixed(2)}, {movedData.newPosition[1].toFixed(2)}, {movedData.newPosition[2].toFixed(2)})
            </div>
          )}
          <div style={{ color: hasRotated ? '#ef4444' : 'inherit' }}>
            <span className="font-medium">Rotation:</span> ({selectedLocation.rotationX.toFixed(2)}°, {selectedLocation.rotationY.toFixed(2)}°, {selectedLocation.rotationZ.toFixed(2)}°)
          </div>
          {hasRotated && rotatedData && (
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Rotation:</span> ({selectedLocation.rotationX.toFixed(2)}°, {((selectedLocation.rotationY + rotatedData.rotationOffset) % 360).toFixed(2)}°, {selectedLocation.rotationZ.toFixed(2)}°)
            </div>
          )}
        </div>
        {editMode && (
          <div className="mt-3 pt-2 border-t border-border">
            <div className="flex gap-1 mb-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRotateFixture(-90)}
                className="text-xs px-2 py-1 h-auto flex-1"
              >
                Rotate -90°
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRotateFixture(90)}
                className="text-xs px-2 py-1 h-auto flex-1"
              >
                Rotate +90°
              </Button>
            </div>
            <div className="flex gap-1 mb-2">
              {!isCustomRotationMode ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsCustomRotationMode(true)}
                  className="text-xs px-2 py-1 h-auto w-full"
                >
                  Rotate Custom
                </Button>
              ) : (
                <div className="flex gap-1 w-full">
                  <input
                    type="number"
                    value={customRotationValue}
                    onChange={(e) => setCustomRotationValue(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Angle"
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCustomRotation}
                    className="text-xs px-2 py-1 h-auto"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex gap-1">
              {onDuplicateFixture && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDuplicateFixture(selectedLocation)}
                  className="text-xs flex items-center justify-center gap-1 flex-1"
                >
                  <Copy className="h-3 w-3" />
                  Duplicate
                </Button>
              )}
              {onDeleteFixture && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onDeleteFixture(selectedLocation)}
                  className="text-xs flex items-center justify-center gap-1 flex-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
        {hasChanges && (
          <div className={`${editMode ? '' : 'mt-3 pt-2 border-t border-border'}`}>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onResetLocation(selectedLocation)}
              className="w-full text-xs"
            >
              Reset
            </Button>
          </div>
        )}
      </div>
    );
  }
  
  // Floor Plate Info Panel
  if (selectedFloorPlate && editFloorplatesMode) {
    const key = selectedFloorPlate.meshName || `${selectedFloorPlate.surfaceId}-${selectedFloorPlate.brand}`;
    const modifiedData = modifiedFloorPlates.get(key);
    const hasBrandChanged = modifiedData !== undefined;
    const originalBrand = modifiedData?.originalBrand || selectedFloorPlate.brand;
    const currentBrand = selectedFloorPlate.brand;
    
    return (
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg w-64">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Floor Plate Info</h3>
          <button 
            onClick={onCloseFloorPlate}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </button>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <div style={{ color: hasBrandChanged ? '#ef4444' : 'inherit' }}>
              <span className="font-medium">Brand:</span> {hasBrandChanged ? originalBrand : (currentBrand || 'Unknown')}
            </div>
            <button
              onClick={onOpenBrandModal}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Change brand"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          {hasBrandChanged && (
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Brand:</span> {currentBrand}
            </div>
          )}
          <div><span className="font-medium">Surface ID:</span> {selectedFloorPlate.surfaceId || 'Unknown'}</div>
          <div><span className="font-medium">Area:</span> {selectedFloorPlate.area ? `${selectedFloorPlate.area.toFixed(2)} sqm` : 'Unknown'}</div>
          {selectedFloorPlate.centroid && (
            <div><span className="font-medium">Centroid:</span> ({selectedFloorPlate.centroid[0]?.toFixed(2)}, {selectedFloorPlate.centroid[1]?.toFixed(2)}, {selectedFloorPlate.centroid[2]?.toFixed(2)})</div>
          )}
          {selectedFloorPlate.bbox && (
            <>
              <div><span className="font-medium">Bbox Min:</span> ({selectedFloorPlate.bbox.min[0]?.toFixed(2)}, {selectedFloorPlate.bbox.min[1]?.toFixed(2)})</div>
              <div><span className="font-medium">Bbox Max:</span> ({selectedFloorPlate.bbox.max[0]?.toFixed(2)}, {selectedFloorPlate.bbox.max[1]?.toFixed(2)})</div>
            </>
          )}
          <div><span className="font-medium">Mesh:</span> {selectedFloorPlate.meshName || 'Unknown'}</div>
          {selectedFloorPlate.layerSource && (
            <div><span className="font-medium">Layer:</span> {selectedFloorPlate.layerSource}</div>
          )}
        </div>
        {hasBrandChanged && (
          <div className="mt-3 pt-2 border-t border-border">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onResetFloorPlate(selectedFloorPlate, modifiedData)}
              className="w-full text-xs"
            >
              Reset
            </Button>
          </div>
        )}
      </div>
    );
  }
  
  return null;
}