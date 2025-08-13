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
import { Settings, RotateCcw, Info } from 'lucide-react';
import type { 
  ToleranceOverrides, 
  ToleranceConfig
} from '../types/tolerance';
import { buildToleranceConfig } from '../types/tolerance';
import { apiService } from '../services/api';

interface ToleranceOverrideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineVersion: string;
  onApply: (overrides: ToleranceOverrides) => void;
  currentOverrides?: ToleranceOverrides;
}

export function ToleranceOverrideModal({ 
  open, 
  onOpenChange, 
  pipelineVersion, 
  onApply,
  currentOverrides = {}
}: ToleranceOverrideModalProps) {
  const [overrides, setOverrides] = useState<ToleranceOverrides>(currentOverrides);
  const [toleranceConfig, setToleranceConfig] = useState<ToleranceConfig>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOverrides(currentOverrides);
  }, [currentOverrides, open]);

  // Fetch tolerance defaults when pipeline version changes or modal opens
  useEffect(() => {
    if (open && pipelineVersion) {
      const fetchDefaults = async () => {
        setLoading(true);
        setError(null);
        try {
          const response = await apiService.getToleranceDefaults(pipelineVersion);
          const config = buildToleranceConfig(response.default_tolerances);
          setToleranceConfig(config);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load tolerance defaults');
          console.error('Failed to fetch tolerance defaults:', err);
        } finally {
          setLoading(false);
        }
      };
      
      fetchDefaults();
    }
  }, [open, pipelineVersion]);

  const handleInputChange = (key: keyof ToleranceConfig, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setOverrides(prev => ({ ...prev, [key]: numValue }));
    }
  };

  const handleReset = () => {
    setOverrides({});
  };

  const handleApply = () => {
    // Filter out undefined values and only include values different from defaults
    const filteredOverrides: ToleranceOverrides = {};
    Object.entries(overrides).forEach(([key, value]) => {
      if (value !== undefined && value !== toleranceConfig[key as keyof ToleranceConfig].value) {
        filteredOverrides[key as keyof ToleranceOverrides] = value;
      }
    });
    
    onApply(filteredOverrides);
    onOpenChange(false);
  };

  const getCurrentValue = (key: string): number => {
    return overrides[key as keyof ToleranceOverrides] ?? toleranceConfig[key].value;
  };

  const hasChanges = Object.keys(overrides).some(
    key => overrides[key as keyof ToleranceOverrides] !== undefined &&
           overrides[key as keyof ToleranceOverrides] !== toleranceConfig[key as keyof ToleranceConfig].value
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <DialogTitle>Advanced Tolerance Settings</DialogTitle>
            </div>
            <DialogClose onClick={() => onOpenChange(false)} />
          </div>
        </DialogHeader>

        <div className="px-6 pb-4">
          <DialogDescription>
            Fine-tune geometric tolerances for pipeline {pipelineVersion}. 
            Only modified values will be applied as overrides.
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
                <Settings className="h-4 w-4 animate-spin" />
                <span>Loading tolerance defaults...</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(toleranceConfig).map(([key, config]) => {
              const currentValue = getCurrentValue(key);
              const isOverridden = overrides[key as keyof ToleranceOverrides] !== undefined;
              
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                      {config.label}
                      {config.unit && (
                        <span className="text-muted-foreground ml-1">({config.unit})</span>
                      )}
                    </label>
                    {isOverridden && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                        Modified
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      value={currentValue}
                      onChange={(e) => handleInputChange(key as keyof ToleranceConfig, e.target.value)}
                      min={config.min}
                      max={config.max}
                      step={config.step}
                      className={`
                        w-32 px-3 py-2 text-sm border rounded-md bg-background text-foreground
                        ${isOverridden ? 'border-primary' : 'border-border'}
                        focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
                      `}
                    />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                      <Info className="h-3 w-3 flex-shrink-0" />
                      <span className="whitespace-nowrap">Default: {config.value}</span>
                    </div>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    {config.description}
                  </p>
                </div>
              );
            })}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </Button>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                {hasChanges 
                  ? `Apply Overrides (${Object.keys(overrides).filter(k => overrides[k as keyof ToleranceOverrides] !== undefined).length} changes)` 
                  : 'Apply Defaults'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}