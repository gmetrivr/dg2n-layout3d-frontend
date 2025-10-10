import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/shadcn/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/shadcn/components/ui/dialog";
import { Tag, Check, Loader2, Search } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    setSelectedBrand(currentBrand);
    setSearchQuery(''); // Reset search when modal opens
  }, [currentBrand, open]);

  // Filter and sort brands based on search query
  const filteredBrandCategories = useMemo(() => {
    if (!brandCategories) {
      return brandCategories;
    }

    const query = searchQuery.toLowerCase();
    const filterAndSortItems = (items: string[]) => {
      const filtered = searchQuery.trim()
        ? items.filter(brand => brand.toLowerCase().includes(query))
        : items;
      return filtered.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    };

    return {
      ...brandCategories,
      categories: {
        brands: {
          private_label: {
            ...brandCategories.categories.brands.private_label,
            items: filterAndSortItems(brandCategories.categories.brands.private_label.items)
          },
          external: {
            ...brandCategories.categories.brands.external,
            items: filterAndSortItems(brandCategories.categories.brands.external.items)
          }
        },
        areas: {
          general: {
            ...brandCategories.categories.areas.general,
            items: filterAndSortItems(brandCategories.categories.areas.general.items)
          },
          architectural: {
            ...brandCategories.categories.areas.architectural,
            items: filterAndSortItems(brandCategories.categories.areas.architectural.items)
          },
          other: {
            ...brandCategories.categories.areas.other,
            items: filterAndSortItems(brandCategories.categories.areas.other.items)
          }
        }
      }
    };
  }, [brandCategories, searchQuery]);

  // Filter and sort flat brands list
  const filteredBrands = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = searchQuery.trim()
      ? brands.filter(brand => brand.toLowerCase().includes(query))
      : brands;
    return filtered.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [brands, searchQuery]);

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

        <div className="px-6 pb-4 space-y-4">
          <DialogDescription>
            Select a brand for this floor plate. The floor plate will be updated with the new brand color.
          </DialogDescription>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search brands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
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
              
              <div className="h-96 overflow-y-auto space-y-4">
                {filteredBrandCategories ? (
                  // Organized by categories
                  <>
                    {/* Private Label Brands */}
                    {filteredBrandCategories.categories.brands.private_label.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#4169e1' }}></div>
                          {filteredBrandCategories.categories.brands.private_label.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {filteredBrandCategories.categories.brands.private_label.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}

                    {/* External Brands */}
                    {filteredBrandCategories.categories.brands.external.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#32cd32' }}></div>
                          {filteredBrandCategories.categories.brands.external.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {filteredBrandCategories.categories.brands.external.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}

                    {/* General Areas */}
                    {filteredBrandCategories.categories.areas.general.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ffa500' }}></div>
                          {filteredBrandCategories.categories.areas.general.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {filteredBrandCategories.categories.areas.general.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}

                    {/* Architectural Areas */}
                    {filteredBrandCategories.categories.areas.architectural.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#808080' }}></div>
                          {filteredBrandCategories.categories.areas.architectural.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {filteredBrandCategories.categories.areas.architectural.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}

                    {/* Other/Unassigned */}
                    {filteredBrandCategories.categories.areas.other.items.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ff0000' }}></div>
                          {filteredBrandCategories.categories.areas.other.description}
                        </h4>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {filteredBrandCategories.categories.areas.other.items.map(renderBrandButton)}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  // Fallback: flat list
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredBrands.map(renderBrandButton)}
                  </div>
                )}

                {/* No results message */}
                {searchQuery.trim() && filteredBrands.length === 0 && (!filteredBrandCategories ||
                  (filteredBrandCategories.categories.brands.private_label.items.length === 0 &&
                   filteredBrandCategories.categories.brands.external.items.length === 0 &&
                   filteredBrandCategories.categories.areas.general.items.length === 0 &&
                   filteredBrandCategories.categories.areas.architectural.items.length === 0 &&
                   filteredBrandCategories.categories.areas.other.items.length === 0)) && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground text-sm">No brands found matching "{searchQuery}"</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground">
              {searchQuery.trim() ? (
                <>
                  {filteredBrandCategories ?
                    (filteredBrandCategories.categories.brands.private_label.items.length +
                     filteredBrandCategories.categories.brands.external.items.length +
                     filteredBrandCategories.categories.areas.general.items.length +
                     filteredBrandCategories.categories.areas.architectural.items.length +
                     filteredBrandCategories.categories.areas.other.items.length) :
                    filteredBrands.length
                  } of {brands.length} brands shown
                </>
              ) : (
                `${brands.length} brands available`
              )}
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