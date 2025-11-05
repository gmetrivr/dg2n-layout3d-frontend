import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/shadcn/components/ui/dialog";
import { Box, Square } from 'lucide-react';

interface AddObjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onObjectSelect: (objectType: 'glazing' | 'partition') => void;
}

export function AddObjectModal({
  open,
  onOpenChange,
  onObjectSelect
}: AddObjectModalProps) {

  const handleObjectSelect = (objectType: 'glazing' | 'partition') => {
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
            Select an object type to add to the floor. Click on the floor surface to define start and end points.
          </DialogDescription>

          <div className="grid grid-cols-2 gap-4">
            {/* Glazing Option */}
            <button
              onClick={() => handleObjectSelect('glazing')}
              className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <Square className="h-12 w-12 text-primary mb-3" />
              <span className="font-medium text-sm">Glazing</span>
              <span className="text-xs text-muted-foreground mt-1">Single plane</span>
            </button>

            {/* Partition Option */}
            <button
              onClick={() => handleObjectSelect('partition')}
              className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <Box className="h-12 w-12 text-primary mb-3" />
              <span className="font-medium text-sm">Partition</span>
              <span className="text-xs text-muted-foreground mt-1">115mm box</span>
            </button>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 mt-4">
            <p className="text-xs text-muted-foreground">
              <strong>Instructions:</strong> After selecting an object type, click on the floor to set the starting point, then click again to set the ending point. The height will be set as a variant of the object.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
