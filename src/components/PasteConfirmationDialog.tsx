import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog";
import { Button } from "@/shadcn/components/ui/button";
import { AlertTriangle, Info } from 'lucide-react';
import type { ValidationResult } from '../hooks/usePasteValidation';

interface PasteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validationResult: ValidationResult;
  itemCount: number;
  onConfirm: () => void;
}

export function PasteConfirmationDialog({
  open,
  onOpenChange,
  validationResult,
  itemCount,
  onConfirm
}: PasteConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Paste Confirmation
            </div>
          </DialogTitle>
          <DialogDescription>
            You are about to paste {itemCount} item{itemCount > 1 ? 's' : ''}.
            Please review the following warnings:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
          {validationResult.warnings.map((warning, idx) => (
            <div key={idx} className="border-l-4 border-yellow-400 bg-yellow-50 p-3 rounded">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-800">
                    {warning.message}
                  </p>
                  {warning.suggestion && (
                    <p className="text-xs text-yellow-700 mt-1">
                      {warning.suggestion}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Paste Anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
