import { Pencil, Copy, Trash2, Check, SeparatorHorizontal } from 'lucide-react';
import { Button } from "@/shadcn/components/ui/button";
import { useState, useEffect } from 'react';
import { SplitFixtureModal } from './SplitFixtureModal';

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
  setSpawnPointMode?: boolean;
  currentFloorIndex?: number;
  spawnPoints?: Map<number, [number, number, number]>;

  // Data maps for tracking changes
  modifiedFloorPlates: Map<string, any>;
  fixtureTypeMap: Map<string, string>;
  availableFloorIndices?: number[];
  floorNames?: Map<number, string>;
  floorDisplayOrder?: number[];

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
  onSplitFixture?: (location: LocationData, leftCount: number, rightCount: number) => void;
  onCountChange?: (location: LocationData, newCount: number) => void;
  onHierarchyChange?: (location: LocationData, newHierarchy: number) => void;
  onPositionChange?: (location: LocationData, newPosition: [number, number, number]) => void;
  onRotationChange?: (location: LocationData, newRotation: [number, number, number]) => void;
  onFloorChange?: (location: LocationData, newFloorIndex: number) => void;
}

export function RightInfoPanel({
  selectedLocation,
  selectedFloorPlate,
  editMode,
  editFloorplatesMode,
  setSpawnPointMode = false,
  currentFloorIndex,
  spawnPoints = new Map(),
  modifiedFloorPlates,
  fixtureTypeMap,
  availableFloorIndices = [],
  floorNames = new Map(),
  floorDisplayOrder = [],
  onCloseLocation,
  onCloseFloorPlate,
  onOpenFixtureTypeModal,
  onOpenBrandModal,
  onRotateFixture,
  onResetLocation,
  onResetFloorPlate,
  onDuplicateFixture,
  onDeleteFixture,
  onSplitFixture,
  onCountChange,
  onHierarchyChange,
  onPositionChange,
  onRotationChange,
  onFloorChange,
}: RightInfoPanelProps) {
  const [isCustomRotationMode, setIsCustomRotationMode] = useState(false);
  const [customRotationValue, setCustomRotationValue] = useState('');
  const [isEditingCount, setIsEditingCount] = useState(false);
  const [countValue, setCountValue] = useState('');
  const [isEditingHierarchy, setIsEditingHierarchy] = useState(false);
  const [hierarchyValue, setHierarchyValue] = useState('');
  const [isEditingPosition, setIsEditingPosition] = useState(false);
  const [positionValues, setPositionValues] = useState({ x: '', y: '', z: '' });
  const [isEditingRotation, setIsEditingRotation] = useState(false);
  const [rotationValues, setRotationValues] = useState({ x: '', y: '', z: '' });
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [isEditingFloor, setIsEditingFloor] = useState(false);
  const [floorValue, setFloorValue] = useState('');
  
  // Reset all editing states when selectedLocation changes
  useEffect(() => {
    setIsEditingCount(false);
    setCountValue('');
    setIsEditingHierarchy(false);
    setHierarchyValue('');
    setIsEditingPosition(false);
    setPositionValues({ x: '', y: '', z: '' });
    setIsEditingRotation(false);
    setRotationValues({ x: '', y: '', z: '' });
    setIsCustomRotationMode(false);
    setCustomRotationValue('');
    setShowSplitModal(false);
    setIsEditingFloor(false);
    setFloorValue('');
  }, [selectedLocation]);
  
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
  
  const handleCountEdit = () => {
    // Allow editing count only for WALL-BAY type
    const type = selectedLocation ? fixtureTypeMap.get(selectedLocation.blockName) : undefined;
    if (type === 'WALL-BAY') {
      setIsEditingCount(true);
      setCountValue(selectedLocation?.count?.toString() || '1');
    }
  };
  
  const handleCountSave = () => {
    const newCount = parseInt(countValue);
    if (!isNaN(newCount) && newCount > 0 && selectedLocation && onCountChange) {
      onCountChange(selectedLocation, newCount);
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
    setHierarchyValue(selectedLocation?.hierarchy?.toString() || '0');
  };
  
  const handleHierarchySave = () => {
    const newHierarchy = parseInt(hierarchyValue);
    if (!isNaN(newHierarchy) && selectedLocation && onHierarchyChange) {
      onHierarchyChange(selectedLocation, newHierarchy);
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
  
  // Position editing handlers
  const handlePositionEdit = () => {
    setIsEditingPosition(true);
    setPositionValues({
      x: selectedLocation?.posX?.toString() || '0',
      y: selectedLocation?.posY?.toString() || '0',
      z: selectedLocation?.posZ?.toString() || '0'
    });
  };
  
  const handlePositionSave = () => {
    const x = parseFloat(positionValues.x);
    const y = parseFloat(positionValues.y);
    const z = parseFloat(positionValues.z);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z) && selectedLocation && onPositionChange) {
      onPositionChange(selectedLocation, [x, y, z]);
    }
    setIsEditingPosition(false);
    setPositionValues({ x: '', y: '', z: '' });
  };
  
  const handlePositionCancel = () => {
    setIsEditingPosition(false);
    setPositionValues({ x: '', y: '', z: '' });
  };
  
  const handlePositionKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePositionSave();
    } else if (e.key === 'Escape') {
      handlePositionCancel();
    }
  };
  
  // Rotation editing handlers
  const handleRotationEdit = () => {
    setIsEditingRotation(true);
    setRotationValues({
      x: selectedLocation?.rotationX?.toString() || '0',
      y: selectedLocation?.rotationY?.toString() || '0',
      z: selectedLocation?.rotationZ?.toString() || '0'
    });
  };
  
  const handleRotationSave = () => {
    const x = parseFloat(rotationValues.x);
    const y = parseFloat(rotationValues.y);
    const z = parseFloat(rotationValues.z);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z) && selectedLocation && onRotationChange) {
      onRotationChange(selectedLocation, [x, y, z]);
    }
    setIsEditingRotation(false);
    setRotationValues({ x: '', y: '', z: '' });
  };
  
  const handleRotationCancel = () => {
    setIsEditingRotation(false);
    setRotationValues({ x: '', y: '', z: '' });
  };

  const handleSplitConfirm = (leftCount: number, rightCount: number) => {
    if (selectedLocation && onSplitFixture) {
      onSplitFixture(selectedLocation, leftCount, rightCount);
    }
  };
  
  const handleRotationKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRotationSave();
    } else if (e.key === 'Escape') {
      handleRotationCancel();
    }
  };

  // Floor editing handlers
  const handleFloorEdit = () => {
    setIsEditingFloor(true);
    setFloorValue(selectedLocation?.floorIndex?.toString() || '0');
  };

  const handleFloorSave = () => {
    const newFloorIndex = parseInt(floorValue);
    // Validate floor index is in available floors
    if (!isNaN(newFloorIndex) && availableFloorIndices.includes(newFloorIndex) && selectedLocation && onFloorChange) {
      onFloorChange(selectedLocation, newFloorIndex);
    }
    setIsEditingFloor(false);
    setFloorValue('');
  };

  const handleFloorCancel = () => {
    setIsEditingFloor(false);
    setFloorValue('');
  };

  const handleFloorKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFloorSave();
    } else if (e.key === 'Escape') {
      handleFloorCancel();
    }
  };

  // Location Info Panel
  if (selectedLocation && !editFloorplatesMode) {
    // Use embedded modification flags
    const hasMoved = selectedLocation.wasMoved || false;
    const hasRotated = selectedLocation.wasRotated || false;
    const hasBrandChanged = selectedLocation.wasBrandChanged || false;
    const hasCountChanged = selectedLocation.wasCountChanged || false;
    const hasHierarchyChanged = selectedLocation.wasHierarchyChanged || false;
    const hasTypeChanged = selectedLocation.wasTypeChanged || false;
    const hasChanges = hasMoved || hasRotated || hasBrandChanged || hasCountChanged || hasHierarchyChanged || hasTypeChanged;
    
    return (
      <>
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
              <span className="font-medium">Brand:</span> {hasBrandChanged ? selectedLocation.originalBrand : selectedLocation.brand}
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
              <span className="font-medium">New Brand:</span> {selectedLocation.brand}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span><span className="font-medium">Floor:</span> {floorNames.get(selectedLocation.floorIndex) || `Floor ${selectedLocation.floorIndex}`}</span>
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
          <div><span className="font-medium">Origin:</span> ({(selectedLocation as any).originX?.toFixed(2) ?? 0}, {(selectedLocation as any).originY?.toFixed(2) ?? 0})</div>
          <div className="flex items-center justify-between">
            <div style={{ color: hasCountChanged ? '#ef4444' : 'inherit' }}>
              <span className="font-medium">Count:</span> {hasCountChanged ? selectedLocation.originalCount : selectedLocation.count}
            </div>
            {editMode && onCountChange && fixtureTypeMap.get(selectedLocation.blockName) === 'WALL-BAY' && (
              <button
                onClick={handleCountEdit}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Change count"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {hasCountChanged && (
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Count:</span> {selectedLocation.count}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div style={{ color: hasHierarchyChanged ? '#ef4444' : 'inherit' }}>
              <span className="font-medium">Hierarchy:</span> {hasHierarchyChanged ? selectedLocation.originalHierarchy : selectedLocation.hierarchy}
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
          {hasHierarchyChanged && (
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Hierarchy:</span> {selectedLocation.hierarchy}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div style={{ color: hasMoved ? '#ef4444' : 'inherit' }}>
              <span className="font-medium">Position:</span> ({hasMoved && selectedLocation.originalPosX !== undefined ? selectedLocation.originalPosX.toFixed(2) : selectedLocation.posX.toFixed(2)}, {hasMoved && selectedLocation.originalPosY !== undefined ? selectedLocation.originalPosY.toFixed(2) : selectedLocation.posY.toFixed(2)}, {hasMoved && selectedLocation.originalPosZ !== undefined ? selectedLocation.originalPosZ.toFixed(2) : selectedLocation.posZ.toFixed(2)})
            </div>
            {editMode && onPositionChange && (
              <button
                onClick={handlePositionEdit}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Edit position"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {hasMoved && (
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Position:</span> ({selectedLocation.posX.toFixed(2)}, {selectedLocation.posY.toFixed(2)}, {selectedLocation.posZ.toFixed(2)})
            </div>
          )}
          <div className="flex items-center justify-between">
            <div style={{ color: hasRotated ? '#ef4444' : 'inherit' }}>
              <span className="font-medium">Rotation:</span> ({hasRotated && selectedLocation.originalRotationX !== undefined ? selectedLocation.originalRotationX.toFixed(2) : selectedLocation.rotationX.toFixed(2)}°, {hasRotated && selectedLocation.originalRotationY !== undefined ? selectedLocation.originalRotationY.toFixed(2) : selectedLocation.rotationY.toFixed(2)}°, {hasRotated && selectedLocation.originalRotationZ !== undefined ? selectedLocation.originalRotationZ.toFixed(2) : selectedLocation.rotationZ.toFixed(2)}°)
            </div>
            {editMode && onRotationChange && (
              <button
                onClick={handleRotationEdit}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Edit rotation"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {hasRotated && (
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Rotation:</span> ({selectedLocation.rotationX.toFixed(2)}°, {selectedLocation.rotationY.toFixed(2)}°, {selectedLocation.rotationZ.toFixed(2)}°)
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
            {isEditingCount && (
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
            )}
            {isEditingHierarchy && (
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
            )}
            {isEditingFloor && (
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
            )}
            {isEditingPosition && (
              <div className="mb-2 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium w-4">X:</label>
                  <input
                    type="number"
                    value={positionValues.x}
                    onChange={(e) => setPositionValues(prev => ({ ...prev, x: e.target.value }))}
                    onKeyDown={handlePositionKeyPress}
                    step="0.1"
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium w-4">Y:</label>
                  <input
                    type="number"
                    value={positionValues.y}
                    onChange={(e) => setPositionValues(prev => ({ ...prev, y: e.target.value }))}
                    onKeyDown={handlePositionKeyPress}
                    step="0.1"
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium w-4">Z:</label>
                  <input
                    type="number"
                    value={positionValues.z}
                    onChange={(e) => setPositionValues(prev => ({ ...prev, z: e.target.value }))}
                    onKeyDown={handlePositionKeyPress}
                    step="0.1"
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePositionSave}
                    className="text-xs px-2 py-1 h-auto"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            {isEditingRotation && (
              <div className="mb-2 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium w-4">X:</label>
                  <input
                    type="number"
                    value={rotationValues.x}
                    onChange={(e) => setRotationValues(prev => ({ ...prev, x: e.target.value }))}
                    onKeyDown={handleRotationKeyPress}
                    step="1"
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                    autoFocus
                  />
                  <span className="text-xs text-muted-foreground">°</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium w-4">Y:</label>
                  <input
                    type="number"
                    value={rotationValues.y}
                    onChange={(e) => setRotationValues(prev => ({ ...prev, y: e.target.value }))}
                    onKeyDown={handleRotationKeyPress}
                    step="1"
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">°</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium w-4">Z:</label>
                  <input
                    type="number"
                    value={rotationValues.z}
                    onChange={(e) => setRotationValues(prev => ({ ...prev, z: e.target.value }))}
                    onKeyDown={handleRotationKeyPress}
                    step="1"
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">°</span>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRotationSave}
                    className="text-xs px-2 py-1 h-auto"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            {editMode && (
            <>
              {onSplitFixture && selectedLocation && selectedLocation.count > 1 && fixtureTypeMap.get(selectedLocation.blockName) === "WALL-BAY" && (
                <div className="flex gap-1 mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSplitModal(true)}
                    className="text-xs flex items-center justify-center gap-1 w-full"
                  >
                    <SeparatorHorizontal className="h-3 w-3" />
                    Split
                  </Button>
                </div>
              )}
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
            </>
            )}
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
        
        {/* Split Modal */}
        <SplitFixtureModal
          isOpen={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          onConfirm={handleSplitConfirm}
          totalCount={selectedLocation.count}
          fixtureName={selectedLocation.blockName}
        />
      </>
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

  // Spawn Point Mode Panel
  if (setSpawnPointMode && currentFloorIndex !== undefined) {
    const spawnPoint = spawnPoints.get(currentFloorIndex);
    const floorName = floorNames.get(currentFloorIndex) || `Floor ${currentFloorIndex}`;

    return (
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg w-64">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Spawn Point Mode</h3>
        </div>
        <div className="space-y-1 text-xs">
          <div><span className="font-medium">Floor:</span> {floorName}</div>
          {spawnPoint ? (
            <>
              <div className="mt-2">
                <span className="font-medium">Spawn Point Position:</span>
              </div>
              <div className="ml-2">
                <div><span className="font-medium">X:</span> {spawnPoint[0].toFixed(2)}</div>
                <div><span className="font-medium">Y:</span> {spawnPoint[1].toFixed(2)}</div>
                <div><span className="font-medium">Z:</span> {spawnPoint[2].toFixed(2)}</div>
              </div>
            </>
          ) : (
            <div className="mt-2 text-muted-foreground italic">
              Click on the floor to set spawn point
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
