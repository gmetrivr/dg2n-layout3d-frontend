import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFExporter, GLTFLoader, DRACOLoader } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';
import { Button } from "@/shadcn/components/ui/button";
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiService, type JobStatus, type BrandCategoriesResponse } from '../services/api';
import { extractZipFiles, cleanupExtractedFiles, type ExtractedFile } from '../utils/zipUtils';
import JSZip from 'jszip';
import { BrandSelectionModal } from './BrandSelectionModal';
import { FixtureTypeSelectionModal } from './FixtureTypeSelectionModal';
import { LeftControlPanel } from './LeftControlPanel';
import { RightInfoPanel } from './RightInfoPanel';
import { MultiRightInfoPanel } from './MultiRightInfoPanel';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { Canvas3D } from './Canvas3D';
import { useFixtureSelection, type LocationData, generateFixtureUID, generateOriginalUID } from '../hooks/useFixtureSelection';
import { useFixtureModifications } from '../hooks/useFixtureModifications';

// Fixture type mapping
const FIXTURE_TYPE_MAPPING: Record<string, string> = {
  "RTL-4W": "4-WAY",
  "RTL-SR": "A-RAIL", 
  "RTL-HG": "H-GONDOLA",
  "RTL-NT": "NESTED-TABLE",
  "TJR-NT": "GLASS-TABLE",
  "RTL-WPS-M-3Bays": "WALL-BAY"
};

// Helper function to get brand category
function getBrandCategory(brand: string): 'pvl' | 'ext' | 'gen' | 'arx' | 'oth' | 'legacy' {
  if (!brand) return 'oth';
  
  const normalizedBrand = brand.toLowerCase().trim();
  
  // Handle empty or unassigned cases
  if (normalizedBrand === '' || 
      normalizedBrand === 'unknown' || 
      normalizedBrand === 'unassigned' ||
      normalizedBrand === 'na' ||
      normalizedBrand === 'null' ||
      normalizedBrand === 'undefined') {
    return 'oth';
  }
  
  // Handle prefixed brands
  if (normalizedBrand.startsWith('pvl-')) return 'pvl';
  if (normalizedBrand.startsWith('ext-')) return 'ext';
  if (normalizedBrand.startsWith('gen-')) return 'gen';
  if (normalizedBrand.startsWith('arx-')) return 'arx';
  if (normalizedBrand.startsWith('oth-')) return 'oth';
  
  // Handle legacy arch
  if (normalizedBrand === 'arch') return 'arx';
  
  // Everything else is legacy brand
  return 'legacy';
}










