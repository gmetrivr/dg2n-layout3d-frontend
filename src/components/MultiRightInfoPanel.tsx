import { Pencil, Trash2, Check } from 'lucide-react';
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

interface MultiRightInfoPanelProps {
  selectedLocations: LocationData[];
  editMode: boolean;
  movedFixtures: Map<string, { originalPosition: [number, number, number]; newPosition: [number, number, number] }>;
  rotatedFixtures: Map<string, { originalRotation: [number, number, number]; rotationOffset: number }>;
  modifiedFixtureBrands: Map<string, { originalBrand: string; newBrand: string }>;
  fixtureTypeMap: Map<string, string>;
  onClose: () => void;
  onOpenBrandModal?: () => void;
  onRotateFixture?: (angle: number) => void;
  onResetLocation?: (location: LocationData) => void;
  onDeleteFixtures?: (locations: LocationData[]) => void;
}

// Utility function to compare values and return common value or "Multiple Values"
function getCommonValue<T>(values: T[]): T | "Multiple Values" | "N/A" {
  if (values.length === 0) return "N/A";
  const firstValue = values[0];
  const allSame = values.every(value => {
    if (typeof value === 'number' && typeof firstValue === 'number') {
      return Math.abs(value - firstValue) < 0.001;
    }
    return value === firstValue;
  });
  
  return allSame ? firstValue : "Multiple Values";
}

