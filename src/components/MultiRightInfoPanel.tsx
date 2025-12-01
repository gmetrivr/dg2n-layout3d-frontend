import { Pencil, Trash2, Check, Link, AlignHorizontalDistributeStart, AlignHorizontalDistributeCenter, AlignHorizontalDistributeEnd, AlignVerticalDistributeStart, AlignVerticalDistributeCenter, AlignVerticalDistributeEnd } from 'lucide-react';
import { Button } from "@/shadcn/components/ui/button";
import { useState } from 'react';

interface LocationData {
  blockName: string;
  floorIndex: number;
  originX?: number;
  originY?: number;
  posX: number;
  posY: number;
  posZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  brand: string;
  count: number;
  hierarchy: number;
  glbUrl?: string;
  _updateTimestamp?: number;
  _ingestionTimestamp?: number;
  // Original state (from CSV ingestion)
  originalBlockName?: string;
  originalPosX?: number;
  originalPosY?: number;
  originalPosZ?: number;
  originalRotationX?: number;
  originalRotationY?: number;
  originalRotationZ?: number;
  originalBrand?: string;
  originalCount?: number;
  originalHierarchy?: number;
  // Modification tracking flags
  wasMoved?: boolean;
  wasRotated?: boolean;
  wasTypeChanged?: boolean;
  wasBrandChanged?: boolean;
  wasCountChanged?: boolean;
  wasHierarchyChanged?: boolean;
}


