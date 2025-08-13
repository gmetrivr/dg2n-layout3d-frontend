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
import { Tag, Check, Loader2 } from 'lucide-react';
import { apiService } from '../services/api';

interface BrandSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBrand: string;
  onBrandSelect: (brand: string) => void;
}

export function BrandSelectionModal({ 
  open, 
  onOpenChange, 
  currentBrand,
  onBrandSelect
}: BrandSelectionModalProps) {
  const [brands, setBrands] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>(currentBrand);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedBrand(currentBrand);
  }, [currentBrand, open]);

  // Fetch brands when modal opens
  useEffect(() => {
    if (open) {
      const fetchBrands = async () => {
        setLoading(true);
        setError(null);
        try {
          const brandsList = await apiService.getBrands();
          // Sort with special brands at bottom
          const specialBrands = ['ARCH', 'OTHER-AREA', 'UNASSIGNED'];
          const regularBrands = brandsList.filter(brand => 
            !specialBrands.includes(brand.toUpperCase())
          ).sort();
          const bottomBrands = brandsList.filter(brand => 
            specialBrands.includes(brand.toUpperCase())
          ).sort();
          setBrands([...regularBrands, ...bottomBrands]);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load brands');
          console.error('Failed to fetch brands:', err);
        } finally {
          setLoading(false);
        }
      };
      
      fetchBrands();
    }
  }, [open]);

  const handleApply = () => {
    onBrandSelect(selectedBrand);
    onOpenChange(false);
  };

  const hasChanges = selectedBrand !== currentBrand;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <DialogTitle>Select Brand</DialogTitle>
            </div>
            <DialogClose onClick={() => onOpenChange(false)} />
          </div>
        </DialogHeader>

        <div className="px-6 pb-4">
          <DialogDescription>
            Select a brand for this floor plate. The floor plate will be updated with the new brand color.
          </DialogDescription>
        </div>

        {error && (
          <div className="px-6 pb-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        <div className="px-6 pb-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading brands...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-medium text-foreground">
                Current Brand: <span className="text-primary">{currentBrand}</span>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
                {brands.map((brand) => {
                  const isSelected = selectedBrand === brand;
                  const isCurrent = currentBrand === brand;
                  
                  return (
                    <button
                      key={brand}
                      onClick={() => setSelectedBrand(brand)}
                      className={`
                        flex items-center justify-between p-3 rounded-lg border text-left transition-colors
                        ${isSelected 
                          ? 'border-primary bg-primary/10 text-primary' 
                          : 'border-border hover:border-primary/50 hover:bg-accent'
                        }
                        ${isCurrent && !isSelected ? 'border-muted-foreground/30 bg-muted/50' : ''}
                      `}
                    >
                      <span className="text-sm font-medium truncate">{brand}</span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground">
              {brands.length} brands available
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={!hasChanges}
                className="flex items-center gap-2"
              >
                <Tag className="h-4 w-4" />
                {hasChanges 
                  ? `Apply Brand: ${selectedBrand}` 
                  : 'No Changes'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}