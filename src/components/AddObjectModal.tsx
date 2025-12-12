import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/shadcn/components/ui/dialog";
import { Box, Square, DoorOpen, DoorClosed, MoveVertical, Bath, ShoppingBag, Package, Calculator, Store } from 'lucide-react';

interface AddObjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onObjectSelect: (objectType: 'glazing' | 'partition' | 'entrance_door' | 'exit_door' | 'door' | 'staircase' | 'toilet' | 'trial_room' | 'boh' | 'cash_till' | 'window_display') => void;
}

export function AddObjectModal({
  open,
  onOpenChange,
  onObjectSelect
}: AddObjectModalProps) {

  const handleObjectSelect = (objectType: 'glazing' | 'partition' | 'entrance_door' | 'exit_door' | 'door' | 'staircase' | 'toilet' | 'trial_room' | 'boh' | 'cash_till' | 'window_display') => {
    onObjectSelect(objectType);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Box className="h-5 w-5 text-muted-foreground" />
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
            <h3 className="text-sm font-semibold text-foreground mb-2">Two-Point Elements</h3>
            <p className="text-xs text-muted-foreground mb-3">Click twice to define start and end points</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Glazing Option */}
              <button
                onClick={() => handleObjectSelect('glazing')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Square className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Glazing</span>
                <span className="text-xs text-muted-foreground mt-1">Glass panel</span>
              </button>

              {/* Partition Option */}
              <button
                onClick={() => handleObjectSelect('partition')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Box className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Partition</span>
                <span className="text-xs text-muted-foreground mt-1">Interior wall</span>
              </button>
            </div>
          </div>

          {/* Single-point elements (require only position) */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Single-Point Elements</h3>
            <p className="text-xs text-muted-foreground mb-3">Click once to place at position</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Entrance Door Option */}
              <button
                onClick={() => handleObjectSelect('entrance_door')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <DoorOpen className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Entry</span>
                <span className="text-xs text-muted-foreground mt-1">Entrance door</span>
              </button>

              {/* Exit Door Option */}
              <button
                onClick={() => handleObjectSelect('exit_door')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <DoorClosed className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Exit</span>
                <span className="text-xs text-muted-foreground mt-1">Exit door</span>
              </button>

              {/* Interior Door Option */}
              <button
                onClick={() => handleObjectSelect('door')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <DoorOpen className="h-10 w-10 text-muted-foreground mb-2" strokeWidth={1.5} />
                <span className="font-semibold text-sm text-foreground">Door</span>
                <span className="text-xs text-muted-foreground mt-1">Interior door</span>
              </button>

              {/* Toilet Option */}
              <button
                onClick={() => handleObjectSelect('toilet')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Bath className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Restroom</span>
                <span className="text-xs text-muted-foreground mt-1">Toilet</span>
              </button>

              {/* Trial Room Option */}
              <button
                onClick={() => handleObjectSelect('trial_room')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <ShoppingBag className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Fitting room</span>
                <span className="text-xs text-muted-foreground mt-1">Trial room</span>
              </button>

              {/* BOH Option */}
              <button
                onClick={() => handleObjectSelect('boh')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Package className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">BOH</span>
                <span className="text-xs text-muted-foreground mt-1">Back of house</span>
              </button>

              {/* Cash Till Option */}
              <button
                onClick={() => handleObjectSelect('cash_till')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Calculator className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Cash Till</span>
                <span className="text-xs text-muted-foreground mt-1">Checkout</span>
              </button>

              {/* Staircase Option */}
              <button
                onClick={() => handleObjectSelect('staircase')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <MoveVertical className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Stairs</span>
                <span className="text-xs text-muted-foreground mt-1">Staircase</span>
              </button>

              {/* Window Display Option */}
              <button
                onClick={() => handleObjectSelect('window_display')}
                className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-border hover:border-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Store className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="font-semibold text-sm text-foreground">Window Display</span>
                <span className="text-xs text-muted-foreground mt-1">Display window</span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