interface MultiRightInfoPanelProps {
  selectedLocations: LocationData[];
  editMode: boolean;
  fixtureTypeMap: Map<string, string>;
  transformSpace?: 'world' | 'local';
  availableFloorIndices?: number[];
  floorNames?: Map<number, string>;
  floorDisplayOrder?: number[];
  onClose: () => void;
  onOpenBrandModal?: () => void;
  onRotateFixture?: (angle: number) => void;
  onResetLocation?: (location: LocationData) => void;
  onDeleteFixtures?: (locations: LocationData[]) => void;
  onMergeFixtures?: (locations: LocationData[]) => void;
  canMergeFixtures?: (locations: LocationData[], fixtureTypeMap: Map<string, string>) => boolean;
  onCountChange?: (locations: LocationData[], newCount: number) => void;
  onHierarchyChange?: (locations: LocationData[], newHierarchy: number) => void;
  onFloorChange?: (locations: LocationData[], newFloorIndex: number, keepSamePosition?: boolean) => void;
  onAlignFixtures?: (locations: LocationData[], alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom', transformSpace: 'world' | 'local') => void;
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
  fixtureTypeMap,
  transformSpace = 'world',
  availableFloorIndices = [],
  floorNames = new Map(),
  floorDisplayOrder = [],
  onClose,
  onOpenBrandModal,
  onRotateFixture,
  onResetLocation,
  onDeleteFixtures,
  onMergeFixtures,
  canMergeFixtures,
  onCountChange,
  onHierarchyChange,
  onFloorChange,
  onAlignFixtures,
}: MultiRightInfoPanelProps) {
  const [isCustomRotationMode, setIsCustomRotationMode] = useState(false);
  const [customRotationValue, setCustomRotationValue] = useState('');
  const [isEditingCount, setIsEditingCount] = useState(false);
  const [countValue, setCountValue] = useState('');
  const [isEditingHierarchy, setIsEditingHierarchy] = useState(false);
  const [hierarchyValue, setHierarchyValue] = useState('');
  const [isEditingFloor, setIsEditingFloor] = useState(false);
  const [floorValue, setFloorValue] = useState('');
  const [keepSamePosition, setKeepSamePosition] = useState(false);
  
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
  
  const handleCountEdit = () => {
    // Allow editing count only when all selected are WALL-BAY
    if (commonFixtureType === 'WALL-BAY') {
      setIsEditingCount(true);
      if (commonCount !== "Multiple Values" && commonCount !== "N/A") {
        setCountValue(commonCount.toString());
      } else {
        setCountValue('');
      }
    }
  };
  
  const handleCountSave = () => {
    const newCount = parseInt(countValue);
    if (!isNaN(newCount) && newCount > 0 && onCountChange) {
      onCountChange(selectedLocations, newCount);
    }
    setIsEditingCount(false);
    setCountValue('');
  };
  
  const handleCountCancel = () => {
    setIsEditingCount(false);
    setCountValue('');
  };
  
  const handleCountKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCountSave();
    } else if (e.key === 'Escape') {
      handleCountCancel();
    }
  };
  
  const handleHierarchyEdit = () => {
    setIsEditingHierarchy(true);
    if (commonHierarchy !== "Multiple Values" && commonHierarchy !== "N/A") {
      setHierarchyValue(commonHierarchy.toString());
    } else {
      setHierarchyValue('');
    }
  };
  
  const handleHierarchySave = () => {
    const newHierarchy = parseInt(hierarchyValue);
    if (!isNaN(newHierarchy) && onHierarchyChange) {
      onHierarchyChange(selectedLocations, newHierarchy);
    }
    setIsEditingHierarchy(false);
    setHierarchyValue('');
  };
  
  const handleHierarchyCancel = () => {
    setIsEditingHierarchy(false);
    setHierarchyValue('');
  };
  
  const handleHierarchyKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleHierarchySave();
    } else if (e.key === 'Escape') {
      handleHierarchyCancel();
    }
  };

  const handleFloorEdit = () => {
    setIsEditingFloor(true);
    setKeepSamePosition(false);
    const commonFloor = getCommonValue(selectedLocations.map(loc => loc.floorIndex));
    if (commonFloor !== "Multiple Values" && commonFloor !== "N/A") {
      setFloorValue(commonFloor.toString());
    } else if (availableFloorIndices.length > 0) {
      setFloorValue(availableFloorIndices[0].toString());
    }
  };

  const handleFloorSave = () => {
    const newFloorIndex = parseInt(floorValue);
    // Validate floor index is in available floors
    if (!isNaN(newFloorIndex) && availableFloorIndices.includes(newFloorIndex) && onFloorChange) {
      onFloorChange(selectedLocations, newFloorIndex, keepSamePosition);
    }
    setIsEditingFloor(false);
    setFloorValue('');
    setKeepSamePosition(false);
  };

  const handleFloorCancel = () => {
    setIsEditingFloor(false);
    setFloorValue('');
    setKeepSamePosition(false);
  };

  const handleFloorKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFloorSave();
    } else if (e.key === 'Escape') {
      handleFloorCancel();
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
  const counts = selectedLocations.map(loc => loc.count);
  const hierarchies = selectedLocations.map(loc => loc.hierarchy);

  // Check if any fixtures have been modified using embedded flags
  const hasAnyChanges = selectedLocations.some(location => 
    location.wasMoved || location.wasRotated || location.wasTypeChanged || 
    location.wasBrandChanged || location.wasCountChanged || location.wasHierarchyChanged
  );

  // Check if brands have been changed and get effective brands
  const effectiveBrands = selectedLocations.map(location => location.brand);

  // Check if any properties have been changed (use embedded flags)
  const hasAnyBrandChanges = selectedLocations.some(location => location.wasBrandChanged || false);
  const hasAnyCountChanges = selectedLocations.some(location => location.wasCountChanged || false);
  const hasAnyHierarchyChanges = selectedLocations.some(location => location.wasHierarchyChanged || false);

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
  const commonCount = getCommonValue(counts);
  const commonHierarchy = getCommonValue(hierarchies);

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

        <div className="flex items-center justify-between">
          <span><span className="font-medium">Floor:</span> {
            commonFloor === "Multiple Values" || commonFloor === "N/A"
              ? commonFloor
              : (floorNames.get(commonFloor as number) || `Floor ${commonFloor}`)
          }</span>
          {editMode && onFloorChange && (
            <button
              onClick={handleFloorEdit}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Change floor"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>

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
        
        <div className="flex items-center justify-between">
          <div style={{ color: hasAnyCountChanges ? '#ef4444' : 'inherit' }}>
            <span className="font-medium">Count:</span> {commonCount === "Multiple Values" || commonCount === "N/A" ? commonCount : String(commonCount)}
          </div>
          {editMode && onCountChange && commonFixtureType === 'WALL-BAY' && (
            <button
              onClick={handleCountEdit}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Change count"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <div style={{ color: hasAnyHierarchyChanges ? '#ef4444' : 'inherit' }}>
            <span className="font-medium">Hierarchy:</span> {commonHierarchy === "Multiple Values" || commonHierarchy === "N/A" ? commonHierarchy : String(commonHierarchy)}
          </div>
          {editMode && onHierarchyChange && (
            <button
              onClick={handleHierarchyEdit}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Change hierarchy"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      
      {isEditingCount && commonFixtureType === 'WALL-BAY' && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="flex gap-1 mb-2">
            <input
              type="number"
              value={countValue}
              onChange={(e) => setCountValue(e.target.value)}
              onKeyDown={handleCountKeyPress}
              placeholder="Count"
              min="1"
              className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
              autoFocus
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleCountSave}
              className="text-xs px-2 py-1 h-auto"
            >
              <Check className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      
      {isEditingHierarchy && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="flex gap-1 mb-2">
            <input
              type="number"
              value={hierarchyValue}
              onChange={(e) => setHierarchyValue(e.target.value)}
              onKeyDown={handleHierarchyKeyPress}
              placeholder="Hierarchy"
              className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
              autoFocus
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleHierarchySave}
              className="text-xs px-2 py-1 h-auto"
            >
              <Check className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {isEditingFloor && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="flex gap-1 mb-2">
            <select
              value={floorValue}
              onChange={(e) => setFloorValue(e.target.value)}
              onKeyDown={handleFloorKeyPress}
              className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
              autoFocus
            >
              {(() => {
                // Sort by floor display order if available, otherwise by index
                const sortedIndices = floorDisplayOrder.length > 0
                  ? floorDisplayOrder.filter(idx => availableFloorIndices.includes(idx))
                  : [...availableFloorIndices].sort((a, b) => a - b);

                return sortedIndices.map(floorIndex => (
                  <option key={floorIndex} value={floorIndex}>
                    {floorNames.get(floorIndex) || `Floor ${floorIndex}`}
                  </option>
                ));
              })()}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={handleFloorSave}
              className="text-xs px-2 py-1 h-auto"
            >
              <Check className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={keepSamePosition}
                onChange={(e) => setKeepSamePosition(e.target.checked)}
                className="cursor-pointer"
              />
              <span>Keep same position values</span>
            </label>
          </div>
        </div>
      )}

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

          {onAlignFixtures && selectedLocations.length > 1 && (
            <div className="mt-3 pt-2 border-t border-border">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Align</div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAlignFixtures(selectedLocations, 'left', transformSpace)}
                    className="text-xs flex items-center justify-center flex-1 px-1"
                    title="Align Left"
                  >
                    <AlignHorizontalDistributeStart className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAlignFixtures(selectedLocations, 'center-h', transformSpace)}
                    className="text-xs flex items-center justify-center flex-1 px-1"
                    title="Align Center Horizontal"
                  >
                    <AlignHorizontalDistributeCenter className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAlignFixtures(selectedLocations, 'right', transformSpace)}
                    className="text-xs flex items-center justify-center flex-1 px-1"
                    title="Align Right"
                  >
                    <AlignHorizontalDistributeEnd className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAlignFixtures(selectedLocations, 'top', transformSpace)}
                    className="text-xs flex items-center justify-center flex-1 px-1"
                    title="Align Top"
                  >
                    <AlignVerticalDistributeStart className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAlignFixtures(selectedLocations, 'center-v', transformSpace)}
                    className="text-xs flex items-center justify-center flex-1 px-1"
                    title="Align Center Vertical"
                  >
                    <AlignVerticalDistributeCenter className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAlignFixtures(selectedLocations, 'bottom', transformSpace)}
                    className="text-xs flex items-center justify-center flex-1 px-1"
                    title="Align Bottom"
                  >
                    <AlignVerticalDistributeEnd className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {canMergeFixtures && onMergeFixtures && canMergeFixtures(selectedLocations, fixtureTypeMap) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMergeFixtures(selectedLocations)}
              className="w-full text-xs flex items-center justify-center gap-1 mt-2"
            >
              <Link className="h-3 w-3" />
              Merge ({selectedLocations.length})
            </Button>
          )}
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
