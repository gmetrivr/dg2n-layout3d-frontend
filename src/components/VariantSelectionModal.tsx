import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose
} from "@/shadcn/components/ui/dialog";
import { apiService, type FixtureVariant } from '../services/api';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from "@/shadcn/components/ui/button";

interface VariantSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixtureType: string;
  currentVariant: string;
  onVariantSelect: (variant: FixtureVariant) => void;
  pipelineVersion?: string;
  onBack?: () => void; // Optional back button handler
}

export function VariantSelectionModal({
  open,
  onOpenChange,
  fixtureType,
  currentVariant,
  onVariantSelect,
  pipelineVersion = '02',
  onBack
}: VariantSelectionModalProps) {
  const [variants, setVariants] = useState<FixtureVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && fixtureType) {
      loadVariants();
    }
  }, [open, fixtureType]);

  const loadVariants = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getFixtureTypeVariants(fixtureType, pipelineVersion);
      setVariants(response.variants);
    } catch (err) {
      console.error('[VariantSelectionModal] Failed to load variants:', err);
      setError('Failed to load variants. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVariantSelect = (variant: FixtureVariant) => {
    onVariantSelect(variant);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <div>
              <DialogTitle>Select Variant</DialogTitle>
              <div className="mt-2">
                <DialogDescription>
                  Choose a variant for {fixtureType}
                </DialogDescription>
              </div>
            </div>
            <DialogClose onClick={() => onOpenChange(false)} />
          </div>
        </DialogHeader>

        <div className="px-6 pb-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading variants...</span>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && variants.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No variants available for this fixture type.
            </div>
          )}

          {!loading && !error && variants.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {variants.map((variant, index) => (
                <button
                  key={variant.id || index}
                  onClick={() => handleVariantSelect(variant)}
                  className={`
                    flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all
                    ${(variant.name || variant.block_name) === currentVariant
                      ? 'border-accent-foreground bg-accent shadow-md'
                      : 'border-border hover:border-muted-foreground hover:bg-accent/50'
                    }
                  `}
                >
                  {/* Thumbnail preview */}
                  <div className="w-full h-24 bg-muted rounded-md mb-3 flex items-center justify-center overflow-hidden">
                    {variant.thumbnail ? (
                      <img
                        src={variant.thumbnail}
                        alt={variant.name || variant.block_name || 'Variant preview'}
                        className="w-full h-full object-contain"
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          // Fallback to placeholder if image fails to load (403, 404, CORS, etc.)
                          console.warn(`[VariantSelectionModal] Failed to load thumbnail: ${variant.thumbnail}`, e);
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = '<span class="text-xs text-muted-foreground">Preview unavailable</span>';
                          }
                        }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Preview</span>
                    )}
                  </div>

                  <span className="font-medium text-sm text-center text-foreground">
                    {variant.name || variant.block_name}
                  </span>

                  {variant.description && (
                    <span className="text-xs text-muted-foreground mt-1 text-center line-clamp-2">
                      {variant.description}
                    </span>
                  )}

                  {(variant.name || variant.block_name) === currentVariant && (
                    <span className="text-xs text-accent-foreground mt-2 font-medium">
                      Currently Selected
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Back button - only show if onBack handler is provided */}
          {onBack && (
            <div className="mt-6 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={onBack}
                className="text-foreground hover:text-foreground hover:bg-accent flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Object Selection
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
