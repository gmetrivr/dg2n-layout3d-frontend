import { Trash2, Copy } from 'lucide-react';
import { Button } from "@/shadcn/components/ui/button";
import type { ArchitecturalObjectType } from '../hooks/useClipboard';

interface ArchitecturalObject {
  id: string;
  type: ArchitecturalObjectType;
  variant?: string;
  floorIndex: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  width?: number;
  height?: number;
  depth?: number;
  startPoint?: [number, number, number];
  endPoint?: [number, number, number];
  rotation?: number;
  originalPosX?: number;
  originalPosY?: number;
  originalPosZ?: number;
  originalRotationX?: number;
  originalRotationY?: number;
  originalRotationZ?: number;
  originalWidth?: number;
  originalHeight?: number;
  originalDepth?: number;
  originalStartPoint?: [number, number, number];
  originalEndPoint?: [number, number, number];
  originalRotation?: number;
  wasMoved?: boolean;
  wasRotated?: boolean;
  wasResized?: boolean;
  wasHeightChanged?: boolean;
  customProperties?: Record<string, any>;
}

interface MultiObjectInfoPanelProps {
  selectedObjects: ArchitecturalObject[];
  editMode: boolean;
  floorNames?: Map<number, string>;
  onClose: () => void;
  onCopyObjects?: (objects: ArchitecturalObject[]) => void;
  onDeleteObjects?: (objects: ArchitecturalObject[]) => void;
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

export function MultiObjectInfoPanel({
  selectedObjects,
  editMode,
  floorNames = new Map(),
  onClose,
  onCopyObjects,
  onDeleteObjects,
}: MultiObjectInfoPanelProps) {
  if (selectedObjects.length === 0) return null;

  // Extract values for comparison
  const types = selectedObjects.map(obj => obj.type);
  const variants = selectedObjects.map(obj => obj.variant);
  const floorIndices = selectedObjects.map(obj => obj.floorIndex);

  // Single-point properties
  const positionsX = selectedObjects.map(obj => obj.posX).filter((p): p is number => p !== undefined);
  const positionsY = selectedObjects.map(obj => obj.posY).filter((p): p is number => p !== undefined);
  const positionsZ = selectedObjects.map(obj => obj.posZ).filter((p): p is number => p !== undefined);
  const rotationsX = selectedObjects.map(obj => obj.rotationX).filter((r): r is number => r !== undefined);
  const rotationsY = selectedObjects.map(obj => obj.rotationY).filter((r): r is number => r !== undefined);
  const rotationsZ = selectedObjects.map(obj => obj.rotationZ).filter((r): r is number => r !== undefined);
  const widths = selectedObjects.map(obj => obj.width).filter((w): w is number => w !== undefined);
  const heights = selectedObjects.map(obj => obj.height).filter((h): h is number => h !== undefined);
  const depths = selectedObjects.map(obj => obj.depth).filter((d): d is number => d !== undefined);

  // Two-point properties
  const rotations = selectedObjects.map(obj => obj.rotation).filter((r): r is number => r !== undefined);

  // Get common values
  const commonType = getCommonValue(types);
  const commonVariant = getCommonValue(variants);
  const commonFloor = getCommonValue(floorIndices);
  const commonPosX = positionsX.length > 0 ? getCommonValue(positionsX) : "N/A";
  const commonPosY = positionsY.length > 0 ? getCommonValue(positionsY) : "N/A";
  const commonPosZ = positionsZ.length > 0 ? getCommonValue(positionsZ) : "N/A";
  const commonRotX = rotationsX.length > 0 ? getCommonValue(rotationsX) : "N/A";
  const commonRotY = rotationsY.length > 0 ? getCommonValue(rotationsY) : "N/A";
  const commonRotZ = rotationsZ.length > 0 ? getCommonValue(rotationsZ) : "N/A";
  const commonWidth = widths.length > 0 ? getCommonValue(widths) : "N/A";
  const commonHeight = heights.length > 0 ? getCommonValue(heights) : "N/A";
  const commonDepth = depths.length > 0 ? getCommonValue(depths) : "N/A";
  const commonRotation = rotations.length > 0 ? getCommonValue(rotations) : "N/A";

  // Determine if objects are single-point or two-point
  const hasSinglePoint = selectedObjects.some(obj => obj.posX !== undefined);
  const hasTwoPoint = selectedObjects.some(obj => obj.startPoint !== undefined);
  const isMixed = hasSinglePoint && hasTwoPoint;

  return (
    <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg w-64">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Multiple Objects ({selectedObjects.length})</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1 text-xs">
        <div><span className="font-medium">Type:</span> {commonType === "Multiple Values" || commonType === "N/A" ? commonType : String(commonType).replace(/_/g, ' ').toUpperCase()}</div>

        {commonVariant !== "N/A" && commonVariant !== undefined && (
          <div><span className="font-medium">Variant:</span> {commonVariant === "Multiple Values" ? commonVariant : String(commonVariant)}</div>
        )}

        <div>
          <span className="font-medium">Floor:</span> {
            commonFloor === "Multiple Values" || commonFloor === "N/A"
              ? commonFloor
              : (floorNames.get(commonFloor as number) || `Floor ${commonFloor}`)
          }
        </div>

        {isMixed && (
          <div className="text-yellow-600 text-xs mt-1">Mixed object types (single-point & two-point)</div>
        )}

        {hasSinglePoint && !isMixed && (
          <>
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

            {commonWidth !== "N/A" && (
              <div>
                <span className="font-medium">Width:</span> {commonWidth === "Multiple Values" ? commonWidth : (commonWidth as number).toFixed(2)}
              </div>
            )}

            {commonHeight !== "N/A" && (
              <div>
                <span className="font-medium">Height:</span> {commonHeight === "Multiple Values" ? commonHeight : (commonHeight as number).toFixed(2)}
              </div>
            )}

            {commonDepth !== "N/A" && (
              <div>
                <span className="font-medium">Depth:</span> {commonDepth === "Multiple Values" ? commonDepth : (commonDepth as number).toFixed(2)}
              </div>
            )}
          </>
        )}

        {hasTwoPoint && !isMixed && (
          <>
            {commonRotation !== "N/A" && (
              <div>
                <span className="font-medium">Rotation:</span> {commonRotation === "Multiple Values" ? commonRotation : (commonRotation as number).toFixed(2)}°
              </div>
            )}

            {commonHeight !== "N/A" && (
              <div>
                <span className="font-medium">Height:</span> {commonHeight === "Multiple Values" ? commonHeight : (commonHeight as number).toFixed(2)}
              </div>
            )}
          </>
        )}
      </div>

      {editMode && (
        <div className="mt-3 pt-2 border-t border-border">
          {onCopyObjects && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCopyObjects(selectedObjects)}
              className="w-full text-xs flex items-center justify-center gap-1 mb-2"
              title="Copy objects (Ctrl+C / Cmd+C)"
            >
              <Copy className="h-3 w-3" />
              Copy All ({selectedObjects.length})
            </Button>
          )}
          {onDeleteObjects && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDeleteObjects(selectedObjects)}
              className="w-full text-xs flex items-center justify-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Delete All ({selectedObjects.length})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