export function MultiRightInfoPanel({
  selectedLocations,
  editMode,
  movedFixtures,
  rotatedFixtures,
  modifiedFixtureBrands,
  fixtureTypeMap,
  onClose,
  onOpenBrandModal,
  onRotateFixture,
  onResetLocation,
  onDeleteFixtures,
}: MultiRightInfoPanelProps) {
  const [isCustomRotationMode, setIsCustomRotationMode] = useState(false);
  const [customRotationValue, setCustomRotationValue] = useState('');
  
  const handleCustomRotation = () => {
    const angle = parseFloat(customRotationValue);
    if (!isNaN(angle)) {
      onRotateFixture?.(angle);
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
  
  if (selectedLocations.length === 0) return null;

  // Extract values for comparison
  const blockNames = selectedLocations.map(loc => loc.blockName);
  const fixtureTypes = selectedLocations.map(loc => fixtureTypeMap.get(loc.blockName) || 'Unknown');
  const brands = selectedLocations.map(loc => loc.brand);
  const floorIndices = selectedLocations.map(loc => loc.floorIndex);
  const positionsX = selectedLocations.map(loc => loc.posX);
  const positionsY = selectedLocations.map(loc => loc.posY);
  const positionsZ = selectedLocations.map(loc => loc.posZ);
  const rotationsX = selectedLocations.map(loc => loc.rotationX);
  const rotationsY = selectedLocations.map(loc => loc.rotationY);
  const rotationsZ = selectedLocations.map(loc => loc.rotationZ);

  // Check if any fixtures have been modified
  const hasAnyChanges = selectedLocations.some(location => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    return movedFixtures.has(key) || rotatedFixtures.has(key) || modifiedFixtureBrands.has(key);
  });

  // Check if brands have been changed and get effective brands
  const effectiveBrands = selectedLocations.map(location => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    const brandData = modifiedFixtureBrands.get(key);
    return brandData ? brandData.newBrand : location.brand;
  });

  // Check if any brand has been changed
  const hasAnyBrandChanges = selectedLocations.some(location => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    return modifiedFixtureBrands.has(key);
  });

  // Get common values
  const commonBlockName = getCommonValue(blockNames);
  const commonFixtureType = getCommonValue(fixtureTypes);
  const commonBrand = getCommonValue(brands);
  const commonEffectiveBrand = getCommonValue(effectiveBrands);
  const commonFloor = getCommonValue(floorIndices);
  const commonPosX = getCommonValue(positionsX);
  const commonPosY = getCommonValue(positionsY);
  const commonPosZ = getCommonValue(positionsZ);
  const commonRotX = getCommonValue(rotationsX);
  const commonRotY = getCommonValue(rotationsY);
  const commonRotZ = getCommonValue(rotationsZ);

  const canEditBrand = editMode; // Allow brand editing even with multiple origin values

  return (
    <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg w-64">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Multiple Fixtures ({selectedLocations.length})</h3>
        <button 
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-1 text-xs">
        <div><span className="font-medium">Block:</span> {commonBlockName === "Multiple Values" || commonBlockName === "N/A" ? commonBlockName : String(commonBlockName)}</div>
        
        <div>
          <span><span className="font-medium">Type:</span> {commonFixtureType === "Multiple Values" || commonFixtureType === "N/A" ? commonFixtureType : String(commonFixtureType)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div style={{ color: hasAnyBrandChanges ? '#ef4444' : 'inherit' }}>
            <span className="font-medium">Brand:</span> {commonBrand === "Multiple Values" || commonBrand === "N/A" ? commonBrand : String(commonBrand)}
          </div>
          {canEditBrand && onOpenBrandModal && (
            <button
              onClick={onOpenBrandModal}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Change brand"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
        
        {hasAnyBrandChanges && commonEffectiveBrand !== commonBrand && (
          <div style={{ color: '#22c55e' }}>
            <span className="font-medium">New Brand:</span> {commonEffectiveBrand === "Multiple Values" || commonEffectiveBrand === "N/A" ? commonEffectiveBrand : String(commonEffectiveBrand)}
          </div>
        )}
        
        <div><span className="font-medium">Floor:</span> {commonFloor === "Multiple Values" || commonFloor === "N/A" ? commonFloor : String(commonFloor)}</div>
        
        <div>
          <span className="font-medium">Position X:</span> {commonPosX === "Multiple Values" || commonPosX === "N/A" ? commonPosX : (commonPosX as number).toFixed(2)}
        </div>
        
        <div>
          <span className="font-medium">Position Y:</span> {commonPosY === "Multiple Values" || commonPosY === "N/A" ? commonPosY : (commonPosY as number).toFixed(2)}
        </div>
        
        <div>
          <span className="font-medium">Position Z:</span> {commonPosZ === "Multiple Values" || commonPosZ === "N/A" ? commonPosZ : (commonPosZ as number).toFixed(2)}
        </div>
        
        <div>
          <span className="font-medium">Rotation X:</span> {commonRotX === "Multiple Values" || commonRotX === "N/A" ? commonRotX : (commonRotX as number).toFixed(2)}°
        </div>
        
        <div>
          <span className="font-medium">Rotation Y:</span> {commonRotY === "Multiple Values" || commonRotY === "N/A" ? commonRotY : (commonRotY as number).toFixed(2)}°
        </div>
        
        <div>
          <span className="font-medium">Rotation Z:</span> {commonRotZ === "Multiple Values" || commonRotZ === "N/A" ? commonRotZ : (commonRotZ as number).toFixed(2)}°
        </div>
      </div>
      
      {editMode && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="flex gap-1 mb-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRotateFixture?.(-90)}
              className="text-xs px-2 py-1 h-auto flex-1"
            >
              Rotate -90°
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRotateFixture?.(90)}
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
          {onDeleteFixtures && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDeleteFixtures(selectedLocations)}
              className="w-full text-xs flex items-center justify-center gap-1 mt-2"
            >
              <Trash2 className="h-3 w-3" />
              Delete All ({selectedLocations.length})
            </Button>
          )}
        </div>
      )}
      
      {hasAnyChanges && (
        <div className={`${editMode ? '' : 'mt-3 pt-2 border-t border-border'}`}>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => selectedLocations.forEach(location => onResetLocation?.(location))}
            className="w-full text-xs"
          >
            Reset All
          </Button>
        </div>
      )}
    </div>
  );
}