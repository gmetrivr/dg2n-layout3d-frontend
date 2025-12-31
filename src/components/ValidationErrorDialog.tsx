import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog";
import { Button } from "@/shadcn/components/ui/button";
import { XCircle } from 'lucide-react';
import type { ValidationError } from '../hooks/usePasteValidation';

interface ValidationErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errors: ValidationError[];
}

export function ValidationErrorDialog({
  open,
  onOpenChange,
  errors
}: ValidationErrorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Cannot Paste
            </div>
          </DialogTitle>
          <DialogDescription>
            The following errors prevent pasting:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {errors.map((error, idx) => (
            <div key={idx} className="border-l-4 border-red-400 bg-red-50 p-3 rounded">
              <p className="text-sm text-red-800">{error.message}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
