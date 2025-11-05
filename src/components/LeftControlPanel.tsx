import { useState } from 'react';
import { Loader2, ChevronDown, ChevronRight, Settings, Plus } from 'lucide-react';
import { Select } from "./ui/select";
import { Button } from "@/shadcn/components/ui/button";
import { getGlbTitle, isShatteredFloorPlateFile } from '../utils/zipUtils';
import type { ExtractedFile } from '../utils/zipUtils';

interface LeftControlPanelProps {
  // File state
  glbFiles: ExtractedFile[];
  selectedFile: ExtractedFile | null;
  selectedFloorFile: ExtractedFile | null;
  extractedFiles: ExtractedFile[];

  // UI state
  showSpheres: boolean;
  showWireframe: boolean;
  showFixtureLabels: boolean;
  showWalls: boolean;
  editMode: boolean;
  editFloorplatesMode: boolean;
  transformSpace: 'world' | 'local';

  // Fixture data
  fixtureTypes: string[];
  selectedFixtureType: string;
  brands: string[];
  selectedBrand: string;

  // Floor plates data
  floorPlatesData: Record<string, Record<string, any[]>>;
  modifiedFloorPlates: Map<string, any>;
  getBrandCategory: (brand: string) => 'pvl' | 'ext' | 'gen' | 'arx' | 'oth' | 'legacy';

  // Export state
  isExporting: boolean;
  isExportingZip: boolean;

  // Changed data tracking
  deletedFixtures: Set<string>;
  locationData: any[]; // For detecting duplicated fixtures and modifications

  // Job info
  jobId?: string | null;

  // Floor display order
  floorDisplayOrder?: number[];
  initialFloorCount?: number;

  // Architectural objects
  architecturalObjectsCount?: number;

  // Event handlers
  onFloorFileChange: (file: ExtractedFile | null) => void;
  onShowSpheresChange: (show: boolean) => void;
  onFixtureTypeChange: (type: string) => void;
  onBrandChange: (brand: string) => void;
  onShowWireframeChange: (show: boolean) => void;
  onShowFixtureLabelsChange: (show: boolean) => void;
  onShowWallsChange: (show: boolean) => void;
  onEditModeChange: (enabled: boolean) => void;
  onTransformSpaceChange: (space: 'world' | 'local') => void;
  onDownloadGLB: () => void;
  onDownloadModifiedZip: () => void;
  onSaveStoreClick?: () => void;
  onManageFloorsClick?: () => void;
  onAddFixtureClick?: () => void;
  onAddObjectsClick?: () => void;
}

