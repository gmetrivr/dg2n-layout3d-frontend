import { Trash2, RotateCw, RotateCcw, Pencil, Check } from 'lucide-react';
import { Button } from "@/shadcn/components/ui/button";
import type { ArchitecturalObject } from './3DViewerModifier';
import { useState, useEffect } from 'react';

interface ObjectInfoPanelProps {
  selectedObject: ArchitecturalObject | null;
  editMode: boolean;
  onClose: () => void;
  onRotate: (object: ArchitecturalObject, angle: number) => void;
  onHeightChange: (object: ArchitecturalObject, height: number) => void;
  onPositionChange?: (object: ArchitecturalObject, startPoint: [number, number, number], endPoint: [number, number, number]) => void;
  onSinglePointPositionChange?: (object: ArchitecturalObject, posX: number, posY: number, posZ: number) => void;
  onDelete: (object: ArchitecturalObject) => void;
  onReset: (object: ArchitecturalObject) => void;
}

export function ObjectInfoPanel({
  selectedObject,
  editMode,
  onClose,
  onRotate,
  onHeightChange,
  onPositionChange,
  onSinglePointPositionChange,
  onDelete,
  onReset
}: ObjectInfoPanelProps) {
  const [isEditingHeight, setIsEditingHeight] = useState(false);
  const [heightValue, setHeightValue] = useState('');
  const [isEditingLength, setIsEditingLength] = useState(false);
  const [lengthValue, setLengthValue] = useState('');
  const [isEditingCenterPosition, setIsEditingCenterPosition] = useState(false);
  const [centerPositionValues, setCenterPositionValues] = useState({ x: '', y: '', z: '' });
  const [isCustomRotationMode, setIsCustomRotationMode] = useState(false);
  const [customRotationValue, setCustomRotationValue] = useState('');
  const [isEditingRotation, setIsEditingRotation] = useState(false);
  const [rotationEditValue, setRotationEditValue] = useState('');

  // Reset editing states when selectedObject changes
  useEffect(() => {
    setIsEditingHeight(false);
    setHeightValue('');
    setIsEditingLength(false);
    setLengthValue('');
    setIsEditingCenterPosition(false);
    setCenterPositionValues({ x: '', y: '', z: '' });
    setIsCustomRotationMode(false);
    setCustomRotationValue('');
    setIsEditingRotation(false);
    setRotationEditValue('');
  }, [selectedObject]);

  if (!selectedObject) return null;

  // Check if this is a single-point element (door, column, etc.)
  const isSinglePoint = selectedObject.posX !== undefined && selectedObject.posY !== undefined && selectedObject.posZ !== undefined;
  const isTwoPoint = selectedObject.startPoint !== undefined && selectedObject.endPoint !== undefined;

  const hasChanges = selectedObject.wasMoved || selectedObject.wasRotated || (selectedObject.wasHeightChanged || selectedObject.wasResized);

  // For two-point elements: calculate length from start and end points
  const dx = isTwoPoint ? (selectedObject.endPoint![0] - selectedObject.startPoint![0]) : 0;
  const dz = isTwoPoint ? (selectedObject.endPoint![2] - selectedObject.startPoint![2]) : 0;
  const length = isTwoPoint ? Math.sqrt(dx * dx + dz * dz) : 0;

  // Calculate position based on element type
  const centerPosition: [number, number, number] = isTwoPoint
    ? [
        (selectedObject.startPoint![0] + selectedObject.endPoint![0]) / 2,
        (selectedObject.startPoint![1] + selectedObject.endPoint![1]) / 2,
        (selectedObject.startPoint![2] + selectedObject.endPoint![2]) / 2
      ]
    : [selectedObject.posX!, selectedObject.posY!, selectedObject.posZ!];

  const originalCenterPosition: [number, number, number] | undefined = isTwoPoint
    ? (selectedObject.originalStartPoint && selectedObject.originalEndPoint)
      ? [
          (selectedObject.originalStartPoint[0] + selectedObject.originalEndPoint[0]) / 2,
          (selectedObject.originalStartPoint[1] + selectedObject.originalEndPoint[1]) / 2,
          (selectedObject.originalStartPoint[2] + selectedObject.originalEndPoint[2]) / 2
        ]
      : undefined
    : (selectedObject.originalPosX !== undefined && selectedObject.originalPosY !== undefined && selectedObject.originalPosZ !== undefined)
      ? [selectedObject.originalPosX, selectedObject.originalPosY, selectedObject.originalPosZ]
      : undefined;

  // Calculate rotation angle based on alignment from startPoint to endPoint
  // Using atan2 to get angle in the XZ plane (horizontal), relative to positive X axis
  const calculateRotationAngle = (start: [number, number, number], end: [number, number, number], additionalRotation: number = 0) => {
    const deltaX = end[0] - start[0];
    const deltaZ = end[2] - start[2];
    // atan2 returns angle in radians, convert to degrees
    // Negate deltaZ to match coordinate system used in Canvas3D
    const baseAngle = Math.atan2(-deltaZ, deltaX) * 180 / Math.PI;
    // Add the additional rotation (convert from radians to degrees)
    return baseAngle + (additionalRotation * 180 / Math.PI);
  };

  // For single-point elements, use rotationZ (vertical axis); for two-point elements, calculate from start/end points
  const currentRotation = isSinglePoint
    ? (selectedObject.rotationZ || 0)
    : calculateRotationAngle(
        selectedObject.startPoint!,
        selectedObject.endPoint!,
        selectedObject.rotation || 0
      );

  const originalRotation = isSinglePoint
    ? (selectedObject.originalRotationZ || selectedObject.rotationZ || 0)
    : (selectedObject.wasRotated || selectedObject.wasMoved)
      ? (() => {
          const origStart = selectedObject.originalStartPoint || selectedObject.startPoint!;
          const origEnd = selectedObject.originalEndPoint || selectedObject.endPoint!;
          const origRot = selectedObject.originalRotation || 0;
          return calculateRotationAngle(origStart, origEnd, origRot);
        })()
      : currentRotation;

  const hasHeightChanged = selectedObject.wasHeightChanged;
  const hasMoved = selectedObject.wasMoved;
  const hasRotated = selectedObject.wasRotated;

  const handleHeightEdit = () => {
    if (selectedObject.height !== undefined) {
      setIsEditingHeight(true);
      setHeightValue(selectedObject.height.toString());
    }
  };

  const handleHeightSave = () => {
    const newHeight = parseFloat(heightValue);
    if (!isNaN(newHeight) && newHeight > 0) {
      onHeightChange(selectedObject, newHeight);
    }
    setIsEditingHeight(false);
    setHeightValue('');
  };

  const handleHeightCancel = () => {
    setIsEditingHeight(false);
    setHeightValue('');
  };

  const handleHeightKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleHeightSave();
    } else if (e.key === 'Escape') {
      handleHeightCancel();
    }
  };

  // Length editing handlers
  const handleLengthEdit = () => {
    setIsEditingLength(true);
    setLengthValue(length.toFixed(3));
  };

  const handleLengthSave = () => {
    const newLength = parseFloat(lengthValue);
    if (!isNaN(newLength) && newLength > 0 && onPositionChange && isTwoPoint) {
      // Calculate center point
      const centerX = (selectedObject.startPoint![0] + selectedObject.endPoint![0]) / 2;
      const centerY = (selectedObject.startPoint![1] + selectedObject.endPoint![1]) / 2;
      const centerZ = (selectedObject.startPoint![2] + selectedObject.endPoint![2]) / 2;

      // Get current rotation angle (including additional rotation)
      const dx = selectedObject.endPoint![0] - selectedObject.startPoint![0];
      const dz = selectedObject.endPoint![2] - selectedObject.startPoint![2];
      const currentAngle = Math.atan2(-dz, dx) + (selectedObject.rotation || 0);

      // Calculate new start and end points with the new length
      const halfLength = newLength / 2;
      const newStartPoint: [number, number, number] = [
        centerX - halfLength * Math.cos(currentAngle),
        centerY,
        centerZ + halfLength * Math.sin(currentAngle) // Note: + because we negated in atan2
      ];
      const newEndPoint: [number, number, number] = [
        centerX + halfLength * Math.cos(currentAngle),
        centerY,
        centerZ - halfLength * Math.sin(currentAngle) // Note: - because we negated in atan2
      ];

      onPositionChange(selectedObject, newStartPoint, newEndPoint);
    }
    setIsEditingLength(false);
    setLengthValue('');
  };

  const handleLengthCancel = () => {
    setIsEditingLength(false);
    setLengthValue('');
  };

  const handleLengthKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLengthSave();
    } else if (e.key === 'Escape') {
      handleLengthCancel();
    }
  };

  // Center position editing handlers
  const handleCenterPositionEdit = () => {
    setIsEditingCenterPosition(true);
    setCenterPositionValues({
      x: centerPosition[0].toString(),
      y: centerPosition[1].toString(),
      z: centerPosition[2].toString()
    });
  };

  const handleCenterPositionSave = () => {
    const newCenterX = parseFloat(centerPositionValues.x);
    const newCenterY = parseFloat(centerPositionValues.y);
    const newCenterZ = parseFloat(centerPositionValues.z);

    if (!isNaN(newCenterX) && !isNaN(newCenterY) && !isNaN(newCenterZ)) {
      if (isTwoPoint && onPositionChange) {
        // For two-point elements: Calculate offset from current center to new center
        const offsetX = newCenterX - centerPosition[0];
        const offsetY = newCenterY - centerPosition[1];
        const offsetZ = newCenterZ - centerPosition[2];

        // Apply offset to both start and end points
        const newStartPoint: [number, number, number] = [
          selectedObject.startPoint![0] + offsetX,
          selectedObject.startPoint![1] + offsetY,
          selectedObject.startPoint![2] + offsetZ
        ];
        const newEndPoint: [number, number, number] = [
          selectedObject.endPoint![0] + offsetX,
          selectedObject.endPoint![1] + offsetY,
          selectedObject.endPoint![2] + offsetZ
        ];

        onPositionChange(selectedObject, newStartPoint, newEndPoint);
      } else if (isSinglePoint && onSinglePointPositionChange) {
        // For single-point elements: Update posX, posY, posZ directly
        // Note: The input values are in the UI coordinate system (X, Y=depth, Z=height)
        onSinglePointPositionChange(selectedObject, newCenterX, newCenterY, newCenterZ);
      }
    }
    setIsEditingCenterPosition(false);
    setCenterPositionValues({ x: '', y: '', z: '' });
  };

  const handleCenterPositionCancel = () => {
    setIsEditingCenterPosition(false);
    setCenterPositionValues({ x: '', y: '', z: '' });
  };

  const handleCenterPositionKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCenterPositionSave();
    } else if (e.key === 'Escape') {
      handleCenterPositionCancel();
    }
  };

  // Custom rotation handlers
  const handleCustomRotation = () => {
    const angle = parseFloat(customRotationValue);
    if (!isNaN(angle)) {
      onRotate(selectedObject, angle * Math.PI / 180); // Convert degrees to radians
      setIsCustomRotationMode(false);
      setCustomRotationValue('');
    }
  };

  const handleCancelCustomRotation = () => {
    setIsCustomRotationMode(false);
    setCustomRotationValue('');
  };

  const handleCustomRotationKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCustomRotation();
    } else if (e.key === 'Escape') {
      handleCancelCustomRotation();
    }
  };

  // Direct rotation editing handlers
  const handleRotationEdit = () => {
    setIsEditingRotation(true);
    setRotationEditValue(currentRotation.toFixed(2));
  };

  const handleRotationSave = () => {
    const targetAngle = parseFloat(rotationEditValue);
    if (!isNaN(targetAngle)) {
      // Close edit mode first
      setIsEditingRotation(false);
      setRotationEditValue('');

      // Calculate the angle difference from current rotation
      const angleDifference = targetAngle - currentRotation;
      // Convert to radians and apply the rotation
      onRotate(selectedObject, angleDifference * Math.PI / 180);
    } else {
      setIsEditingRotation(false);
      setRotationEditValue('');
    }
  };

  const handleRotationCancel = () => {
    setIsEditingRotation(false);
    setRotationEditValue('');
  };

  const handleRotationEditKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRotationSave();
    } else if (e.key === 'Escape') {
      handleRotationCancel();
    }
  };

  return (
    <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg w-64">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Object Info</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1 text-xs">
        <div>
          <span className="font-medium">Block:</span>{' '}
          {selectedObject.type === 'glazing' ? 'Glass' :
           selectedObject.type === 'partition' ? 'Partition' :
           selectedObject.type === 'entrance_door' ? 'Entrance Door' :
           selectedObject.type === 'exit_door' ? 'Exit Door' :
           selectedObject.type}
        </div>
        <div>
          <span className="font-medium">Type:</span>{' '}
          {selectedObject.variant ||
           (selectedObject.type === 'glazing' ? 'Glazing (Single Plane)' :
            selectedObject.type === 'partition' ? 'Partition (115mm Box)' :
            selectedObject.type === 'entrance_door' ? 'Entrance (1.5m)' :
            selectedObject.type === 'exit_door' ? 'Exit (1.0m)' :
            'Custom')}
        </div>

        {/* Length - only show for two-point elements */}
        {isTwoPoint && (
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Length:</span> {length.toFixed(3)}m
            </div>
            {editMode && (
              <button
                onClick={handleLengthEdit}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Edit length"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Height - hide for doors */}
        {selectedObject.height !== undefined && selectedObject.type !== 'entrance_door' && selectedObject.type !== 'exit_door' && (
          <>
            <div className="flex items-center justify-between">
              <div style={{ color: hasHeightChanged ? '#ef4444' : 'inherit' }}>
                <span className="font-medium">Height:</span> {hasHeightChanged ? (selectedObject.originalHeight || selectedObject.height).toFixed(3) : selectedObject.height.toFixed(3)}m
              </div>
              {editMode && (
                <button
                  onClick={handleHeightEdit}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit height"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
            {hasHeightChanged && (
              <div style={{ color: '#22c55e' }}>
                <span className="font-medium">New Height:</span> {selectedObject.height.toFixed(3)}m
              </div>
            )}
          </>
        )}

        {/* Position (Center Point) */}
        <div className="flex items-center justify-between">
          <div style={{ color: hasMoved ? '#ef4444' : 'inherit' }}>
            <span className="font-medium">Position:</span> ({
              (originalCenterPosition && hasMoved)
                ? `${originalCenterPosition[0].toFixed(2)}, ${originalCenterPosition[1].toFixed(2)}, ${originalCenterPosition[2].toFixed(2)}`
                : `${centerPosition[0].toFixed(2)}, ${centerPosition[1].toFixed(2)}, ${centerPosition[2].toFixed(2)}`
            })
          </div>
          {editMode && (
            <button
              onClick={handleCenterPositionEdit}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Edit position"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
        {hasMoved && originalCenterPosition && (
          <div style={{ color: '#22c55e' }}>
            <span className="font-medium">New Position:</span> ({centerPosition[0].toFixed(2)}, {centerPosition[1].toFixed(2)}, {centerPosition[2].toFixed(2)})
          </div>
        )}

        {/* Rotation (based on alignment from start to end point relative to world X axis) */}
        <div className="flex items-center justify-between">
          <div style={{ color: hasMoved || hasRotated ? '#ef4444' : 'inherit' }}>
            <span className="font-medium">Rotation (Y-axis):</span> {originalRotation.toFixed(2)}°
          </div>
          {editMode && (
            <button
              onClick={handleRotationEdit}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Edit rotation"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
        {(hasMoved || hasRotated) && Math.abs(currentRotation - originalRotation) > 0.01 && (
          <div style={{ color: '#22c55e' }}>
            <span className="font-medium">New Rotation:</span> {currentRotation.toFixed(2)}°
          </div>
        )}
      </div>

      {editMode && (
        <div className="mt-3 pt-2 border-t border-border">
          {/* Height Edit */}
          {isEditingHeight && (
            <div className="flex gap-1 mb-2">
              <input
                type="number"
                value={heightValue}
                onChange={(e) => setHeightValue(e.target.value)}
                onKeyDown={handleHeightKeyPress}
                placeholder="Height (m)"
                step="0.1"
                min="0.1"
                className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                autoFocus
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleHeightSave}
                className="text-xs px-2 py-1 h-auto"
              >
                <Check className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Length Edit */}
          {isEditingLength && (
            <div className="flex gap-1 mb-2">
              <input
                type="number"
                value={lengthValue}
                onChange={(e) => setLengthValue(e.target.value)}
                onKeyDown={handleLengthKeyPress}
                placeholder="Length (m)"
                step="0.1"
                min="0.1"
                className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                autoFocus
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleLengthSave}
                className="text-xs px-2 py-1 h-auto"
              >
                <Check className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Center Position Edit */}
          {isEditingCenterPosition && (
            <div className="mb-2 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium w-4">X:</label>
                <input
                  type="number"
                  value={centerPositionValues.x}
                  onChange={(e) => setCenterPositionValues(prev => ({ ...prev, x: e.target.value }))}
                  onKeyDown={handleCenterPositionKeyPress}
                  step="0.1"
                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium w-4">Y:</label>
                <input
                  type="number"
                  value={centerPositionValues.y}
                  onChange={(e) => setCenterPositionValues(prev => ({ ...prev, y: e.target.value }))}
                  onKeyDown={handleCenterPositionKeyPress}
                  step="0.1"
                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium w-4">Z:</label>
                <input
                  type="number"
                  value={centerPositionValues.z}
                  onChange={(e) => setCenterPositionValues(prev => ({ ...prev, z: e.target.value }))}
                  onKeyDown={handleCenterPositionKeyPress}
                  step="0.1"
                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCenterPositionSave}
                  className="text-xs px-2 py-1 h-auto"
                >
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Rotation Edit (Direct angle input) */}
          {isEditingRotation && (
            <div className="mb-2 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium">Angle:</label>
                <input
                  type="number"
                  value={rotationEditValue}
                  onChange={(e) => setRotationEditValue(e.target.value)}
                  onKeyDown={handleRotationEditKeyPress}
                  step="1"
                  className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  autoFocus
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

          {/* Rotation Controls - rotate object around its center */}
          <div className="flex gap-1 mb-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRotate(selectedObject, -90 * Math.PI / 180)}
              className="text-xs px-2 py-1 h-auto flex-1"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              -90°
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRotate(selectedObject, 90 * Math.PI / 180)}
              className="text-xs px-2 py-1 h-auto flex-1"
            >
              <RotateCw className="h-3 w-3 mr-1" />
              +90°
            </Button>
          </div>

          {/* Custom Rotation */}
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
                  onKeyDown={handleCustomRotationKeyPress}
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

          {/* Delete Button */}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete(selectedObject)}
              className="text-xs flex items-center justify-center gap-1 flex-1"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Reset Button */}
      {hasChanges && (
        <div className={`${editMode ? '' : 'mt-3 pt-2 border-t border-border'}`}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReset(selectedObject)}
            className="w-full text-xs"
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}
