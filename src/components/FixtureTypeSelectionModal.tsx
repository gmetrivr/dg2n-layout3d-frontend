import { useState, useEffect } from 'react';
import { Button } from "@/shadcn/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogClose 
} from "@/shadcn/components/ui/dialog";
import { Box, Check, Loader2 } from 'lucide-react';

interface FixtureTypeSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentType: string;
  availableTypes: string[];
  onTypeSelect: (fixtureType: string) => void;
  isAddMode?: boolean; // New prop to indicate if we're adding a fixture
}

export function FixtureTypeSelectionModal({
  open,
  onOpenChange,
  currentType,
  availableTypes,
  onTypeSelect,
  isAddMode = false
}: FixtureTypeSelectionModalProps) {
  const [selectedType, setSelectedType] = useState<string>(currentType);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedType(currentType);
  }, [currentType, open]);

  const handleApply = () => {
    setLoading(true);
    onTypeSelect(selectedType);
    // Loading state will be managed by parent component
    setTimeout(() => {
      setLoading(false);
      onOpenChange(false);
    }, 100);
  };

  const hasChanges = isAddMode ? selectedType !== '' : selectedType !== currentType;

  const renderTypeButton = (fixtureType: string) => {
    const isSelected = selectedType === fixtureType;
    const isCurrent = currentType === fixtureType;
    
    return (
      <button
        key={fixtureType}
        onClick={() => setSelectedType(fixtureType)}
        className={`
          flex items-center justify-between p-3 rounded-lg border text-left transition-colors text-sm
          ${isSelected 
            ? 'border-primary bg-primary/10 text-primary' 
            : 'border-border hover:border-primary/50 hover:bg-accent'
          }
          ${isCurrent && !isSelected ? 'border-muted-foreground/30 bg-muted/50' : ''}
        `}
      >
        <span className="font-medium truncate">{fixtureType}</span>
        {isSelected && (
          <Check className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
        )}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              <DialogTitle>{isAddMode ? 'Add New Fixture' : 'Select Fixture Type'}</DialogTitle>
            </div>
            <DialogClose onClick={() => onOpenChange(false)} />
          </div>
        </DialogHeader>

        <div className="px-6 pb-4">
          <DialogDescription>
            {isAddMode
              ? 'Select a fixture type to add to the current floor. The fixture will be placed at the screen center.'
              : 'Select a new fixture type. This will replace the current fixture with a different type and update the 3D model.'
            }
          </DialogDescription>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {!isAddMode && (
            <div className="text-sm font-medium text-foreground">
              Current Type: <span className="text-primary">{currentType}</span>
            </div>
          )}
          
          <div className="max-h-80 overflow-y-auto space-y-2">
            <div className="grid grid-cols-1 gap-2">
              {availableTypes.map(renderTypeButton)}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground">
              {availableTypes.length} fixture types available
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={!hasChanges || loading}
                className="flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Box className="h-4 w-4" />
                )}
                {loading
                  ? (isAddMode ? 'Adding...' : 'Updating...')
                  : hasChanges
                    ? (isAddMode ? `Add: ${selectedType}` : `Apply Type: ${selectedType}`)
                    : (isAddMode ? 'Select Type' : 'No Changes')
                }
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}