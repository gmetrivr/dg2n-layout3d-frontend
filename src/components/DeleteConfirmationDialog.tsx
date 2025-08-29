import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog";
import { Button } from "@/shadcn/components/ui/button";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixtureCount: number;
  onConfirmDelete: () => void;
}

export function DeleteConfirmationDialog({ 
  open, 
  onOpenChange, 
  fixtureCount,
  onConfirmDelete 
}: DeleteConfirmationDialogProps) {
  const handleConfirm = () => {
    onConfirmDelete();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Fixture{fixtureCount > 1 ? 's' : ''}?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {fixtureCount === 1 ? 'this fixture' : `these ${fixtureCount} fixtures`}? 
            This action cannot be undone and the {fixtureCount === 1 ? 'fixture' : 'fixtures'} will be removed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 p-6 pt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            variant="destructive"
            onClick={handleConfirm}
          >
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}