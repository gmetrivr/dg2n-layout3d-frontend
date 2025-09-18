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
import { useFixtureSelection, type LocationData, generateFixtureUID } from '../hooks/useFixtureSelection';
import { useFixtureModifications } from '../hooks/useFixtureModifications';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/shadcn/components/ui/dialog';
import { DEFAULT_BUCKET, useSupabaseService } from '../services/supabaseService';

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
  const zipUrl = searchParams.get('zipUrl');
  const zipPath = searchParams.get('zipPath');
  const bucketParam = searchParams.get('bucket');
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
  const [showFixtureLabels, setShowFixtureLabels] = useState(false);
  const [showWalls, setShowWalls] = useState(true);
  const [transformSpace, setTransformSpace] = useState<'world' | 'local'>('world');
  const [isExporting, setIsExporting] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [fixtureTypeModalOpen, setFixtureTypeModalOpen] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveStoreId, setSaveStoreId] = useState('');
  const [saveStoreName, setSaveStoreName] = useState('');
  const [, setBrandCategories] = useState<BrandCategoriesResponse | null>(null);
  const [fixtureCache, setFixtureCache] = useState<Map<string, string>>(new Map());
  const [fixtureTypes, setFixtureTypes] = useState<string[]>([]);
  const [selectedFixtureType, setSelectedFixtureType] = useState<string>('all');
  const [fixtureTypeMap, setFixtureTypeMap] = useState<Map<string, string>>(new Map());
  const [brands, setBrands] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('all');

  const { uploadStoreZip, insertStoreRecord, downloadZip } = useSupabaseService();

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

  

  // Build a modified ZIP Blob (without downloading)
// Helpers to recognize CSV filenames across underscore/hyphen variants
// Simple scoped logger for ZIP/save flow
const log = (...args: any[]) => {
  // eslint-disable-next-line no-console
  console.debug('[ZIP]', ...args);
};

const isLocationCsv = (name: string) => {
  const n = name.toLowerCase().replace(/_/g, '-');
  return n.endsWith('.csv') && n.includes('location-master');
};
const isFloorPlatesCsv = (name: string) => {
  const n = name.toLowerCase().replace(/_/g, '-');
  return n.endsWith('.csv') && (n.includes('floor-plate-master') || n.includes('floor-plates'));
};

