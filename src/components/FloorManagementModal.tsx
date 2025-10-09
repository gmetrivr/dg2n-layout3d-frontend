import { Trash2, MoveUp, MoveDown, Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/shadcn/components/ui/dialog';
import { Button } from "@/shadcn/components/ui/button";
import { getGlbTitle } from '../utils/zipUtils';
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
}: FloorManagementModalProps) {
  // Filter floor files (exclude shattered floor plates)
  const floorFiles = glbFiles.filter(file => !file.name.includes('dg2n-shattered-floor-plates-'));

  // Sort floors by floor number for consistent ordering
  const sortedFloorFiles = [...floorFiles].sort((a, b) => {
    const getFloorNumber = (filename: string) => {
      const match = filename.match(/floor[_-]?(\d+)/i) || filename.match(/(\d+)/i);
      return match ? parseInt(match[1]) : 0;
    };
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
              Manage the floors in your 3D model. You can delete floors or rearrange their order.
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
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium text-muted-foreground min-w-[20px]">
                      {floorIndex + 1}
                    </div>
                    <button
                      onClick={() => onFloorFileChange(floorFile)}
                      className="text-left hover:text-primary transition-colors"
                    >
                      <div className="font-medium">{getGlbTitle(floorFile.name)}</div>
                      <div className="text-xs text-muted-foreground">{floorFile.name}</div>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Move Up Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMoveFloorUp?.(floorFile)}
                      disabled={!canMoveUp(floorFile)}
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
                      disabled={!canMoveDown(floorFile)}
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
                      disabled={sortedFloorFiles.length <= 1}
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