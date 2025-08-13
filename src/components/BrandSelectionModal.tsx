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
import { apiService, type BrandCategoriesResponse } from '../services/api';

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
  const [brandCategories, setBrandCategories] = useState<BrandCategoriesResponse | null>(null);
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
          const categoriesData = await apiService.getBrandCategories();
          setBrandCategories(categoriesData);
          setBrands(categoriesData.brands || []);
        } catch (err) {
          console.warn('Failed to fetch brand categories, falling back to flat list:', err);
          
          // Fallback to flat brands list
          try {
            const brandsList = await apiService.getBrands();
            setBrands(brandsList);
            setBrandCategories(null); // No categories available
          } catch (fallbackErr) {
            setError(fallbackErr instanceof Error ? fallbackErr.message : 'Failed to load brands');
            console.error('Both category and fallback APIs failed:', fallbackErr);
          }
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

  const renderBrandButton = (brand: string) => {
    const isSelected = selectedBrand === brand;
    const isCurrent = currentBrand === brand;
    
    return (
      <button
        key={brand}
        onClick={() => setSelectedBrand(brand)}
        className={`
          flex items-center justify-between p-2 rounded-lg border text-left transition-colors text-xs
          ${isSelected 
            ? 'border-primary bg-primary/10 text-primary' 
            : 'border-border hover:border-primary/50 hover:bg-accent'
          }
          ${isCurrent && !isSelected ? 'border-muted-foreground/30 bg-muted/50' : ''}
        `}
      >
        <span className="font-medium truncate">{brand}</span>
        {isSelected && (
          <Check className="h-3 w-3 text-primary flex-shrink-0 ml-1" />
        )}
      </button>
    );
  };

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
              
              <div className="max-h-96 overflow-y-auto space-y-4">
                {brandCategories ? (
                  // Organized by categories
                  <>
                    {/* Private Label Brands */}
                    {brandCategories.categories.brands.private_label.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#4169e1' }}></div>
                          {brandCategories.categories.brands.private_label.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {brandCategories.categories.brands.private_label.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}
                    
                    {/* External Brands */}
                    {brandCategories.categories.brands.external.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#32cd32' }}></div>
                          {brandCategories.categories.brands.external.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {brandCategories.categories.brands.external.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}
                    
                    {/* General Areas */}
                    {brandCategories.categories.areas.general.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ffa500' }}></div>
                          {brandCategories.categories.areas.general.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {brandCategories.categories.areas.general.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}
                    
                    {/* Architectural Areas */}
                    {brandCategories.categories.areas.architectural.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#808080' }}></div>
                          {brandCategories.categories.areas.architectural.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {brandCategories.categories.areas.architectural.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}
                    
                    {/* Other/Unassigned */}
                    {brandCategories.categories.areas.other.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ff0000' }}></div>
                          {brandCategories.categories.areas.other.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {brandCategories.categories.areas.other.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  // Fallback: flat list
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {brands.map(renderBrandButton)}
                  </div>
                )}
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