const createModifiedZipBlob = useCallback(async (): Promise<Blob> => {
    const zip = new JSZip();
    log('Building modified ZIP...');
    log('Extracted files:', extractedFiles.map(f => f.name));

    // Add all original files except the CSVs that need to be modified
    for (const file of extractedFiles) {
      if (isLocationCsv(file.name) || isFloorPlatesCsv(file.name)) {
        log('Skipping original CSV in bundle:', file.name);
        continue;
      }
      zip.file(file.name, file.blob);
    }

    // Create modified location-master.csv
    await createModifiedLocationMasterCSV(zip, deletedFixturePositions);

    // Create modified floor plates CSV if there are floor plate changes, otherwise preserve original
    if (modifiedFloorPlates.size > 0) {
      await createModifiedFloorPlatesCSV(zip);
    } else {
      const originalFloorPlatesFile = extractedFiles.find((file) => isFloorPlatesCsv(file.name));
      if (originalFloorPlatesFile) {
        log('No floor plate edits; keeping original:', originalFloorPlatesFile.name);
        zip.file(originalFloorPlatesFile.name, originalFloorPlatesFile.blob);
      }
    }
    log('Modified ZIP built.');
    const blob = await zip.generateAsync({ type: 'blob' });
    return blob;
  }, [extractedFiles, modifiedFloorPlates, deletedFixturePositions, locationData, deletedFixtures]);

  const handleDownloadModifiedZip = useCallback(async () => {
    if (isExportingZip) return;
    setIsExportingZip(true);
    try {
      const blob = await createModifiedZipBlob();
      const url = URL.createObjectURL(blob);
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
  }, [createModifiedZipBlob, isExportingZip, jobId]);


  const handleSaveStore = useCallback(async () => {
    if (!saveStoreId.trim() || !saveStoreName.trim()) {
      alert('Please provide both Store ID and Store Name');
      return;
    }

    try {
      setIsSavingStore(true);
      log('Save Store: building ZIP...');
      const blob = await createModifiedZipBlob();
      const size = blob.size;
      const ts = new Date();
      const dateStr = ts.toISOString().replace(/[:.]/g, '-');
      const jobIdPrefix = jobId ? `${jobId}-` : '';
      const fileName = `${jobIdPrefix}layout-${dateStr}.zip`;
      const path = `${saveStoreId}/${fileName}`;

      // Upload to storage
      await uploadStoreZip(path, blob);
      log('Save Store: uploaded to', path, 'size', size);

      // Insert DB record
      await insertStoreRecord({
        store_id: saveStoreId,
        store_name: saveStoreName,
        zip_path: path,
        zip_size: size,
        job_id: jobId,
      });

      setSaveDialogOpen(false);
      setSaveStoreId('');
      setSaveStoreName('');
      alert('Store saved successfully');
    } catch (e: any) {
      console.error('Failed to save store:', e);
      alert(`Failed to save store: ${e?.message || e}`);
    } finally {
      setIsSavingStore(false);
    }
  }, [createModifiedZipBlob, jobId, saveStoreId, saveStoreName]);

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
    
  // Find original location-master.csv (support hyphen/underscore variants)
    const originalFile = extractedFiles.find(file => isLocationCsv(file.name));
    
    if (!originalFile) {
      console.warn('Original location-master.csv not found. Generating from current state.');
      const generated = generateLocationCSVFromState();
      zip.file('location-master.csv', generated);
      return;
    }
    
    // Read original CSV content directly from blob (avoid URL caching issues)
    const csvText = await originalFile.blob.text();
    const lines = csvText.split('\n');
    if (lines.length === 0) return;
    
    // Keep header
    const modifiedLines = [lines[0]];
    
    // Helper to build a stable key from original CSV coordinates
    const buildOriginalCsvKey = (block: string, x: number, y: number, z: number) =>
      `${block}-${x.toFixed(12)}-${y.toFixed(12)}-${z.toFixed(1)}`;

    const getLocationOriginalKey = (loc: LocationData) =>
      buildOriginalCsvKey(
        loc.originalBlockName ?? loc.blockName,
        loc.originalPosX ?? loc.posX,
        loc.originalPosY ?? loc.posY,
        loc.originalPosZ ?? loc.posZ,
      );

    // Build fast lookup: current locations by their original CSV key (without timestamp)
    const currentByOriginalKey = new Map<string, LocationData>();
    for (const loc of locationData) {
      const key = getLocationOriginalKey(loc);
      currentByOriginalKey.set(key, loc);
    }
    // Track processed fixtures to identify duplicates
    const originalFixtures = new Set<string>();
    let updated = 0; let notFoundKept = 0; let deletedCount = 0; let duplicatesAdded = 0;
    const unmatchedSamples: string[] = [];
    
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
      
      // Try to parse the position data (using current CSV format indices)
      let blockName, posX, posY, posZ;
      try {
        const clean = (val: string) => val.replace(/"/g, '').trim();
        blockName = clean(values[0]);
        values[0] = blockName;
        posX = Number.parseFloat(clean(values[5] || ''));
        posY = Number.parseFloat(clean(values[6] || ''));
        posZ = Number.parseFloat(clean(values[7] || ''));
        if (!Number.isFinite(posX)) posX = 0;
        if (!Number.isFinite(posY)) posY = 0;
        if (!Number.isFinite(posZ)) posZ = 0;
      } catch (error) {
        // If parsing fails, keep the original line
        modifiedLines.push(line);
        continue;
      }
      
      // Find matching location by original CSV key (deterministic)
      const originalKey = buildOriginalCsvKey(blockName, posX, posY, posZ);
      let matchingLocation = currentByOriginalKey.get(originalKey);
      
      if (!matchingLocation) {
        // If no matching location found, check if this CSV row represents a deleted fixture
        const csvPositionKey = `${blockName}-${posX.toFixed(3)}-${posY.toFixed(3)}-${posZ.toFixed(3)}`;
        
        if (deletedPositions.has(csvPositionKey)) {
          deletedCount++;
          continue; // Skip this CSV row as it represents a deleted fixture
        }
        
        // If not deleted, keep the original line
        modifiedLines.push(line);
        notFoundKept++;
        if (unmatchedSamples.length < 5) {
          unmatchedSamples.push(`${originalKey} => ${values.slice(0, 14).join(',')}`);
        }
        continue;
      }
      
      // Use original UID for tracking which fixtures we've processed
      const trackedOriginalKey = originalKey;
      originalFixtures.add(trackedOriginalKey);
      
      // Check if this fixture has been deleted - skip if so
      // Check both original UID and current UID for deletion since deletion uses current UID
      const currentKey = generateFixtureUID(matchingLocation);
      if (deletedFixtures.has(trackedOriginalKey) || deletedFixtures.has(currentKey)) {
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
        values[8] = currentLocationData.rotationX.toFixed(1);  // Rotation X (deg)
        values[9] = currentLocationData.rotationY.toFixed(1);  // Rotation Y (deg)
        values[10] = currentLocationData.rotationZ.toFixed(1); // Rotation Z (deg)
        
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
      updated++;
    }
    
    // Add any duplicated fixtures that weren't in the original CSV
    locationData.forEach(location => {
      const originalLocationKey = getLocationOriginalKey(location);
      
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
        duplicatesAdded++;
      }
    });
    
    // Add modified CSV to zip - preserve original file structure
    const modifiedCSV = modifiedLines.join('\n');
    zip.file(originalFile.name, modifiedCSV);
    if (unmatchedSamples.length > 0) {
      log('Unmatched CSV rows (sample):', unmatchedSamples);
    }
    log('Location CSV summary:', { updated, notFoundKept, deleted: deletedCount, duplicatesAdded, outLines: modifiedLines.length });
  };

  const generateLocationCSVFromState = () => {
    const header = 'Block Name,Floor Index,Origin X (m),Origin Y (m),Origin Z (m),Pos X (m),Pos Y (m),Pos Z (m),Rotation X (deg),Rotation Y (deg),Rotation Z (deg),Brand,Count,Hierarchy';
    const rows = locationData.map(loc => [
      loc.blockName,
      loc.floorIndex,
      0, 0, 0,
      Number(loc.posX.toFixed(12)),
      Number(loc.posY.toFixed(12)),
      Number(loc.posZ.toFixed(1)),
      Number(loc.rotationX.toFixed(1)),
      Number(loc.rotationY.toFixed(1)),
      Number(loc.rotationZ.toFixed(1)),
      loc.brand,
      loc.count,
      loc.hierarchy
    ].join(','));
    const csv = [header, ...rows].join('\n');
    log('Generated CSV from state. Rows:', rows.length);
    return csv;
  };

  const createModifiedFloorPlatesCSV = async (zip: JSZip) => {
    // Find original floor plates CSV
    const originalFile = extractedFiles.find(file => isFloorPlatesCsv(file.name));
    
    if (!originalFile) {
      console.warn('Original floor plates CSV not found');
      return;
    }
    
    // Read original CSV content directly from blob (avoid URL caching issues)
    const csvText = await originalFile.blob.text();
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
    const fetchJobZip = async () => {
      if (!jobId) return;

      try {
        const jobData = await apiService.getJobStatus(jobId);
        if (jobData.status !== 'completed') {
          setError(`Job is not completed yet. Status: ${jobData.status}`);
          setLoading(false);
          return;
        }
        setJob(jobData);

        setExtracting(true);
        const zipBlob = await apiService.fetchJobFilesAsZip(jobData.job_id);
        const extracted = await extractZipFiles(zipBlob);

        setExtractedFiles(extracted);

        const glbFiles = extracted.filter(file =>
          file.type === '3d-model' &&
          (file.name.includes('dg2n-3d-floor-') ||
           file.name.includes('dg2n-shattered-floor-plates-') ||
           !file.name.includes('floor'))
        );
        setGlbFiles(glbFiles);

        const originalFloorFiles = glbFiles.filter(file => !file.name.includes('dg2n-shattered-floor-plates-'));
        if (originalFloorFiles.length > 0) {
          setSelectedFile(originalFloorFiles[0]);
          setSelectedFloorFile(originalFloorFiles[0]);
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

    const fetchZipFromUrl = async () => {
      if (!zipUrl) return;
      try {
        setLoading(true);
        setExtracting(true);
        const resp = await fetch(zipUrl);
        if (!resp.ok) throw new Error(`Failed to fetch ZIP (${resp.status})`);
        const zipBlob = await resp.blob();
        const extracted = await extractZipFiles(zipBlob);
        setExtractedFiles(extracted);

        const glbFiles = extracted.filter(file =>
          file.type === '3d-model' &&
          (file.name.includes('dg2n-3d-floor-') ||
           file.name.includes('dg2n-shattered-floor-plates-') ||
           !file.name.includes('floor'))
        );
        setGlbFiles(glbFiles);

        const originalFloorFiles = glbFiles.filter(file => !file.name.includes('dg2n-shattered-floor-plates-'));
        if (originalFloorFiles.length > 0) {
          setSelectedFile(originalFloorFiles[0]);
          setSelectedFloorFile(originalFloorFiles[0]);
        }
      } catch (err) {
        console.error('Failed to load zip from URL:', err);
        setError('Failed to load ZIP from URL.');
      } finally {
        setLoading(false);
        setExtracting(false);
      }
    };
    const fetchZipFromSupabase = async () => {
      if (!zipPath) return;
      try {
        setLoading(true);
        setExtracting(true);
        const bucket = bucketParam || DEFAULT_BUCKET;
        const blob = await downloadZip(zipPath, bucket);
        const extracted = await extractZipFiles(blob);
        setExtractedFiles(extracted);

        const glbFiles = extracted.filter(file =>
          file.type === '3d-model' &&
          (file.name.includes('dg2n-3d-floor-') ||
           file.name.includes('dg2n-shattered-floor-plates-') ||
           !file.name.includes('floor'))
        );
        setGlbFiles(glbFiles);

        const originalFloorFiles = glbFiles.filter(file => !file.name.includes('dg2n-shattered-floor-plates-'));
        if (originalFloorFiles.length > 0) {
          setSelectedFile(originalFloorFiles[0]);
          setSelectedFloorFile(originalFloorFiles[0]);
        }
      } catch (err) {
        console.error('Failed to load zip from Supabase:', err);
        setError('Failed to load ZIP from saved store.');
      } finally {
        setLoading(false);
        setExtracting(false);
      }
    };

    if (jobId) {
      fetchJobZip();
    } else if (zipPath) {
      fetchZipFromSupabase();
    } else if (zipUrl) {
      fetchZipFromUrl();
    } else {
      setLoading(false);
    }

    return () => {
      cleanupExtractedFiles(extractedFiles);
    };
  }, [jobId, zipUrl]);

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

  // Load all available fixture types from API
  useEffect(() => {
    const loadAllFixtureTypes = async () => {
      try {
        const allTypes = await apiService.getAllFixtureTypes();
        setFixtureTypes(allTypes);
      } catch (error) {
        console.warn('Failed to load fixture types from API:', error);
        // Fallback to hardcoded types from mapping
        setFixtureTypes(Object.values(FIXTURE_TYPE_MAPPING));
      }
    };

    loadAllFixtureTypes();
  }, []); // Only run once on component mount

  // Extract unique brands from location data for current floor
  useEffect(() => {
    if (locationData.length > 0 && (selectedFloorFile || selectedFile)) {
      // Extract floor index from the selected floor file
      const fileForFloorExtraction = selectedFloorFile || selectedFile;
      const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
      const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;
      
      // Get unique brands for the current floor, excluding deleted fixtures
      const floorBrands = new Set<string>();
      locationData
        .filter(location => location.floorIndex === currentFloor)
        .filter(location => {
          const key = generateFixtureUID(location);
          return !deletedFixtures.has(key);
        })
        .forEach(location => {
          if (location.brand && location.brand.trim() !== '') {
            floorBrands.add(location.brand);
          }
        });
      
      setBrands(Array.from(floorBrands).sort());
    } else {
      setBrands([]);
    }
  }, [locationData, selectedFloorFile, selectedFile, deletedFixtures]);


  // Load and parse CSV data from extracted files
  useEffect(() => {
    const loadLocationData = async () => {
      if (extractedFiles.length === 0) return;
      
      try {
        // Find the location-master.csv file in extracted files
        const csvFile = extractedFiles.find(file => isLocationCsv(file.name));
        
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

  if (!jobId && !zipUrl && !zipPath && extractedFiles.length === 0) {
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
          showFixtureLabels={showFixtureLabels}
          showWalls={showWalls}
          editMode={editMode}
          editFloorplatesMode={editFloorplatesMode}
          transformSpace={transformSpace}
          fixtureTypes={fixtureTypes}
          selectedFixtureType={selectedFixtureType}
          brands={brands}
          selectedBrand={selectedBrand}
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
          onBrandChange={setSelectedBrand}
          onShowWireframeChange={setShowWireframe}
          onShowFixtureLabelsChange={setShowFixtureLabels}
          onShowWallsChange={setShowWalls}
          onEditModeChange={handleEditModeChange}
          onTransformSpaceChange={setTransformSpace}
          onDownloadGLB={handleDownloadGLB}
          onDownloadModifiedZip={handleDownloadModifiedZip}
          onSaveStoreClick={() => setSaveDialogOpen(true)}
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
          selectedBrand={selectedBrand}
          fixtureTypeMap={fixtureTypeMap}
          deletedFixtures={deletedFixtures}
          editMode={editMode}
          transformSpace={transformSpace}
          isTransforming={isTransforming}
          floorPlatesData={floorPlatesData}
          modifiedFloorPlates={modifiedFloorPlates}
          showWireframe={showWireframe}
          showFixtureLabels={showFixtureLabels}
          showWalls={showWalls}
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

      {/* Save Store Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="w-[520px]">
          <DialogHeader>
            <DialogTitle>Save Store</DialogTitle>
            <DialogClose onClick={() => setSaveDialogOpen(false)} />
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            <DialogDescription>
              Enter store details. A ZIP of the current dataset will be saved with a timestamp.
            </DialogDescription>
            <div className="space-y-2">
              <label className="text-sm font-medium">Store ID</label>
              <input
                type="text"
                value={saveStoreId}
                onChange={(e) => setSaveStoreId(e.target.value)}
                placeholder="e.g. 12345"
                className="w-full px-3 py-2 rounded border border-border bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Store Name</label>
              <input
                type="text"
                value={saveStoreName}
                onChange={(e) => setSaveStoreName(e.target.value)}
                placeholder="e.g. Downtown Flagship"
                className="w-full px-3 py-2 rounded border border-border bg-background"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSaveDialogOpen(false)}
                className="text-sm px-3 py-1.5 rounded border border-border hover:bg-accent"
                disabled={isSavingStore}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStore}
                disabled={isSavingStore || extractedFiles.length === 0}
                className="text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isSavingStore ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


