import { useState, useEffect } from 'react';
import { Button } from "@/shadcn/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shadcn/components/ui/dialog";

interface SplitFixtureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (leftCount: number, rightCount: number) => void;
  totalCount: number;
  fixtureName: string;
}

export function SplitFixtureModal({
  isOpen,
  onClose,
  onConfirm,
  totalCount,
  fixtureName
}: SplitFixtureModalProps) {
  const [leftCount, setLeftCount] = useState('');
  const [error, setError] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLeftCount('');
      setError('');
    }
  }, [isOpen]);

  const rightCount = totalCount - parseInt(leftCount || '0');

  const validateInput = (value: string): string | null => {
    const num = parseInt(value);
    
    if (value === '') return 'Please enter a number';
    if (isNaN(num)) return 'Please enter a valid number';
    if (num <= 0) return 'Left count must be greater than 0';
    if (num >= totalCount) return `Left count must be less than ${totalCount}`;
    
    return null;
  };

  const handleLeftCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLeftCount(value);
    
    const validationError = validateInput(value);
    setError(validationError || '');
  };

  const handleConfirm = () => {
    const validationError = validateInput(leftCount);
    if (validationError) {
      setError(validationError);
      return;
    }

    const left = parseInt(leftCount);
    const right = totalCount - left;
    onConfirm(left, right);
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !error && leftCount) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const isValid = !error && leftCount && parseInt(leftCount) > 0 && parseInt(leftCount) < totalCount;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Split Fixture</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 p-6 pt-0">
          <div className="text-sm text-muted-foreground">
            Splitting fixture <strong>{fixtureName}</strong> with count of <strong>{totalCount}</strong>
          </div>

          <div className="space-y-2">
            <label htmlFor="leftCount" className="block text-sm font-medium">
              Number of fixtures to keep on the left:
            </label>
            <input
              id="leftCount"
              type="number"
              min="1"
              max={totalCount - 1}
              value={leftCount}
              onChange={handleLeftCountChange}
              onKeyDown={handleKeyPress}
              placeholder={`Enter 1-${totalCount - 1}`}
              className={`w-full px-3 py-2 border rounded-md ${error ? 'border-destructive' : 'border-input'} focus:outline-none focus:ring-2 focus:ring-primary`}
            />
            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>

          {leftCount && !error && (
            <div className="text-sm text-muted-foreground">
              Left: <strong>{leftCount}</strong> → Right: <strong>{rightCount}</strong>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!isValid}
          >
            Split Fixture
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}