export function ThreeDViewerModifier() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const [, setJob] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [glbFiles, setGlbFiles] = useState<ExtractedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ExtractedFile | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [locationData, setLocationData] = useState<LocationData[]>([]);
  const [showSpheres, setShowSpheres] = useState<boolean>(true);
  //const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([10, 10, 10]);
  const [orbitTarget, setOrbitTarget] = useState<[number, number, number]>([0, 0, 0]);
  const [failedGLBs, setFailedGLBs] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editFloorplatesMode, setEditFloorplatesMode] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [floorPlatesData, setFloorPlatesData] = useState<Record<string, Record<string, any[]>>>({});
  const [selectedFloorFile, setSelectedFloorFile] = useState<ExtractedFile | null>(null); // The floor selected in dropdown
  const [selectedFloorPlate, setSelectedFloorPlate] = useState<any | null>(null); // Selected floor plate data
  const [showWireframe, setShowWireframe] = useState(false);
  const [transformSpace, setTransformSpace] = useState<'world' | 'local'>('world');
  const [isExporting, setIsExporting] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [fixtureTypeModalOpen, setFixtureTypeModalOpen] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [, setBrandCategories] = useState<BrandCategoriesResponse | null>(null);
  const [fixtureCache, setFixtureCache] = useState<Map<string, string>>(new Map());
  const [fixtureTypes, setFixtureTypes] = useState<string[]>([]);
  const [selectedFixtureType, setSelectedFixtureType] = useState<string>('all');
  const [fixtureTypeMap, setFixtureTypeMap] = useState<Map<string, string>>(new Map());

  // Use custom hooks for fixture selection and modifications
  const {
    selectedLocation,
    selectedLocations,
    setSelectedLocation,
    setSelectedLocations,
    handleFixtureClick,
    isLocationSelected,
    clearSelections,
  } = useFixtureSelection(editFloorplatesMode);

  const {
    modifiedFloorPlates,
    deletedFixtures,
    deletedFixturePositions,
    deleteConfirmationOpen,
    fixturesToDelete,
    setModifiedFloorPlates,
    setDeleteConfirmationOpen,
    handlePositionChange,
    handleRotateFixture,
    handleMultiRotateFixture,
    handleResetPosition,
    handleBrandChange,
    handleFixtureBrandChange,
    handleFixtureCountChange,
    handleFixtureCountChangeMulti,
    handleFixtureHierarchyChange,
    handleFixtureHierarchyChangeMulti,
    handleDuplicateFixture,
    handleDeleteFixture,
    handleDeleteFixtures,
    handleConfirmDelete,
    handleSplitFixture,
    canMergeFixtures,
    handleMergeFixtures,
  } = useFixtureModifications(
    selectedLocation,
    selectedLocations,
    selectedFloorPlate,
    setSelectedLocation,
    setSelectedLocations,
    setLocationData,
    setSelectedFloorPlate
  );

  // Function to load fixture GLBs in batch from API
  const loadFixtureGLBs = useCallback(async (blockNames: string[]): Promise<Map<string, string>> => {
    const urlMap = new Map<string, string>();
    
    // Filter out already cached blocks
    const uncachedBlocks = blockNames.filter(name => !fixtureCache.has(name));
    
    if (uncachedBlocks.length === 0) {
      // All blocks are cached, return cached URLs
      blockNames.forEach(name => {
        const cachedUrl = fixtureCache.get(name);
        if (cachedUrl) {
          urlMap.set(name, cachedUrl);
        }
      });
      return urlMap;
    }

    try {
      const fixtureBlocks = await apiService.getFixtureBlocks(uncachedBlocks);
      
      // Update cache and build URL map, also store fixture types
      const newCacheEntries = new Map(fixtureCache);
      const newTypeMap = new Map(fixtureTypeMap);
      fixtureBlocks.forEach(block => {
        if (block.glb_url) {
          newCacheEntries.set(block.block_name, block.glb_url);
          urlMap.set(block.block_name, block.glb_url);
          // Store the fixture type for filtering
          if (block.fixture_type) {
            newTypeMap.set(block.block_name, block.fixture_type);
          }
        }
      });
      
      setFixtureTypeMap(newTypeMap);
      
      // Add previously cached URLs to the result
      blockNames.forEach(name => {
        if (fixtureCache.has(name)) {
          const cachedUrl = fixtureCache.get(name)!;
          urlMap.set(name, cachedUrl);
        }
      });
      
      setFixtureCache(newCacheEntries);
      return urlMap;
    } catch (error) {
      console.warn('Failed to load fixture GLBs:', error);
      return urlMap;
    }
  }, [fixtureCache, fixtureTypeMap]);

  const handleBoundsCalculated = (center: [number, number, number], size: [number, number, number]) => {
    // Position camera to view the entire model
    const maxDimension = Math.max(...size);
    const distance = maxDimension * 1.5; // Adjust multiplier as needed
    setCameraPosition([center[0] + distance, center[1] + distance, center[2] + distance]);
    setOrbitTarget(center); // Set orbit target to the model center
  };

  const handleGLBError = (blockName: string, url: string) => {
    setFailedGLBs(prev => {
      const newSet = new Set(prev);
      newSet.add(`${blockName} (${url})`);
      return newSet;
    });
  };

  const handleFixtureTypeChange = useCallback(async (newType: string) => {
    // For now, only support single selection for fixture type changes
    // Multi-selection fixture type changes could be complex due to different GLB URLs
    if (!selectedLocation || selectedLocations.length > 1) return;
    
    try {
      // Get new GLB URL for the fixture type
      const fixtureTypeInfo = await apiService.getFixtureTypeUrl(newType);
      const newGlbUrl = fixtureTypeInfo.glb_url;
      
      // Clear the old GLB from Three.js cache to ensure fresh loading
      if (selectedLocation.glbUrl) {
        // Clear old GLB from cache
        useGLTF.clear(selectedLocation.glbUrl);
      }
      // Preload new GLB
      useGLTF.preload(newGlbUrl);
      
      // Small delay to ensure cache clearing takes effect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Find the mapped blockName for this fixture type
      const mappedBlockName = Object.keys(FIXTURE_TYPE_MAPPING).find(
        blockName => FIXTURE_TYPE_MAPPING[blockName] === newType
      ) || newType; // fallback to newType if not found in mapping
      
      // Update the fixture cache with new GLB URL
      setFixtureCache(prev => {
        const newCache = new Map(prev);
        // Use the mapped block name for modified fixtures
        newCache.set(mappedBlockName, newGlbUrl);
        return newCache;
      });
      
      // Update the fixture type map
      setFixtureTypeMap(prev => {
        const newMap = new Map(prev);
        newMap.set(mappedBlockName, newType);
        return newMap;
      });
      
      // Update location data with new GLB URL and mapped block name
      // Use the exact same fixture by UID to avoid position issues
      const selectedUID = generateFixtureUID(selectedLocation);
      setLocationData(prev => 
        prev.map(loc => {
          const locUID = generateFixtureUID(loc);
          if (locUID === selectedUID) {
            // Use current position from embedded data (already includes any moves)
            const currentPos = [loc.posX, loc.posY, loc.posZ];
            
            return { 
              ...loc,
              // Commit the current position (moved or original) to the actual position fields
              posX: currentPos[0],
              posY: currentPos[1], 
              posZ: currentPos[2],
              blockName: mappedBlockName, 
              glbUrl: newGlbUrl,
              // Set modification flags
              wasTypeChanged: true,
              wasMoved: loc.wasMoved || false,
              // Preserve original state (set once)
              originalBlockName: loc.originalBlockName || loc.blockName,
              originalPosX: loc.originalPosX ?? loc.posX,
              originalPosY: loc.originalPosY ?? loc.posY,
              originalPosZ: loc.originalPosZ ?? loc.posZ,
              originalGlbUrl: loc.originalGlbUrl || loc.glbUrl,
              _updateTimestamp: Date.now() // Force React to see this as a new object
            };
          }
          return loc;
        })
      );
      
      // Update selected location - it will be updated from locationData change above
      setSelectedLocation(prev => {
        if (!prev) return null;
        
        return { 
          ...prev, 
          blockName: mappedBlockName, 
          glbUrl: newGlbUrl,
          wasTypeChanged: true,
          originalBlockName: prev.originalBlockName || prev.blockName,
          originalGlbUrl: prev.originalGlbUrl || prev.glbUrl
        };
      });
      
    } catch (error) {
      console.error('Failed to change fixture type:', error);
      // Could add error toast here
    }
  }, [selectedLocation, fixtureTypeMap]);

  const handleDownloadGLB = useCallback(async () => {
    if (!selectedFile || isExporting) return;
    
    setIsExporting(true);
    
    let dracoLoader: DRACOLoader | null = null;
    
    try {
      // Create a new scene to combine all GLB models
      const exportScene = new THREE.Scene();
      
      // Load the floor model using GLTFLoader directly
      const loader = new GLTFLoader();
      
      // Set up DRACO loader for compressed GLBs
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(dracoLoader);
      
      // Add the floor model
      const floorGLTF = await new Promise<GLTF>((resolve, reject) => {
        loader.load(selectedFile.url, resolve, undefined, reject);
      });
      const floorModel = floorGLTF.scene.clone();
      exportScene.add(floorModel);
      
      // Get current floor index for filtering fixtures
      const fileForFloorExtraction = selectedFloorFile || selectedFile;
      const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
      const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;
      
      // Add all fixture GLBs for the current floor (excluding deleted fixtures)
      const currentFloorLocations = locationData.filter(location => {
        if (location.floorIndex !== currentFloor || !location.glbUrl) return false;
        
        // Exclude deleted fixtures
        const key = generateFixtureUID(location);
        return !deletedFixtures.has(key);
      });
      
      for (const location of currentFloorLocations) {
        try {
          const fixtureGLTF = await new Promise<GLTF>((resolve, reject) => {
            loader.load(location.glbUrl!, resolve, undefined, reject);
          });
          const fixtureModel = fixtureGLTF.scene.clone();
          
          // Apply positioning and rotation using current embedded values
          // Position - use current position (includes any moves)
          fixtureModel.position.set(location.posX, location.posZ, -location.posY);
          
          // Rotation - use current rotation (includes any rotations)
          fixtureModel.rotation.set(
            (location.rotationX * Math.PI) / 180,
            (location.rotationZ * Math.PI) / 180,
            (location.rotationY * Math.PI) / 180
          );
          
          exportScene.add(fixtureModel);
        } catch (error) {
          console.warn(`Failed to load fixture GLB for export: ${location.blockName}`, error);
        }
      }
      
      // Export the combined scene as GLB
      const exporter = new GLTFExporter();
      
      const result = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          exportScene,
          (gltf) => resolve(gltf as ArrayBuffer),
          (error) => reject(error),
          { binary: true }
        );
      });
      
      // Create and download the file
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `floor-${currentFloor}-combined.glb`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Failed to export GLB:', error);
      alert('Failed to export GLB file');
    } finally {
      // Cleanup DRACO loader
      if (dracoLoader) {
        dracoLoader.dispose();
      }
      setIsExporting(false);
    }
  }, [selectedFile, selectedFloorFile, locationData, deletedFixtures, isExporting]);

  const handleDownloadModifiedZip = useCallback(async () => {
    if (isExportingZip) return;
    
    setIsExportingZip(true);
    
    try {
      const zip = new JSZip();
      
      
      // Add all original files except the CSVs that need to be modified
      for (const file of extractedFiles) {
        if (file.name.toLowerCase().includes('location-master.csv') || 
            file.name.toLowerCase().includes('floor-plate-master.csv') ||
            file.name.toLowerCase().includes('floor-plates-all.csv')) {
          continue; // Skip these, we'll add modified versions
        }
        zip.file(file.name, file.blob);
      }
      
      // Create modified location-master.csv
      await createModifiedLocationMasterCSV(zip, deletedFixturePositions);
      
      // Create modified floor plates CSV if there are floor plate changes
      if (modifiedFloorPlates.size > 0) {
        await createModifiedFloorPlatesCSV(zip);
      } else {
        // Add original floor plates CSV
        const originalFloorPlatesFile = extractedFiles.find(file => 
          file.name.toLowerCase().includes('floor-plate-master.csv') ||
          file.name.toLowerCase().includes('floor-plates-all.csv')
        );
        if (originalFloorPlatesFile) {
          zip.file(originalFloorPlatesFile.name, originalFloorPlatesFile.blob);
        }
      }
      
      // Generate and download the ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      const jobIdPrefix = jobId ? `${jobId}-` : '';
      link.download = `${jobIdPrefix}layout-${dateStr}-modified.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Failed to create modified ZIP:', error);
      alert('Failed to create modified ZIP file');
    } finally {
      setIsExportingZip(false);
    }
  }, [extractedFiles, modifiedFloorPlates, locationData, deletedFixtures, isExportingZip, jobId]);

  // Event handlers for LeftControlPanel
  const handleFloorFileChange = useCallback((file: ExtractedFile | null) => {
    setSelectedFloorFile(file);
    
    if (file) {
      // Update selectedFile based on current edit mode
      if (editFloorplatesMode) {
        const floorMatch = file.name.match(/floor[_-]?(\d+)/i) || file.name.match(/(\d+)/i);
        const currentFloor = floorMatch ? floorMatch[1] : '0';
        const shatteredFloorFile = glbFiles.find(f => 
          f.name.includes(`dg2n-shattered-floor-plates-${currentFloor}`)
        );
        setSelectedFile(shatteredFloorFile || file);
      } else {
        setSelectedFile(file);
      }
    }
  }, [editFloorplatesMode, glbFiles]);

  const handleEditModeChange = useCallback((mode: 'off' | 'fixtures' | 'floorplates') => {
    if (mode === "off") {
      setEditMode(false);
      setEditFloorplatesMode(false);
      
      // Switch back to original floor
      const baseFile = selectedFloorFile || selectedFile;
      if (baseFile) {
        const floorMatch = baseFile.name.match(/floor[_-]?(\d+)/i) || baseFile.name.match(/(\d+)/i);
        const currentFloor = floorMatch ? floorMatch[1] : '0';
        const originalFloorFile = glbFiles.find(file => 
          file.name.includes(`dg2n-3d-floor-${currentFloor}`)
        );
        if (originalFloorFile) {
          setSelectedFile(originalFloorFile);
          setSelectedFloorFile(originalFloorFile);
        }
      }
    } else if (mode === "fixtures") {
      setEditMode(true);
      setEditFloorplatesMode(false);
      
      // Switch back to original floor
      const baseFile = selectedFloorFile || selectedFile;
      if (baseFile) {
        const floorMatch = baseFile.name.match(/floor[_-]?(\d+)/i) || baseFile.name.match(/(\d+)/i);
        const currentFloor = floorMatch ? floorMatch[1] : '0';
        const originalFloorFile = glbFiles.find(file => 
          file.name.includes(`dg2n-3d-floor-${currentFloor}`)
        );
        if (originalFloorFile) {
          setSelectedFile(originalFloorFile);
          setSelectedFloorFile(originalFloorFile);
        }
      }
    } else if (mode === "floorplates") {
      setEditMode(false);
      setEditFloorplatesMode(true);
      
      // Switch to shattered floor
      const baseFile = selectedFloorFile || selectedFile;
      if (baseFile) {
        const floorMatch = baseFile.name.match(/floor[_-]?(\d+)/i) || baseFile.name.match(/(\d+)/i);
        const currentFloor = floorMatch ? floorMatch[1] : '0';
        const shatteredFloorFile = glbFiles.find(file => 
          file.name.includes(`dg2n-shattered-floor-plates-${currentFloor}`)
        );
        if (shatteredFloorFile) {
          setSelectedFile(shatteredFloorFile);
        }
      }
    }
  }, [selectedFloorFile, selectedFile, glbFiles]);

  // Event handlers for RightInfoPanel
  const handleResetFloorPlate = useCallback((plateData: any, modifiedData: any) => {
    const key = plateData.meshName || `${plateData.surfaceId}-${plateData.brand}`;
    setModifiedFloorPlates(prev => {
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
    // Reset to original brand
    const originalBrand = modifiedData?.originalBrand || plateData.brand;
    setSelectedFloorPlate((prev: any) => prev ? { ...prev, brand: originalBrand } : null);
  }, []);

  const createModifiedLocationMasterCSV = async (zip: JSZip, deletedPositions: Set<string>) => {
    
    // Find original location-master.csv
    const originalFile = extractedFiles.find(file => 
      file.name.toLowerCase().includes('location-master.csv')
    );
    
    if (!originalFile) {
      console.warn('Original location-master.csv not found');
      return;
    }
    
    // Read original CSV content
    const response = await fetch(originalFile.url);
    const csvText = await response.text();
    const lines = csvText.split('\n');
    
    
    if (lines.length === 0) return;
    
    // Keep header
    const modifiedLines = [lines[0]];
    
    // Track processed fixtures to identify duplicates
    const originalFixtures = new Set<string>();
    
    // Process each data line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Always keep empty lines and lines that don't parse correctly
      if (!line.trim()) {
        modifiedLines.push(line);
        continue;
      }
      
      const values = line.split(',');
      
      // Always keep the line, even if it doesn't have enough columns
      if (values.length < 12) {
        modifiedLines.push(line);
        continue;
      }
      
      // Try to parse the position data (using new CSV format indices)
      let blockName, posX, posY, posZ;
      try {
        blockName = values[0];
        posX = parseFloat(values[5]) || 0;  // Pos X at index 5
        posY = parseFloat(values[6]) || 0;  // Pos Y at index 6  
        posZ = parseFloat(values[7]) || 0;  // Pos Z at index 7
      } catch (error) {
        // If parsing fails, keep the original line
        modifiedLines.push(line);
        continue;
      }
      
      // Find matching location data to get the correct UID
      // First try to match by original position (for moved fixtures)
      let matchingLocation = locationData.find(loc => {
        const originalPosX = loc.originalPosX ?? loc.posX;
        const originalPosY = loc.originalPosY ?? loc.posY;
        const originalPosZ = loc.originalPosZ ?? loc.posZ;
        const originalBlockName = loc.originalBlockName ?? loc.blockName;
        
        return originalBlockName === blockName &&
               Math.abs(originalPosX - posX) < 0.001 &&
               Math.abs(originalPosY - posY) < 0.001 &&
               Math.abs(originalPosZ - posZ) < 0.001;
      });
      
      // If no match by original position, try matching by current position (for unmoved fixtures)
      if (!matchingLocation) {
        matchingLocation = locationData.find(loc => 
          loc.blockName === blockName &&
          Math.abs(loc.posX - posX) < 0.001 &&
          Math.abs(loc.posY - posY) < 0.001 &&
          Math.abs(loc.posZ - posZ) < 0.001
        );
      }
      
      if (!matchingLocation) {
        // If no matching location found, check if this CSV row represents a deleted fixture
        const csvPositionKey = `${blockName}-${posX.toFixed(3)}-${posY.toFixed(3)}-${posZ.toFixed(3)}`;
        
        if (deletedPositions.has(csvPositionKey)) {
          continue; // Skip this CSV row as it represents a deleted fixture
        }
        
        // If not deleted, keep the original line
        modifiedLines.push(line);
        continue;
      }
      
      // Use original UID for tracking which fixtures we've processed
      const originalKey = generateOriginalUID(matchingLocation);
      originalFixtures.add(originalKey);
      
      // Check if this fixture has been deleted - skip if so
      // Check both original UID and current UID for deletion since deletion uses current UID
      const currentKey = generateFixtureUID(matchingLocation);
      if (deletedFixtures.has(originalKey) || deletedFixtures.has(currentKey)) {
        continue; // Skip deleted fixtures
      }
      
      // Use the matched location directly (it already contains current values)
      const currentLocationData = matchingLocation;
      
      // Update position and rotation with current values from the matched location
      if (currentLocationData) {
        // Use current position (which includes any moves)
        values[5] = currentLocationData.posX.toFixed(12);  // Pos X (m)
        values[6] = currentLocationData.posY.toFixed(12);  // Pos Y (m)
        values[7] = currentLocationData.posZ.toFixed(1);   // Pos Z (m)
        
        // Use current rotation (which includes any rotations)
        values[10] = currentLocationData.rotationZ.toFixed(1); // Rotation Z at index 10
        
        // Use current brand (which includes any brand changes)
        values[11] = currentLocationData.brand;
        
        // Use current count (which includes any count changes)
        if (values.length > 12) {
          values[12] = currentLocationData.count.toString();
        }
        
        // Use current hierarchy (which includes any hierarchy changes)
        if (values.length > 13) {
          values[13] = currentLocationData.hierarchy.toString();
        }
      }
      
      // Update block name if fixture type was changed (embedded in currentLocationData)
      if (currentLocationData && currentLocationData.wasTypeChanged) {
        values[0] = currentLocationData.blockName; // Use current block name (includes type changes)
        // Note: Fixture Type column doesn't exist in this CSV structure
      }
      
      
      modifiedLines.push(values.join(','));
    }
    
    // Add any duplicated fixtures that weren't in the original CSV
    locationData.forEach(location => {
      const originalLocationKey = generateOriginalUID(location);
      
      // If this fixture wasn't in the original CSV (by original UID), it's a duplicate
      if (!originalFixtures.has(originalLocationKey)) {
        // Create CSV line for duplicated fixture using correct 14-column structure
        const csvLine = [
          location.blockName,             // 0: Block Name
          location.floorIndex.toString(), // 1: Floor Index
          '0',                           // 2: Origin X (m) - default to 0
          '0',                           // 3: Origin Y (m) - default to 0
          '0',                           // 4: Origin Z (m) - default to 0
          location.posX.toFixed(12),     // 5: Pos X (m)
          location.posY.toFixed(12),     // 6: Pos Y (m)
          location.posZ.toFixed(1),      // 7: Pos Z (m)
          location.rotationX.toFixed(1), // 8: Rotation X (deg)
          location.rotationY.toFixed(1), // 9: Rotation Y (deg)
          location.rotationZ.toFixed(1), // 10: Rotation Z (deg)
          location.brand,                // 11: Brand
          location.count.toString(),     // 12: Count
          location.hierarchy.toString()  // 13: Hierarchy
        ].join(',');
        
        modifiedLines.push(csvLine);
      }
    });
    
    // Add modified CSV to zip - preserve original file structure
    const modifiedCSV = modifiedLines.join('\n');
    zip.file(originalFile.name, modifiedCSV);
  };

  const createModifiedFloorPlatesCSV = async (zip: JSZip) => {
    // Find original floor plates CSV
    const originalFile = extractedFiles.find(file => 
      file.name.toLowerCase().includes('floor-plate-master.csv') ||
      file.name.toLowerCase().includes('floor-plates-all.csv')
    );
    
    if (!originalFile) {
      console.warn('Original floor plates CSV not found');
      return;
    }
    
    // Read original CSV content
    const response = await fetch(originalFile.url);
    const csvText = await response.text();
    const lines = csvText.split('\n');
    
    if (lines.length === 0) return;
    
    // Keep header
    const modifiedLines = [lines[0]];
    
    // Process each data line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Always keep empty lines
      if (!line.trim()) {
        modifiedLines.push(line);
        continue;
      }
      
      const values = line.split(',');
      
      // Always keep the line, even if it doesn't have enough columns
      if (values.length < 12) {
        modifiedLines.push(line);
        continue;
      }
      
      // Try to update brand if this floor plate was modified
      try {
        const meshName = values[11]; // meshName is at index 11
        
        // Check if this floor plate has been modified
        const modifiedData = modifiedFloorPlates.get(meshName);
        if (modifiedData && modifiedData.brand !== values[2]) {
          // Update brand (index 2)
          values[2] = modifiedData.brand;
        }
      } catch (error) {
        // If parsing fails, keep the original line
        modifiedLines.push(line);
        continue;
      }
      
      modifiedLines.push(values.join(','));
    }
    
    // Add modified CSV to zip
    const modifiedCSV = modifiedLines.join('\n');
    zip.file(originalFile.name, modifiedCSV);
  };

  // Log summary of failed GLBs once
  useEffect(() => {
    if (failedGLBs.size > 0) {
      console.warn(`Failed to load ${failedGLBs.size} GLB fixture(s):`, Array.from(failedGLBs));
    }
  }, [failedGLBs]);

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Please upload a ZIP file');
      return;
    }

    setExtracting(true);
    setError(null);

    try {
      const files = await extractZipFiles(file);
      setExtractedFiles(files);

      // Filter GLB files - include both original floor files and shattered floor plates for switching
      const glbFiles = files.filter(file => 
        file.name.toLowerCase().endsWith('.glb') &&
        (file.name.includes('dg2n-3d-floor-') || 
         file.name.includes('dg2n-shattered-floor-plates-') ||
         !file.name.includes('floor'))
      );
      setGlbFiles(glbFiles);
      
      // Select first original floor GLB file by default (not shattered)
      const originalFloorFiles = glbFiles.filter(file => !file.name.includes('dg2n-shattered-floor-plates-'));
      if (originalFloorFiles.length > 0) {
        setSelectedFile(originalFloorFiles[0]);
        setSelectedFloorFile(originalFloorFiles[0]); // Initialize dropdown state
      }
    } catch (err) {
      console.error('Failed to extract zip file:', err);
      setError('Failed to extract ZIP file');
    } finally {
      setExtracting(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchAndExtractFiles = async () => {
      if (!jobId) {
        setLoading(false);
        return;
      }

      try {
        // First verify job exists and is completed
        const jobData = await apiService.getJobStatus(jobId);
        if (jobData.status !== 'completed') {
          setError(`Job is not completed yet. Status: ${jobData.status}`);
          setLoading(false);
          return;
        }
        setJob(jobData);

        // Fetch and extract ZIP file using job ID
        setExtracting(true);
        const zipBlob = await apiService.fetchJobFilesAsZip(jobData.job_id);
        const extracted = await extractZipFiles(zipBlob);
        
        setExtractedFiles(extracted);
        
        // Filter GLB files - include both original floor files and shattered floor plates for switching
        const glbFiles = extracted.filter(file => 
          file.type === '3d-model' && 
          (file.name.includes('dg2n-3d-floor-') || 
           file.name.includes('dg2n-shattered-floor-plates-') ||
           !file.name.includes('floor'))
        );
        setGlbFiles(glbFiles);
        
        // Select first original floor GLB file by default (not shattered)
        const originalFloorFiles = glbFiles.filter(file => !file.name.includes('dg2n-shattered-floor-plates-'));
        if (originalFloorFiles.length > 0) {
          setSelectedFile(originalFloorFiles[0]);
          setSelectedFloorFile(originalFloorFiles[0]); // Initialize dropdown state
        }
        
      } catch (err) {
        console.error('Failed to load job:', err);
        if (err instanceof Error) {
          if (err.message.includes('404') || err.message.includes('Not Found')) {
            setError(`Job '${jobId}' not found. It may have expired or been deleted.`);
          } else if (err.message.includes('Failed to get job status')) {
            setError(`Unable to access job '${jobId}'. Please check if the job exists and try again.`);
          } else {
            setError(`Failed to load job files: ${err.message}`);
          }
        } else {
          setError('Failed to load job files. Please try again.');
        }
      } finally {
        setLoading(false);
        setExtracting(false);
      }
    };

    fetchAndExtractFiles();
    
    // Cleanup on unmount
    return () => {
      cleanupExtractedFiles(extractedFiles);
      // Note: No need to cleanup fixture cache URLs since they're direct URLs from API, not blob URLs
    };
  }, [jobId]);

  // Fetch brand categories from API
  useEffect(() => {
    const fetchBrandCategories = async () => {
      try {
        const categories = await apiService.getBrandCategories();
        setBrandCategories(categories);
      } catch (error) {
        console.warn('Failed to fetch brand categories:', error);
        // Fall back to legacy behavior if API fails
      }
    };

    fetchBrandCategories();
  }, []);

  // Extract fixture types from API response data
  useEffect(() => {
    // Extract unique fixture types from the fixture data we got from API
    if (fixtureTypeMap.size > 0) {
      const types = new Set(fixtureTypeMap.values());
      setFixtureTypes(Array.from(types));
    }
  }, [fixtureTypeMap]);


  // Load and parse CSV data from extracted files
  useEffect(() => {
    const loadLocationData = async () => {
      if (extractedFiles.length === 0) return;
      
      try {
        // Find the location-master.csv file in extracted files
        const csvFile = extractedFiles.find(file => 
          file.name.toLowerCase().includes('location-master.csv') ||
          file.name.toLowerCase().includes('location_master.csv')
        );
        
        if (!csvFile) {
          console.warn('location-master.csv not found in extracted files');
          console.log('Available files:', extractedFiles.map(f => f.name));
          return;
        }
        
        // Verify the CSV file URL is valid
        if (!csvFile.url || csvFile.url === '') {
          console.warn('Invalid CSV file URL');
          return;
        }
        
        const response = await fetch(csvFile.url);
        if (!response.ok) {
          console.warn(`Failed to fetch CSV file: ${response.status} ${response.statusText}`);
          return;
        }
        const csvText = await response.text();
        const lines = csvText.split('\n').filter(line => line.trim());
        
        const data: LocationData[] = [];
        const ingestionTimestamp = Date.now();
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          
          if (values.length >= 14) {
            const blockName = values[0].trim();
            const posX = parseFloat(values[5]) || 0;
            const posY = parseFloat(values[6]) || 0;
            const posZ = parseFloat(values[7]) || 0;
            const rotationX = parseFloat(values[8]) || 0;
            const rotationY = parseFloat(values[9]) || 0;
            const rotationZ = parseFloat(values[10]) || 0;
            const brand = values[11]?.trim() || 'unknown';
            const count = parseInt(values[12]) || 1;
            const hierarchy = parseInt(values[13]) || 0;
            
            const locationItem = {
              // Current state
              blockName,
              floorIndex: parseInt(values[1]) || 0,
              posX,
              posY,
              posZ,
              rotationX,
              rotationY,
              rotationZ,
              brand,
              count,
              hierarchy,
              glbUrl: undefined, // Will be loaded via API
              
              // Original state (for reset and export logic)
              originalBlockName: blockName,
              originalPosX: posX,
              originalPosY: posY,
              originalPosZ: posZ,
              originalRotationX: rotationX,
              originalRotationY: rotationY,
              originalRotationZ: rotationZ,
              originalBrand: brand,
              originalCount: count,
              originalHierarchy: hierarchy,
              originalGlbUrl: undefined,
              
              // No modifications on initial load
              wasMoved: false,
              wasRotated: false,
              wasTypeChanged: false,
              wasBrandChanged: false,
              wasCountChanged: false,
              wasHierarchyChanged: false,
              wasDuplicated: false,
              
              _ingestionTimestamp: ingestionTimestamp + i // Add unique timestamp per row
            };
            data.push(locationItem);
          }
        }
        
        // Load GLB URLs for fixtures that have block names (batch API call)
        const blockNames = data
          .filter(location => location.blockName && location.blockName.trim() !== '')
          .map(location => location.blockName);
        
        let glbUrlMap = new Map<string, string>();
        if (blockNames.length > 0) {
          glbUrlMap = await loadFixtureGLBs(blockNames);
        }
        
        // Apply GLB URLs to location data
        const dataWithGLBs = data.map(location => {
          if (location.blockName && glbUrlMap.has(location.blockName)) {
            return { ...location, glbUrl: glbUrlMap.get(location.blockName) };
          }
          return location;
        });
        
        // Preserve any modified fixtures when setting new location data
        setLocationData(prev => {
          const newData = [...dataWithGLBs];
          
          // Create a map of existing fixtures by their UID for fast lookup
          const existingUIDs = new Set(newData.map(loc => generateFixtureUID(loc)));
          
          // Add back any modified fixtures (those with _updateTimestamp) that aren't in the CSV
          prev.forEach(prevLocation => {
            if (prevLocation._updateTimestamp) {
              const prevUID = generateFixtureUID(prevLocation);
              // Only add if this UID doesn't exist in the new data (i.e., it's a duplicate or modified fixture)
              if (!existingUIDs.has(prevUID)) {
                newData.push(prevLocation);
              }
            }
          });
          
          return newData;
        });
        
      } catch (err) {
        console.error('Failed to load location data:', err);
        // Set empty location data so the component continues to work
        setLocationData([]);
      }
    };

    const loadFloorPlatesData = async () => {
      if (extractedFiles.length === 0) return;
      
      try {
        // Find the floor plates CSV file in extracted files
        const csvFile = extractedFiles.find(file => 
          file.name.toLowerCase().includes('floor-plate-master.csv') ||
          file.name.toLowerCase().includes('floor-plates-all.csv')
        );
        
        if (!csvFile) {
          console.warn('floor plates CSV file not found in extracted files');
          console.log('Available files:', extractedFiles.map(f => f.name));
          return;
        }
        
        // Verify the CSV file URL is valid
        if (!csvFile.url || csvFile.url === '') {
          console.warn('Invalid floor plates CSV file URL');
          return;
        }
        
        const response = await fetch(csvFile.url);
        if (!response.ok) {
          console.warn(`Failed to fetch floor plates CSV file: ${response.status} ${response.statusText}`);
          return;
        }
        const csvText = await response.text();
        const lines = csvText.split('\n').slice(1).filter(line => line.trim()); // Skip header
        
        const floorData: Record<string, Record<string, any[]>> = {};
        
        lines.forEach((line) => {
          const [floorIndex, surfaceId, brand, area, centX, centY, centZ,
                 minX, minY, maxX, maxY, meshName, layerSource] = line.split(',');
          
          if (!floorData[floorIndex]) floorData[floorIndex] = {};
          if (!floorData[floorIndex][brand]) floorData[floorIndex][brand] = [];
          
          floorData[floorIndex][brand].push({
            surfaceId,
            area: parseFloat(area),
            centroid: [parseFloat(centX), parseFloat(centY), parseFloat(centZ)],
            bbox: {
              min: [parseFloat(minX), parseFloat(minY)],
              max: [parseFloat(maxX), parseFloat(maxY)]
            },
            meshName,
            layerSource
          });
        });
        
        setFloorPlatesData(floorData);
        
      } catch (err) {
        console.error('Failed to load floor plates data:', err);
        // Set empty floor plates data so the component continues to work
        setFloorPlatesData({});
      }
    };

    loadLocationData();
    loadFloorPlatesData();
  }, [extractedFiles, loadFixtureGLBs]);

  if (loading || extracting) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">
            {extracting ? 'Extracting files from ZIP...' : 'Loading 3D models...'}
          </p>
        </div>
      </div>
    );
  }

  if (!jobId && extractedFiles.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="p-6 border border-muted rounded-lg text-center max-w-md">
          <h2 className="text-lg font-semibold mb-4">Upload ZIP File</h2>
          <p className="text-muted-foreground mb-6">Upload a processed ZIP file to view 3D models</p>
          
          <div className="border-2 border-dashed border-muted rounded-lg p-8 mb-4 hover:border-primary/50 transition-colors cursor-pointer">
            <input
              type="file"
              accept=".zip"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="hidden"
              id="zip-upload"
            />
            <label htmlFor="zip-upload" className="cursor-pointer flex flex-col items-center space-y-2">
              <div className="text-4xl text-muted-foreground">📁</div>
              <div className="text-sm font-medium">Click to upload ZIP file</div>
              <div className="text-xs text-muted-foreground">Or drag and drop</div>
            </label>
          </div>
          
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="p-6 border border-destructive/20 bg-destructive/5 rounded-lg max-w-md text-center">
          <h2 className="text-lg font-semibold mb-2 text-destructive">Error Loading Job</h2>
          <p className="text-destructive mb-4">{error}</p>
          {jobId && (
            <p className="text-sm text-muted-foreground mb-4">Job ID: {jobId}</p>
          )}
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (glbFiles.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="p-6 border border-muted rounded-lg text-center">
          <p className="text-muted-foreground mb-4">No 3D models found in the job results</p>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* 3D Canvas */}
      <div className="flex-1 relative">
        <LeftControlPanel
          glbFiles={glbFiles}
          selectedFile={selectedFile}
          selectedFloorFile={selectedFloorFile}
          extractedFiles={extractedFiles}
          showSpheres={showSpheres}
          showWireframe={showWireframe}
          editMode={editMode}
          editFloorplatesMode={editFloorplatesMode}
          transformSpace={transformSpace}
          fixtureTypes={fixtureTypes}
          selectedFixtureType={selectedFixtureType}
          floorPlatesData={floorPlatesData}
          modifiedFloorPlates={modifiedFloorPlates}
          getBrandCategory={getBrandCategory}
          isExporting={isExporting}
          isExportingZip={isExportingZip}
          deletedFixtures={deletedFixtures}
          locationData={locationData}
          jobId={jobId}
          onFloorFileChange={handleFloorFileChange}
          onShowSpheresChange={setShowSpheres}
          onFixtureTypeChange={setSelectedFixtureType}
          onShowWireframeChange={setShowWireframe}
          onEditModeChange={handleEditModeChange}
          onTransformSpaceChange={setTransformSpace}
          onDownloadGLB={handleDownloadGLB}
          onDownloadModifiedZip={handleDownloadModifiedZip}
        />
        <Canvas3D 
          cameraPosition={cameraPosition}
          orbitTarget={orbitTarget}
          selectedFile={selectedFile}
          selectedFloorFile={selectedFloorFile}
          locationData={locationData}
          showSpheres={showSpheres}
          editFloorplatesMode={editFloorplatesMode}
          selectedFixtureType={selectedFixtureType}
          fixtureTypeMap={fixtureTypeMap}
          deletedFixtures={deletedFixtures}
          editMode={editMode}
          transformSpace={transformSpace}
          isTransforming={isTransforming}
          floorPlatesData={floorPlatesData}
          modifiedFloorPlates={modifiedFloorPlates}
          showWireframe={showWireframe}
          selectedLocations={selectedLocations}
          onBoundsCalculated={handleBoundsCalculated}
          onGLBError={handleGLBError}
          onFixtureClick={handleFixtureClick}
          isLocationSelected={isLocationSelected}
          onPositionChange={handlePositionChange}
          onFloorPlateClick={(plateData) => setSelectedFloorPlate(plateData)}
          onPointerMissed={() => {
            if (editFloorplatesMode) {
              setSelectedFloorPlate(null);
            } else {
              setSelectedLocations([]);
              setSelectedLocation(null);
            }
          }}
          setIsTransforming={setIsTransforming}
        />
        
        {/* Show MultiRightInfoPanel when multiple fixtures are selected */}
        {selectedLocations.length > 1 && !editFloorplatesMode && (
          <MultiRightInfoPanel
            selectedLocations={selectedLocations}
            editMode={editMode}
            fixtureTypeMap={fixtureTypeMap}
            onClose={clearSelections}
            onOpenBrandModal={() => setBrandModalOpen(true)}
            onRotateFixture={handleMultiRotateFixture}
            onResetLocation={handleResetPosition}
            onDeleteFixtures={handleDeleteFixtures}
            onMergeFixtures={handleMergeFixtures}
            canMergeFixtures={canMergeFixtures}
            onCountChange={handleFixtureCountChangeMulti}
            onHierarchyChange={handleFixtureHierarchyChangeMulti}
          />
        )}
        
        {/* Show RightInfoPanel for single selection or floor plates */}
        {selectedLocations.length <= 1 && (
          <RightInfoPanel
            selectedLocation={selectedLocation}
            selectedFloorPlate={selectedFloorPlate}
            editMode={editMode}
            editFloorplatesMode={editFloorplatesMode}
            modifiedFloorPlates={modifiedFloorPlates}
            fixtureTypeMap={fixtureTypeMap}
            onCloseLocation={() => setSelectedLocation(null)}
            onCloseFloorPlate={() => setSelectedFloorPlate(null)}
            onOpenFixtureTypeModal={() => setFixtureTypeModalOpen(true)}
            onOpenBrandModal={() => setBrandModalOpen(true)}
            onRotateFixture={handleRotateFixture}
            onResetLocation={handleResetPosition}
            onResetFloorPlate={handleResetFloorPlate}
            onDuplicateFixture={handleDuplicateFixture}
            onDeleteFixture={handleDeleteFixture}
            onSplitFixture={handleSplitFixture}
            onCountChange={handleFixtureCountChange}
            onHierarchyChange={handleFixtureHierarchyChange}
            onPositionChange={handlePositionChange}
            onRotationChange={(location, newRotation) => {
              // Update the location's rotation values
              const key = generateFixtureUID(location);
              setLocationData(prev => prev.map(loc => {
                if (generateFixtureUID(loc) === key) {
                  return {
                    ...loc,
                    rotationX: newRotation[0],
                    rotationY: newRotation[1],
                    rotationZ: newRotation[2],
                    wasRotated: true,
                    originalRotationX: loc.originalRotationX ?? loc.rotationX,
                    originalRotationY: loc.originalRotationY ?? loc.rotationY,
                    originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
                  };
                }
                return loc;
              }));
              
              // Update selected location
              setSelectedLocation(prev => {
                if (prev && generateFixtureUID(prev) === key) {
                  return {
                    ...prev,
                    rotationX: newRotation[0],
                    rotationY: newRotation[1],
                    rotationZ: newRotation[2],
                    wasRotated: true,
                    originalRotationX: prev.originalRotationX ?? prev.rotationX,
                    originalRotationY: prev.originalRotationY ?? prev.rotationY,
                    originalRotationZ: prev.originalRotationZ ?? prev.rotationZ,
                  };
                }
                return prev;
              });
            }}
          />
        )}
      </div>

      {/* Brand Selection Modal */}
      <BrandSelectionModal
        open={brandModalOpen}
        onOpenChange={setBrandModalOpen}
        currentBrand={selectedFloorPlate?.brand || (selectedLocations.length > 1 ? (selectedLocations.every(loc => loc.brand === selectedLocations[0].brand) ? selectedLocations[0].brand : 'Multiple Values') : selectedLocation?.brand) || ''}
        onBrandSelect={selectedFloorPlate ? handleBrandChange : handleFixtureBrandChange}
      />
      
      {/* Fixture Type Selection Modal */}
      <FixtureTypeSelectionModal
        open={fixtureTypeModalOpen}
        onOpenChange={setFixtureTypeModalOpen}
        currentType={selectedLocation ? (fixtureTypeMap.get(selectedLocation.blockName) || 'Unknown') : ''}
        availableTypes={fixtureTypes}
        onTypeSelect={handleFixtureTypeChange}
      />
      
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteConfirmationOpen}
        onOpenChange={setDeleteConfirmationOpen}
        fixtureCount={fixturesToDelete.length}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
}