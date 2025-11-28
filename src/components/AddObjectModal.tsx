import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/shadcn/components/ui/dialog";
import { Box, Square, DoorOpen, DoorClosed } from 'lucide-react';

interface AddObjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onObjectSelect: (objectType: 'glazing' | 'partition' | 'entrance_door' | 'exit_door') => void;
}

export function AddObjectModal({
  open,
  onOpenChange,
  onObjectSelect
}: AddObjectModalProps) {

  const handleObjectSelect = (objectType: 'glazing' | 'partition' | 'entrance_door' | 'exit_door') => {
    onObjectSelect(objectType);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              <DialogTitle>Add Objects</DialogTitle>
            </div>
            <DialogClose onClick={() => onOpenChange(false)} />
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          <DialogDescription>
            Select an architectural element to add to the floor.
          </DialogDescription>

          {/* Two-point elements (require start/end points) */}
          <div>
            <h3 className="text-sm font-medium mb-2">Two-Point Elements</h3>
            <p className="text-xs text-muted-foreground mb-3">Click twice to define start and end points</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Glazing Option */}
              <button
                onClick={() => handleObjectSelect('glazing')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Square className="h-10 w-10 text-primary mb-2" />
                <span className="font-medium text-sm">Glazing</span>
                <span className="text-xs text-muted-foreground mt-1">Glass panel</span>
              </button>

              {/* Partition Option */}
              <button
                onClick={() => handleObjectSelect('partition')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Box className="h-10 w-10 text-primary mb-2" />
                <span className="font-medium text-sm">Partition</span>
                <span className="text-xs text-muted-foreground mt-1">60mm wall</span>
              </button>
            </div>
          </div>

          {/* Single-point elements (require only position) */}
          <div>
            <h3 className="text-sm font-medium mb-2">Single-Point Elements</h3>
            <p className="text-xs text-muted-foreground mb-3">Click once to place at position</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Entrance Door Option */}
              <button
                onClick={() => handleObjectSelect('entrance_door')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <DoorOpen className="h-10 w-10 text-primary mb-2" />
                <span className="font-medium text-sm">Entrance</span>
                <span className="text-xs text-muted-foreground mt-1">1.5m door</span>
              </button>

              {/* Exit Door Option */}
              <button
                onClick={() => handleObjectSelect('exit_door')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <DoorClosed className="h-10 w-10 text-primary mb-2" />
                <span className="font-medium text-sm">Exit</span>
                <span className="text-xs text-muted-foreground mt-1">1.0m door</span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
