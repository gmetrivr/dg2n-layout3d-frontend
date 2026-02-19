import { Button } from '@/shadcn/components/ui/button';
import { Select } from '../ui/select';
import { MultiSelect } from '../ui/multi-select';
import { Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface LayoutLeftPanelProps {
  floorIndices: number[];
  selectedFloor: number;
  onFloorChange: (floor: number) => void;
  fixtureTypes: string[];
  visibleFixtureTypes: string[];
  onFixtureTypeChange: (types: string[]) => void;
  brands: string[];
  visibleBrands: string[];
  onBrandChange: (brands: string[]) => void;
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  storeName: string;
  isViewOnly?: boolean;
  showFixtureId: boolean;
  onShowFixtureIdChange: (val: boolean) => void;
}

export function LayoutLeftPanel({
  floorIndices,
  selectedFloor,
  onFloorChange,
  fixtureTypes,
  visibleFixtureTypes,
  onFixtureTypeChange,
  brands,
  visibleBrands,
  onBrandChange,
  hasChanges,
  isSaving,
  onSave,
  storeName,
  isViewOnly,
  showFixtureId,
  onShowFixtureIdChange,
}: LayoutLeftPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute top-4 left-4 z-40 bg-background/90 backdrop-blur-sm border border-border rounded-lg shadow-lg w-64">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Store Layout 2D</span>
          {storeName && (
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">{storeName}</span>
          )}
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-4 p-4 pt-0">
          {/* Save Button — hidden in view-only mode */}
          {!isViewOnly && (
            <>
              <Button
                size="sm"
                onClick={onSave}
                disabled={!hasChanges || isSaving}
                className="w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Store
                  </>
                )}
              </Button>

              <div className="border-t border-border" />
            </>
          )}

          {/* Floor Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Floor:</label>
            <Select
              value={String(selectedFloor)}
              onChange={(e) => onFloorChange(Number(e.target.value))}
              className="w-full text-sm h-8"
            >
              {floorIndices.map((fi) => (
                <option key={fi} value={fi}>
                  Floor {fi}
                </option>
              ))}
            </Select>
          </div>

          {/* Fixture Type Filter */}
          {fixtureTypes.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Fixture Type:</label>
              <MultiSelect
                value={visibleFixtureTypes}
                onChange={onFixtureTypeChange}
                options={fixtureTypes.map((t) => ({ value: t, label: t }))}
                allOption={{ value: 'all', label: 'All Types' }}
                className="w-full"
              />
            </div>
          )}

          {/* Brand Filter */}
          {brands.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Brand:</label>
              <MultiSelect
                value={visibleBrands}
                onChange={onBrandChange}
                options={brands.map((b) => ({ value: b, label: b }))}
                allOption={{ value: 'all', label: 'All Brands' }}
                className="w-full"
              />
            </div>
          )}

          <div className="border-t border-border" />

          {/* Label mode toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Show Fixture ID</label>
            <button
              type="button"
              role="switch"
              aria-checked={showFixtureId}
              onClick={() => onShowFixtureIdChange(!showFixtureId)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                showFixtureId ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  showFixtureId ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
