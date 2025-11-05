import { Trash2, RotateCw, RotateCcw } from 'lucide-react';
import { Button } from "@/shadcn/components/ui/button";
import type { ArchitecturalObject } from './3DViewerModifier';
import { useState } from 'react';

interface ObjectInfoPanelProps {
  selectedObject: ArchitecturalObject | null;
  editMode: boolean;
  onClose: () => void;
  onRotate: (object: ArchitecturalObject, angle: number) => void;
  onHeightChange: (object: ArchitecturalObject, height: number) => void;
  onDelete: (object: ArchitecturalObject) => void;
  onReset: (object: ArchitecturalObject) => void;
}

export function ObjectInfoPanel({
  selectedObject,
  editMode,
  onClose,
  onRotate,
  onHeightChange,
  onDelete,
  onReset
}: ObjectInfoPanelProps) {
  const [isEditingHeight, setIsEditingHeight] = useState(false);
  const [heightValue, setHeightValue] = useState('');

  if (!selectedObject) return null;

  const hasChanges = selectedObject.wasMoved || selectedObject.wasRotated || selectedObject.wasHeightChanged;

  // Calculate length from start and end points
  const dx = selectedObject.endPoint[0] - selectedObject.startPoint[0];
  const dz = selectedObject.endPoint[2] - selectedObject.startPoint[2];
  const length = Math.sqrt(dx * dx + dz * dz);

  const hasHeightChanged = selectedObject.wasHeightChanged;
  const hasMoved = selectedObject.wasMoved;
  const hasRotated = selectedObject.wasRotated;

  const handleHeightEdit = () => {
    setIsEditingHeight(true);
    setHeightValue(selectedObject.height.toString());
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

  return (
    <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg w-64">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">
          {selectedObject.type === 'glazing' ? 'Glazing' : 'Partition'}
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1 text-xs">
        <div><span className="font-medium">Type:</span> {selectedObject.type === 'glazing' ? 'Glazing (Single Plane)' : 'Partition (115mm Box)'}</div>
        <div><span className="font-medium">Length:</span> {length.toFixed(3)}m</div>

        {/* Height */}
        <div style={{ color: hasHeightChanged ? '#ef4444' : 'inherit' }}>
          <span className="font-medium">Height:</span> {hasHeightChanged ? (selectedObject.originalHeight || selectedObject.height).toFixed(3) : selectedObject.height.toFixed(3)}m
        </div>
        {hasHeightChanged && (
          <div style={{ color: '#22c55e' }}>
            <span className="font-medium">New Height:</span> {selectedObject.height.toFixed(3)}m
          </div>
        )}

        {/* Position */}
        <div style={{ color: hasMoved ? '#ef4444' : 'inherit' }}>
          <span className="font-medium">Start:</span> ({
            hasMoved && selectedObject.originalStartPoint
              ? `${selectedObject.originalStartPoint[0].toFixed(2)}, ${selectedObject.originalStartPoint[1].toFixed(2)}, ${selectedObject.originalStartPoint[2].toFixed(2)}`
              : `${selectedObject.startPoint[0].toFixed(2)}, ${selectedObject.startPoint[1].toFixed(2)}, ${selectedObject.startPoint[2].toFixed(2)}`
          })
        </div>
        {hasMoved && (
          <div style={{ color: '#22c55e' }}>
            <span className="font-medium">New Start:</span> ({selectedObject.startPoint[0].toFixed(2)}, {selectedObject.startPoint[1].toFixed(2)}, {selectedObject.startPoint[2].toFixed(2)})
          </div>
        )}

        <div style={{ color: hasMoved ? '#ef4444' : 'inherit' }}>
          <span className="font-medium">End:</span> ({
            hasMoved && selectedObject.originalEndPoint
              ? `${selectedObject.originalEndPoint[0].toFixed(2)}, ${selectedObject.originalEndPoint[1].toFixed(2)}, ${selectedObject.originalEndPoint[2].toFixed(2)}`
              : `${selectedObject.endPoint[0].toFixed(2)}, ${selectedObject.endPoint[1].toFixed(2)}, ${selectedObject.endPoint[2].toFixed(2)}`
          })
        </div>
        {hasMoved && (
          <div style={{ color: '#22c55e' }}>
            <span className="font-medium">New End:</span> ({selectedObject.endPoint[0].toFixed(2)}, {selectedObject.endPoint[1].toFixed(2)}, {selectedObject.endPoint[2].toFixed(2)})
          </div>
        )}

        {/* Rotation */}
        {hasRotated && (
          <>
            <div style={{ color: '#ef4444' }}>
              <span className="font-medium">Rotation:</span> {((selectedObject.originalRotation || 0) * 180 / Math.PI).toFixed(2)}°
            </div>
            <div style={{ color: '#22c55e' }}>
              <span className="font-medium">New Rotation:</span> {((selectedObject.rotation || 0) * 180 / Math.PI).toFixed(2)}°
            </div>
          </>
        )}
      </div>

      {editMode && (
        <div className="mt-3 pt-2 border-t border-border">
          {/* Height Edit */}
          {isEditingHeight ? (
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
                ✓
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleHeightEdit}
              className="text-xs px-2 py-1 h-auto w-full mb-2"
            >
              Edit Height
            </Button>
          )}

          {/* Rotation Controls */}
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
          <div className="flex gap-1 mb-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRotate(selectedObject, -15 * Math.PI / 180)}
              className="text-xs px-2 py-1 h-auto flex-1"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              -15°
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRotate(selectedObject, 15 * Math.PI / 180)}
              className="text-xs px-2 py-1 h-auto flex-1"
            >
              <RotateCw className="h-3 w-3 mr-1" />
              +15°
            </Button>
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
