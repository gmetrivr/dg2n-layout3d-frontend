import { useState } from 'react';
import { Trash2, MoveUp, MoveDown, Settings, Pencil, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/shadcn/components/ui/dialog';
import { Button } from "@/shadcn/components/ui/button";
import { getGlbTitle, isShatteredFloorPlateFile } from '../utils/zipUtils';
import type { ExtractedFile } from '../utils/zipUtils';

interface FloorManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  glbFiles: ExtractedFile[];
  selectedFloorFile: ExtractedFile | null;
  onFloorFileChange: (file: ExtractedFile | null) => void;
  onDeleteFloor?: (floorFile: ExtractedFile) => void;
  onMoveFloorUp?: (floorFile: ExtractedFile) => void;
  onMoveFloorDown?: (floorFile: ExtractedFile) => void;
  onRenameFloor?: (floorFile: ExtractedFile, newName: string) => void;
  floorDisplayOrder?: number[]; // Optional display order for floors
}

export function FloorManagementModal({
  open,
  onOpenChange,
  glbFiles,
  selectedFloorFile,
  onFloorFileChange,
  onDeleteFloor,
  onMoveFloorUp,
  onMoveFloorDown,
  onRenameFloor,
  floorDisplayOrder,
}: FloorManagementModalProps) {
  const [editingFloorName, setEditingFloorName] = useState<string | null>(null);
  const [editedName, setEditedName] = useState<string>('');

  // Filter floor files (exclude shattered floor plates)
  const floorFiles = glbFiles.filter(file => !isShatteredFloorPlateFile(file.name));

  // Sort floors by display order if provided, otherwise by floor number
  const sortedFloorFiles = [...floorFiles].sort((a, b) => {
    const getFloorNumber = (filename: string) => {
      const match = filename.match(/floor[_-]?(\d+)/i) || filename.match(/(\d+)/i);
      return match ? parseInt(match[1]) : 0;
    };

    if (floorDisplayOrder && floorDisplayOrder.length > 0) {
      // Use display order for sorting
      const aFloorNum = getFloorNumber(a.name);
      const bFloorNum = getFloorNumber(b.name);
      const aPos = floorDisplayOrder.indexOf(aFloorNum);
      const bPos = floorDisplayOrder.indexOf(bFloorNum);

      // If both are in the display order, sort by position
      if (aPos >= 0 && bPos >= 0) {
        return aPos - bPos;
      }
      // If only one is in the display order, it comes first
      if (aPos >= 0) return -1;
      if (bPos >= 0) return 1;
      // If neither is in the display order, sort by floor number
      return aFloorNum - bFloorNum;
    }

    // Default: sort by floor number
    return getFloorNumber(a.name) - getFloorNumber(b.name);
  });

  const handleDeleteFloor = (floorFile: ExtractedFile) => {
    if (window.confirm(`Are you sure you want to delete ${getGlbTitle(floorFile.name)}? This action cannot be undone.`)) {
      onDeleteFloor?.(floorFile);

      // If deleting the currently selected floor, switch to the first remaining floor
      if (selectedFloorFile?.name === floorFile.name && sortedFloorFiles.length > 1) {
        const remainingFloors = sortedFloorFiles.filter(f => f.name !== floorFile.name);
        if (remainingFloors.length > 0) {
          onFloorFileChange(remainingFloors[0]);
        }
      }
    }
  };

  const getCurrentFloorIndex = (floorFile: ExtractedFile) => {
    return sortedFloorFiles.findIndex(f => f.name === floorFile.name);
  };

  const canMoveUp = (floorFile: ExtractedFile) => {
    return getCurrentFloorIndex(floorFile) > 0;
  };

  const canMoveDown = (floorFile: ExtractedFile) => {
    return getCurrentFloorIndex(floorFile) < sortedFloorFiles.length - 1;
  };

  const startRenaming = (floorFile: ExtractedFile) => {
    setEditingFloorName(floorFile.name);
    setEditedName(getGlbTitle(floorFile.name));
  };

  const cancelRenaming = () => {
    setEditingFloorName(null);
    setEditedName('');
  };

  const saveRename = (floorFile: ExtractedFile) => {
    if (editedName.trim() && editedName.trim() !== getGlbTitle(floorFile.name)) {
      onRenameFloor?.(floorFile, editedName.trim());
    }
    cancelRenaming();
  };

  const handleKeyDown = (e: React.KeyboardEvent, floorFile: ExtractedFile) => {
    if (e.key === 'Enter') {
      saveRename(floorFile);
    } else if (e.key === 'Escape') {
      cancelRenaming();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Manage Floors
            </div>
          </DialogTitle>
          <DialogClose onClick={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="px-6 pb-6">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Manage the floors in your 3D model. You can rename, delete, or rearrange their order.
            </p>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {sortedFloorFiles.map((floorFile) => {
              const isSelected = selectedFloorFile?.name === floorFile.name;
              const floorIndex = getCurrentFloorIndex(floorFile);

              return (
                <div
                  key={floorFile.name}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-sm font-medium text-muted-foreground min-w-[20px]">
                      {floorIndex + 1}
                    </div>
                    {editingFloorName === floorFile.name ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, floorFile)}
                          className="flex-1 px-2 py-1 text-sm border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => saveRename(floorFile)}
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Save"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelRenaming}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onFloorFileChange(floorFile)}
                        className="text-left hover:text-primary transition-colors flex-1 min-w-0"
                      >
                        <div className="font-medium truncate">{getGlbTitle(floorFile.name)}</div>
                        <div className="text-xs text-muted-foreground truncate">{floorFile.name}</div>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Rename Button */}
                    {editingFloorName !== floorFile.name && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startRenaming(floorFile)}
                        className="h-8 w-8 p-0"
                        title="Rename floor"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Move Up Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMoveFloorUp?.(floorFile)}
                      disabled={!canMoveUp(floorFile) || editingFloorName !== null}
                      className="h-8 w-8 p-0"
                      title="Move up"
                    >
                      <MoveUp className="h-4 w-4" />
                    </Button>

                    {/* Move Down Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMoveFloorDown?.(floorFile)}
                      disabled={!canMoveDown(floorFile) || editingFloorName !== null}
                      className="h-8 w-8 p-0"
                      title="Move down"
                    >
                      <MoveDown className="h-4 w-4" />
                    </Button>

                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteFloor(floorFile)}
                      disabled={sortedFloorFiles.length <= 1 || editingFloorName !== null}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete floor"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {sortedFloorFiles.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No floors found in the current model.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}