export function LeftControlPanel({
  glbFiles,
  selectedFile,
  selectedFloorFile,
  extractedFiles,
  showSpheres,
  showWireframe,
  showFixtureLabels,
  showWalls,
  editMode,
  editFloorplatesMode,
  transformSpace,
  fixtureTypes,
  selectedFixtureType,
  brands,
  selectedBrand,
  floorPlatesData,
  modifiedFloorPlates,
  getBrandCategory,
  isExporting,
  isExportingZip,
  deletedFixtures,
  locationData,
  jobId,
  floorDisplayOrder,
  initialFloorCount,
  architecturalObjectsCount,
  onFloorFileChange,
  onShowSpheresChange,
  onFixtureTypeChange,
  onBrandChange,
  onShowWireframeChange,
  onShowFixtureLabelsChange,
  onShowWallsChange,
  onEditModeChange,
  onTransformSpaceChange,
  onDownloadGLB,
  onDownloadModifiedZip,
  onSaveStoreClick,
  onManageFloorsClick,
  onAddFixtureClick,
  onAddObjectsClick,
}: LeftControlPanelProps) {
  // Collapsible state
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Sort floor files by display order
  const getSortedFloorFiles = () => {
    const floorFiles = glbFiles.filter(file => !isShatteredFloorPlateFile(file.name));

    if (!floorDisplayOrder || floorDisplayOrder.length === 0) {
      // No display order, sort by floor number
      return floorFiles.sort((a, b) => {
        const getFloorNumber = (filename: string) => {
          const match = filename.match(/floor[_-]?(\d+)/i) || filename.match(/(\d+)/i);
          return match ? parseInt(match[1]) : 0;
        };
        return getFloorNumber(a.name) - getFloorNumber(b.name);
      });
    }

    // Sort by display order
    return floorFiles.sort((a, b) => {
      const getFloorNumber = (filename: string) => {
        const match = filename.match(/floor[_-]?(\d+)/i) || filename.match(/(\d+)/i);
        return match ? parseInt(match[1]) : 0;
      };

      const aFloorNum = getFloorNumber(a.name);
      const bFloorNum = getFloorNumber(b.name);
      const aPos = floorDisplayOrder.indexOf(aFloorNum);
      const bPos = floorDisplayOrder.indexOf(bFloorNum);

      // If both are in the display order, sort by position
      if (aPos >= 0 && bPos >= 0) {
        return aPos - bPos;
      }
      // If only one is in the display order, it comes first
      if (aPos >= 0) return -1;
      if (bPos >= 0) return 1;
      // If neither is in the display order, sort by floor number
      return aFloorNum - bFloorNum;
    });
  };
  
  // Function to detect if there are duplicated fixtures
  // Duplicated fixtures are those with _updateTimestamp (added after initial load)
  const hasDuplicatedFixtures = () => {
    return locationData.some(location => location._updateTimestamp !== undefined);
  };

  // Function to detect if floors have been reordered
  const hasFloorReordering = () => {
    if (!floorDisplayOrder || floorDisplayOrder.length === 0) return false;

    // Check if the display order is different from the natural sorted order
    const originalOrder = [...floorDisplayOrder].sort((a, b) => a - b);
    return floorDisplayOrder.some((idx, i) => idx !== originalOrder[i]);
  };

  // Function to detect if floors have been deleted
  const hasFloorDeletion = () => {
    if (!floorDisplayOrder || floorDisplayOrder.length === 0) return false;
    if (!initialFloorCount || initialFloorCount === 0) return false;

    // If display order has fewer floors than the initial count, some were deleted
    return floorDisplayOrder.length < initialFloorCount;
  };

  // Check if there are any changes that warrant downloading the zip using embedded data
  const hasChanges = locationData.some(location =>
    location.wasMoved || location.wasRotated || location.wasTypeChanged ||
    location.wasBrandChanged || location.wasCountChanged || location.wasHierarchyChanged
  ) || modifiedFloorPlates.size > 0 ||
                    deletedFixtures.size > 0 ||
                    hasDuplicatedFixtures() ||
                    hasFloorReordering() ||
                    hasFloorDeletion() ||
                    (architecturalObjectsCount && architecturalObjectsCount > 0);

  return (
    <div className="absolute top-4 left-4 z-50">
      <div className="bg-background/90 backdrop-blur-sm border border-border rounded-lg shadow-lg w-64">
        {/* Controls Header */}
        <div 
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-background/60 transition-colors rounded-t-lg"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <h3 className="text-sm font-semibold text-foreground">Controls</h3>
          <div className="text-muted-foreground hover:text-foreground transition-colors">
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>
        
        {/* Collapsible Content */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isCollapsed ? 'max-h-0' : 'max-h-[800px]'
        }`}>
          <div className="flex flex-col gap-4 p-4 pt-0">
            {/* Save Store */}
            <div className="flex">
              <button
                onClick={onSaveStoreClick}
                disabled={extractedFiles.length === 0}
                className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Store
              </button>
            </div>
        
        {/* Model Selector */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Floor:</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={onManageFloorsClick}
              className="h-6 w-6 p-0"
              title="Manage floors"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <Select
            value={selectedFloorFile?.name || selectedFile?.name || ''}
            onChange={(e) => {
              const file = glbFiles.find(f => f.name === e.target.value);
              onFloorFileChange(file || null);
            }}
            className="w-48"
          >
            {getSortedFloorFiles().map((file) => (
              <option key={file.name} value={file.name}>
                {getGlbTitle(file.name)}
              </option>
            ))}
          </Select>
        </div>
        
        {/* Show Walls Checkbox */}
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="showWalls" 
            checked={showWalls}
            onChange={(e) => onShowWallsChange(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="showWalls" className="text-sm font-medium">Show Walls / Columns</label>
        </div>
        
        {/* Show Locations Checkbox */}
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="showSpheres" 
            checked={showSpheres}
            onChange={(e) => onShowSpheresChange(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="showSpheres" className="text-sm font-medium">Show Fixtures</label>
        </div>
        
        {/* Show Fixture Labels Checkbox */}
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="showFixtureLabels" 
            checked={showFixtureLabels}
            onChange={(e) => onShowFixtureLabelsChange(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="showFixtureLabels" className="text-sm font-medium">Show Fixture Labels</label>
        </div>
        
        {/* Fixture Type Filter */}
        {fixtureTypes.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Fixture Type:</label>
            <Select 
              value={selectedFixtureType} 
              onChange={(e) => onFixtureTypeChange(e.target.value)}
              className="w-48"
            >
              <option value="all">All Types</option>
              {fixtureTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Brand Filter */}
        {brands.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Brand:</label>
            <Select 
              value={selectedBrand} 
              onChange={(e) => onBrandChange(e.target.value)}
              className="w-48"
            >
              <option value="all">All Brands</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </Select>
          </div>
        )}
        
        {/* Horizontal Separator */}
        <div className="border-t border-border"></div>
        
        {/* Edit Fixtures Switch */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Edit Fixtures:</label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={editMode}
              onChange={(e) => onEditModeChange(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-11 h-6 rounded-full transition-colors ${
              editMode ? 'bg-blue-600' : 'bg-gray-300'
            }`}>
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                editMode ? 'translate-x-5' : 'translate-x-0.5'
              } mt-0.5`} />
            </div>
          </label>
        </div>

        {/* Add Fixture Button */}
        {editMode && (
          <div className="flex gap-2">
            <button
              onClick={onAddFixtureClick}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              Add Fixture
            </button>
            <button
              onClick={onAddObjectsClick}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-secondary text-secondary-foreground hover:opacity-90 w-full justify-center"
            >
              <Plus className="h-4 w-4" />
              Add Objects
            </button>
          </div>
        )}

        {/* Floor Plates Controls */}
        {editFloorplatesMode && (() => {
          // Calculate counts for current floor
          const fileForFloorExtraction = selectedFloorFile || selectedFile;
          const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]plates[_-](\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
          const currentFloor = floorMatch ? floorMatch[1] : '0';
          const currentFloorPlatesData = floorPlatesData[currentFloor] || {};
          
          // Count all brand categories, considering modifications
          const categoryCounts = {
            pvl: 0,
            ext: 0,
            gen: 0,
            arx: 0,
            oth: 0,
            legacy: 0
          };
          
          // Count from original data
          Object.entries(currentFloorPlatesData).forEach(([brand, plates]) => {
            const category = getBrandCategory(brand);
            categoryCounts[category] += (plates as any[]).length;
          });
          
          // Adjust counts based on modifications (only for current floor)
          modifiedFloorPlates.forEach((modifiedData, key) => {
            // Check if this modification belongs to a floor plate in the current floor
            // by checking if the mesh name exists in the current floor data
            let isCurrentFloorPlate = false;
            Object.values(currentFloorPlatesData).forEach(plates => {
              if ((plates as any[]).some((plate: any) => plate.meshName === key || `${plate.surfaceId}-${plate.brand}` === key)) {
                isCurrentFloorPlate = true;
              }
            });
            
            if (!isCurrentFloorPlate) return;
            
            const originalBrand = modifiedData.originalBrand || modifiedData.brand;
            const newBrand = modifiedData.brand;
            
            // Remove from original count
            const originalCategory = getBrandCategory(originalBrand);
            categoryCounts[originalCategory]--;
            
            // Add to new count
            const newCategory = getBrandCategory(newBrand);
            categoryCounts[newCategory]++;
          });
          
          return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="showWireframe" 
                  checked={showWireframe}
                  onChange={(e) => onShowWireframeChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="showWireframe" className="text-sm font-medium">Wireframe</label>
              </div>
              
              <div className="border-t border-border pt-2">
                <label className="text-sm font-medium">Categories:</label>
                <div className="flex flex-col gap-1 text-xs mt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: '#4169e1' }}></div>
                      <span>PVL- (Private Label)</span>
                    </div>
                    <span className="text-muted-foreground">({categoryCounts.pvl})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: '#32cd32' }}></div>
                      <span>EXT- (External)</span>
                    </div>
                    <span className="text-muted-foreground">({categoryCounts.ext})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ffa500' }}></div>
                      <span>GEN- (General)</span>
                    </div>
                    <span className="text-muted-foreground">({categoryCounts.gen})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: '#808080' }}></div>
                      <span>ARX- (Architectural)</span>
                    </div>
                    <span className="text-muted-foreground">({categoryCounts.arx})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ff0000' }}></div>
                      <span>OTH- (Unassigned)</span>
                    </div>
                    <span className="text-muted-foreground">({categoryCounts.oth})</span>
                  </div>
                  {categoryCounts.legacy > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: '#cccccc' }}></div>
                        <span>Legacy (No prefix)</span>
                      </div>
                      <span className="text-muted-foreground">({categoryCounts.legacy})</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
        
        
        
        {/* Download Buttons */}
        <div className="border-t border-border pt-2 space-y-2">
          <button
            onClick={onDownloadGLB}
            disabled={isExporting || !selectedFile}
            className="text-sm underline text-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Exporting...
              </span>
            ) : (
              'Download GLB'
            )}
          </button>
          
          <button
            onClick={onDownloadModifiedZip}
            disabled={isExportingZip || extractedFiles.length === 0 || !hasChanges}
            className="text-sm underline text-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed block"
          >
            {isExportingZip ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Creating ZIP...
              </span>
            ) : (
              'Download Edited ZIP'
            )}
          </button>
          
          <div className="text-xs text-muted-foreground">
            Downloads all original files with edited CSV values updated in place.
          </div>
          
          {/* Transform Space Toggle */}
          {editMode && (
            <div className="pt-2 border-t border-border">
              <label className="flex items-center justify-between text-sm">
                <span>Transform Axes:</span>
                <select 
                  value={transformSpace}
                  onChange={(e) => onTransformSpaceChange(e.target.value as 'world' | 'local')}
                  className="text-xs bg-background border border-border rounded px-1 py-0.5"
                >
                  <option value="world">Global</option>
                  <option value="local">Local</option>
                </select>
              </label>
              <div className="text-xs text-muted-foreground mt-1">
                {transformSpace === 'world' 
                  ? 'Move along world X/Z axes' 
                  : 'Move along object\'s local axes'
                }
              </div>
            </div>
          )}
        </div>
        
        {/* Job Info */}
        {jobId && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2">
            <div>Job: {jobId}</div>
            <div>{extractedFiles.length} files extracted</div>
            {selectedFile && (
              <div className="truncate max-w-[200px]">
                Current: {selectedFile.name}
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
