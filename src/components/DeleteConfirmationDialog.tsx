import { useEffect, useCallback } from "react";
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
  const handleConfirm = useCallback(() => {
    onConfirmDelete();
    onOpenChange(false);
  }, [onConfirmDelete, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Enter to confirm, Escape to cancel
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleConfirm]);

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
            Cancel (Esc)
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
          >
            Delete (Enter)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
