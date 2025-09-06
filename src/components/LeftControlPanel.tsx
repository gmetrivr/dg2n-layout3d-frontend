import { Loader2 } from 'lucide-react';
import { Select } from "./ui/select";
import { getGlbTitle } from '../utils/zipUtils';
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
  
  // Event handlers
  onFloorFileChange: (file: ExtractedFile | null) => void;
  onShowSpheresChange: (show: boolean) => void;
  onFixtureTypeChange: (type: string) => void;
  onBrandChange: (brand: string) => void;
  onShowWireframeChange: (show: boolean) => void;
  onShowFixtureLabelsChange: (show: boolean) => void;
  onShowWallsChange: (show: boolean) => void;
  onEditModeChange: (mode: 'off' | 'fixtures' | 'floorplates') => void;
  onTransformSpaceChange: (space: 'world' | 'local') => void;
  onDownloadGLB: () => void;
  onDownloadModifiedZip: () => void;
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
}: LeftControlPanelProps) {
  // Function to detect if there are duplicated fixtures
  // Duplicated fixtures are those with _updateTimestamp (added after initial load)
  const hasDuplicatedFixtures = () => {
    return locationData.some(location => location._updateTimestamp !== undefined);
  };
  
  // Check if there are any changes that warrant downloading the zip using embedded data
  const hasChanges = locationData.some(location => 
    location.wasMoved || location.wasRotated || location.wasTypeChanged || 
    location.wasBrandChanged || location.wasCountChanged || location.wasHierarchyChanged
  ) || modifiedFloorPlates.size > 0 ||
                    deletedFixtures.size > 0 ||
                    hasDuplicatedFixtures();

  return (
    <div className="absolute top-4 left-4 z-50">
      <div className="flex flex-col gap-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg">
        
        {/* Model Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Floor:</label>
          <Select 
            value={selectedFloorFile?.name || selectedFile?.name || ''} 
            onChange={(e) => {
              const file = glbFiles.find(f => f.name === e.target.value);
              onFloorFileChange(file || null);
            }}
            className="w-48"
          >
            {glbFiles
              .filter(file => !file.name.includes('dg2n-shattered-floor-plates-'))
              .map((file) => (
                <option key={file.name} value={file.name}>
                  {getGlbTitle(file.name)}
                </option>
              ))
            }
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
          <label htmlFor="showWalls" className="text-sm font-medium">Show Walls</label>
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
        
        {/* Edit Mode Dropdown */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Edit:</label>
          <Select 
            value={editFloorplatesMode ? "floorplates" : editMode ? "fixtures" : "off"} 
            onChange={(e) => onEditModeChange(e.target.value as 'off' | 'fixtures' | 'floorplates')}
            className="w-48"
          >
            <option value="off">Off</option>
            <option value="fixtures">Fixtures</option>
            <option value="floorplates">Floor Plates</option>
          </Select>
        </div>
        
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
        
        {/* Warning for any edit mode */}
        {(editMode || editFloorplatesMode) && (
          <div className="text-yellow-400 text-xs max-w-[200px]">
            This is a feature preview. Edit changes are not saved.
          </div>
        )}
        
        
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
  );
}