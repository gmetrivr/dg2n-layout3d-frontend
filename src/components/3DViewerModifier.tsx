import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../contexts/StoreContext';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFExporter, GLTFLoader, DRACOLoader } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';
import { Button } from "@/shadcn/components/ui/button";
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiService, type JobStatus, type BrandCategoriesResponse } from '../services/api';
import { extractZipFiles, isFloorFile, isShatteredFloorPlateFile, type ExtractedFile } from '../utils/zipUtils';
import JSZip from 'jszip';
import { BrandSelectionModal } from './BrandSelectionModal';
import { FixtureTypeSelectionModal } from './FixtureTypeSelectionModal';
import { LeftControlPanel } from './LeftControlPanel';
import { RightInfoPanel } from './RightInfoPanel';
import { MultiRightInfoPanel } from './MultiRightInfoPanel';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { FloorManagementModal } from './FloorManagementModal';
import { Canvas3D } from './Canvas3D';
import { useFixtureSelection, type LocationData, generateFixtureUID } from '../hooks/useFixtureSelection';
import { useFixtureModifications } from '../hooks/useFixtureModifications';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/shadcn/components/ui/dialog';
import { DEFAULT_BUCKET, useSupabaseService } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';
import { loadStoreMasterData, getUniqueStoreCodes, type StoreData } from '../utils/csvUtils';
import { generateSpaceTrackerData, spaceTrackerToCSV, downloadSpaceTrackerCSV } from '../utils/spaceTrackerUtils';
import { AddObjectModal } from './AddObjectModal';
import { ObjectInfoPanel } from './ObjectInfoPanel';

// Fixture type mapping
const FIXTURE_TYPE_MAPPING: Record<string, string> = {
  "RTL-4W": "4-WAY",
  "RTL-SR": "A-RAIL",
  "RTL-HG": "H-GONDOLA",
  "RTL-NT": "NESTED-TABLE",
  "TJR-NT": "GLASS-TABLE",
  "RTL-WPS-M-3Bays": "WALL-BAY"
};

// Helper to migrate brand names in location-master.csv within a ZIP
async function migrateBrandsInZip(zipBlob: Blob, pipelineVersion: string = '02'): Promise<{ zipBlob: Blob; migratedCount: number }> {
  const zip = await JSZip.loadAsync(zipBlob);

  // Find location-master.csv
  const locationCsvFile = zip.file(/location[-_]master\.csv/i)[0];
  if (!locationCsvFile) {
    console.log('[3DViewerModifier] No location-master.csv found, skipping brand migration');
    return { zipBlob, migratedCount: 0 };
  }

  console.log('[3DViewerModifier] Found location-master.csv, extracting brand names...');
  const locationCsvText = await locationCsvFile.async('text');
  const locationLines = locationCsvText.split(/\r?\n/); // Split by both CRLF and LF

  // Parse CSV header to find Brand column index
  const headerLine = locationLines[0];
  const headers = headerLine.split(',').map(h => h.trim());
  const brandColumnIndex = headers.findIndex(h => h.toLowerCase() === 'brand');

  if (brandColumnIndex === -1) {
    console.warn('[3DViewerModifier] Brand column not found in CSV, skipping migration');
    return { zipBlob, migratedCount: 0 };
  }

  // Extract unique brand names from CSV (skip header)
  const uniqueBrands = new Set<string>();
  for (let i = 1; i < locationLines.length; i++) {
    const line = locationLines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    if (values.length > brandColumnIndex) {
      const brand = values[brandColumnIndex].trim();
      if (brand) {
        uniqueBrands.add(brand);
      }
    }
  }

  if (uniqueBrands.size === 0) {
    console.log('[3DViewerModifier] No brands found in CSV, skipping migration');
    return { zipBlob, migratedCount: 0 };
  }

  console.log(`[3DViewerModifier] Found ${uniqueBrands.size} unique brands, calling migration API...`);

  // Call migration API
  let migrationResults;
  try {
    const migrationResponse = await apiService.migrateBrandNames(Array.from(uniqueBrands), pipelineVersion);
    migrationResults = migrationResponse.migrations;
    console.log(`[3DViewerModifier] Migration API returned ${migrationResponse.total_changed} changes`);
  } catch (error) {
    console.error('[3DViewerModifier] Failed to call migration API:', error);
    return { zipBlob, migratedCount: 0 };
  }

  // Build brand mapping
  const brandMap = new Map<string, string>();
  let changedCount = 0;
  for (const result of migrationResults) {
    brandMap.set(result.old_name.toLowerCase(), result.new_name);
    if (result.changed) {
      changedCount++;
      console.log(`[3DViewerModifier] Brand migration: "${result.old_name}" -> "${result.new_name}"`);
    }
  }

  if (changedCount === 0) {
    console.log('[3DViewerModifier] No brand names needed migration');
    return { zipBlob, migratedCount: 0 };
  }

  // Apply migrations to CSV
  // Ensure header has "Fixture ID" column (15th column)
  let updatedHeaderLine = locationLines[0].trim(); // Trim to remove any trailing newlines
  const updatedHeaderColumns = updatedHeaderLine.split(',').map(col => col.trim()); // Trim each column
  console.log(`[migrateBrandsInZip] Original header columns: ${updatedHeaderColumns.length}`, updatedHeaderColumns);
  if (updatedHeaderColumns.length < 15 || !updatedHeaderColumns[14]) {
    // Add or replace the 15th column header with "Fixture ID"
    console.log(`[migrateBrandsInZip] Adding Fixture ID header (was ${updatedHeaderColumns.length} columns)`);
    while (updatedHeaderColumns.length < 14) {
      updatedHeaderColumns.push('');
    }
    updatedHeaderColumns[14] = 'Fixture ID';
    console.log('[migrateBrandsInZip] New header columns:', updatedHeaderColumns);
  } else {
    console.log('[migrateBrandsInZip] Header already has Fixture ID:', updatedHeaderColumns[14]);
  }
  updatedHeaderLine = updatedHeaderColumns.join(',');
  const updatedLines = [updatedHeaderLine]; // Keep header with Fixture ID
  for (let i = 1; i < locationLines.length; i++) {
    const line = locationLines[i].trim();
    if (!line) {
      updatedLines.push(line);
      continue;
    }

    const values = line.split(',');
    if (values.length > brandColumnIndex) {
      const oldBrand = values[brandColumnIndex].trim();
      const newBrand = brandMap.get(oldBrand.toLowerCase());
      if (newBrand && newBrand !== oldBrand) {
        values[brandColumnIndex] = newBrand;
      }
    }

    updatedLines.push(values.join(','));
  }

  // Update CSV in ZIP
  const updatedCsvText = updatedLines.join('\n');
  zip.file(locationCsvFile.name, updatedCsvText);
  console.log(`[3DViewerModifier] Updated location-master.csv with ${changedCount} brand migrations`);

  // Generate updated ZIP blob
  const updatedZipBlob = await zip.generateAsync({ type: 'blob' });
  return { zipBlob: updatedZipBlob, migratedCount: changedCount };
}

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

// Door identification configuration
const DOOR_BLOCK_NAMES = {
  entrance: ['1500 DOUBLE GLAZING 2', '1500 DOUBLE GLAZING2'],
  exit: ['FIRE EXIT']
};

// Helper to identify if a block name represents a door
function isDoorBlockName(blockName: string): { isDoor: boolean; type: 'entrance_door' | 'exit_door' | null } {
  const normalized = blockName.trim().toUpperCase();

  // Check entrance doors
  if (DOOR_BLOCK_NAMES.entrance.some(name => name.toUpperCase() === normalized)) {
    return { isDoor: true, type: 'entrance_door' };
  }

  // Check exit doors
  if (DOOR_BLOCK_NAMES.exit.some(name => name.toUpperCase() === normalized)) {
    return { isDoor: true, type: 'exit_door' };
  }

  return { isDoor: false, type: null };
}

// Convert fixture (LocationData) to architectural door element
function convertFixtureToDoor(location: any, doorType: 'entrance_door' | 'exit_door'): ArchitecturalObject {
  // Generate unique ID
  const id = `${doorType}_${location.floorIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Default door dimensions based on type
  const defaultDimensions = doorType === 'entrance_door'
    ? { width: 1.5, height: 3.0, depth: 0.1 } // 1500mm wide entrance
    : { width: 1.0, height: 2.5, depth: 0.1 }; // 1000mm wide exit

  return {
    id,
    type: doorType,
    variant: location.blockName, // Keep original block name as variant
    floorIndex: location.floorIndex,
    posX: location.posX,
    posY: location.posY,
    posZ: location.posZ,
    rotationX: location.rotationX || 0,
    rotationY: location.rotationY || 0,
    rotationZ: location.rotationZ || 0,
    width: defaultDimensions.width,
    height: defaultDimensions.height,
    depth: defaultDimensions.depth,
    originalPosX: location.posX,
    originalPosY: location.posY,
    originalPosZ: location.posZ,
    originalRotationX: location.rotationX || 0,
    originalRotationY: location.rotationY || 0,
    originalRotationZ: location.rotationZ || 0,
    originalWidth: defaultDimensions.width,
    originalHeight: defaultDimensions.height,
    originalDepth: defaultDimensions.depth,
    wasMoved: false,
    wasRotated: false,
    wasResized: false,
    customProperties: {
      originalBlockName: location.blockName,
      brand: location.brand,
      migratedFromFixture: true,
      fixtureId: location.fixtureId,
      glbUrl: location.glbUrl // Preserve GLB URL from fixture
    }
  };
}

// Architectural object type definition
export type ArchitecturalObjectType =
  | 'glazing'
  | 'partition'
  | 'entrance_door'
  | 'exit_door'
  | 'window'
  | 'column'
  | 'wall';

export interface ArchitecturalObject {
  id: string;
  type: ArchitecturalObjectType;
  variant?: string; // Variant name (e.g., "Small", "Medium", "Large", "Double Door")
  floorIndex: number;

  // Single-point elements (doors, columns, etc.) - position-based
  posX?: number;
  posY?: number;
  posZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  width?: number;   // For single-point elements
  height?: number;  // Used by both types
  depth?: number;   // For single-point elements

  // Two-point elements (glazing, partitions, walls) - start/end point based
  startPoint?: [number, number, number]; // [x, y, z] in world coordinates
  endPoint?: [number, number, number];   // [x, y, z] in world coordinates
  rotation?: number; // Additional rotation in radians - kept for backward compatibility

  // Original values for single-point elements
  originalPosX?: number;
  originalPosY?: number;
  originalPosZ?: number;
  originalRotationX?: number;
  originalRotationY?: number;
  originalRotationZ?: number;
  originalWidth?: number;
  originalHeight?: number;
  originalDepth?: number;

  // Original values for two-point elements
  originalStartPoint?: [number, number, number];
  originalEndPoint?: [number, number, number];
  originalRotation?: number;

  // Modification tracking
  wasMoved?: boolean;
  wasRotated?: boolean;
  wasHeightChanged?: boolean; // Used for two-point elements
  wasResized?: boolean;       // Used for single-point elements

  // Custom properties (extensible per element type)
  customProperties?: Record<string, any>;
}







export function ThreeDViewerModifier() {
  const { setStoreName } = useStore();
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
  const [fixturesLoaded, setFixturesLoaded] = useState(false);

  const [locationData, setLocationData] = useState<LocationData[]>([]);
  const [showSpheres, setShowSpheres] = useState<boolean>(true);
  //const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([10, 10, 10]);
  const [orbitTarget, setOrbitTarget] = useState<[number, number, number]>([0, 0, 0]);
  const [currentOrbitTarget, setCurrentOrbitTarget] = useState<[number, number, number]>([0, 0, 0]); // Separate state for add fixture position
  const [cameraMode, setCameraMode] = useState<'perspective' | 'orthographic'>('perspective');
  const [orthoZoom] = useState<number>(50); // Orthographic zoom level
  const [failedGLBs, setFailedGLBs] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editFloorplatesMode, setEditFloorplatesMode] = useState(false);
  const [setSpawnPointMode, setSetSpawnPointMode] = useState(false);
  const [spawnPoints, setSpawnPoints] = useState<Map<number, [number, number, number]>>(new Map());
  const [isTransforming, setIsTransforming] = useState(false);
  const [floorPlatesData, setFloorPlatesData] = useState<Record<string, Record<string, any[]>>>({});
  const [selectedFloorFile, setSelectedFloorFile] = useState<ExtractedFile | null>(null); // The floor selected in dropdown
  const [selectedFloorPlate, setSelectedFloorPlate] = useState<any | null>(null); // Selected floor plate data
  const [showWireframe, setShowWireframe] = useState(false);

  const [showFixtureLabels, setShowFixtureLabels] = useState(false);
  const [showWalls, setShowWalls] = useState(true);
  const [transformSpace, setTransformSpace] = useState<'world' | 'local'>('local');
  const [isExporting, setIsExporting] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [fixtureTypeModalOpen, setFixtureTypeModalOpen] = useState(false);
  const [addFixtureModalOpen, setAddFixtureModalOpen] = useState(false);
  const [isAddingFixture, setIsAddingFixture] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveEntity, setSaveEntity] = useState('trends');
  const [saveStoreId, setSaveStoreId] = useState('');
  const [saveStoreName, setSaveStoreName] = useState('');
  const [, setBrandCategories] = useState<BrandCategoriesResponse | null>(null);
  const fixtureCache = useRef<Map<string, string>>(new Map());
  const [fixtureTypes, setFixtureTypes] = useState<string[]>([]);
  const [selectedFixtureType, setSelectedFixtureType] = useState<string>('all');
  const fixtureTypeMap = useRef<Map<string, string>>(new Map());
  const [brands, setBrands] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [storeData, setStoreData] = useState<StoreData[]>([]);
  const [storeCodes, setStoreCodes] = useState<string[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [floorManagementModalOpen, setFloorManagementModalOpen] = useState(false);
  const [floorDisplayOrder, setFloorDisplayOrder] = useState<number[]>([]); // Maps display position to actual floor index
  const [initialFloorCount, setInitialFloorCount] = useState<number>(0); // Track initial floor count
  const [floorNames, setFloorNames] = useState<Map<number, string>>(new Map()); // Maps floor index to floor name

  // Architectural objects state (glazing and partitions)
  const [architecturalObjects, setArchitecturalObjects] = useState<ArchitecturalObject[]>([]);
  const [addObjectModalOpen, setAddObjectModalOpen] = useState(false);
  const [isAddingObject, setIsAddingObject] = useState(false);
  const [currentObjectType, setCurrentObjectType] = useState<ArchitecturalObjectType | null>(null);
  const [objectPlacementPoint, setObjectPlacementPoint] = useState<[number, number, number] | null>(null); // First click point
  const [objectHeight] = useState<number>(4.5); // Default height in meters
  const [selectedObject, setSelectedObject] = useState<ArchitecturalObject | null>(null);

  // Measurement tool state
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurementPoints, setMeasurementPoints] = useState<[number, number, number][]>([]);
  const justCreatedObjectRef = useRef<boolean>(false); // Track if we just created an object
  const justFinishedTransformRef = useRef<boolean>(false); // Track if we just finished transforming
  const isMouseDownOnTransformRef = useRef<boolean>(false); // Track if mouse is down on transform controls
  const [isDragging, setIsDragging] = useState(false); // Track drag state for file upload
  const floorNamesInitializedRef = useRef<boolean>(false); // Track if floor names have been extracted
  const isUnmountingRef = useRef(false); // Track unmounting state to prevent operations during unmount

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
    handleMultiPositionChange,
    handleResetPosition,
    handleResetMultiplePositions,
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
    handleAlignFixtures,
  } = useFixtureModifications(
    selectedLocation,
    selectedLocations,
    selectedFloorPlate,
    setSelectedLocation,
    setSelectedLocations,
    setLocationData,
    setSelectedFloorPlate
  );

  // Wrap handleFixtureClick to clear selected object when a fixture is clicked
  const handleFixtureClickWithObjectClear = useCallback((clickedLocation: LocationData, event?: any) => {
    // Don't process clicks if mouse was down on transform controls
    // This prevents accidental selection when clicking transform controls that overlap other fixtures
    if (isMouseDownOnTransformRef.current) {
      return;
    }

    setSelectedObject(null); // Clear selected architectural object
    handleFixtureClick(clickedLocation, event);
  }, [handleFixtureClick]);

  // Wrap setIsTransforming to track when transforming starts/ends
  const handleSetIsTransforming = useCallback((transforming: boolean) => {
    setIsTransforming(transforming);

    if (transforming) {
      // Mouse is down on transform controls
      isMouseDownOnTransformRef.current = true;
    } else {
      // Transforming ended - set flags to prevent selection clearing
      justFinishedTransformRef.current = true;

      // Clear the mouse down flag immediately
      isMouseDownOnTransformRef.current = false;

      // Clear the finished transform flag after a delay
      setTimeout(() => {
        justFinishedTransformRef.current = false;
      }, 200); // Increased delay to ensure onPointerMissed is fully processed
    }
  }, []);

  // Extract available floor indices from glbFiles
  const availableFloorIndices = useMemo(() => {
    const floorIndices = new Set<number>();
    glbFiles.forEach(file => {
      // Extract floor index from filename
      const floorMatch = file.name.match(/floor[_-]?(\d+)/i) || file.name.match(/(\d+)/i);
      if (floorMatch) {
        floorIndices.add(parseInt(floorMatch[1]));
      }
    });
    return Array.from(floorIndices).sort((a, b) => a - b);
  }, [glbFiles]);

  // Function to load fixture GLBs in batch from API
  const loadFixtureGLBs = useCallback(async (blockNames: string[]): Promise<Map<string, string>> => {
    if (isUnmountingRef.current) return new Map(); // Skip if unmounting
    const urlMap = new Map<string, string>();

    // Filter out already cached blocks
    const uncachedBlocks = blockNames.filter(name => !fixtureCache.current.has(name));

    if (uncachedBlocks.length === 0) {
      // All blocks are cached, return cached URLs
      blockNames.forEach(name => {
        const cachedUrl = fixtureCache.current.get(name);
        if (cachedUrl) {
          urlMap.set(name, cachedUrl);
        }
      });
      return urlMap;
    }

    try {
      const fixtureBlocks = await apiService.getFixtureBlocks(uncachedBlocks);

      // Update cache and build URL map, also store fixture types
      fixtureBlocks.forEach(block => {
        if (block.glb_url) {
          fixtureCache.current.set(block.block_name, block.glb_url);
          urlMap.set(block.block_name, block.glb_url);
          // Store the fixture type for filtering
          if (block.fixture_type) {
            fixtureTypeMap.current.set(block.block_name, block.fixture_type);
          }
        }
      });

      // Add previously cached URLs to the result
      blockNames.forEach(name => {
        if (fixtureCache.current.has(name)) {
          const cachedUrl = fixtureCache.current.get(name)!;
          urlMap.set(name, cachedUrl);
        }
      });

      return urlMap;
    } catch (error) {
      console.warn('Failed to load fixture GLBs:', error);
      return urlMap;
    }
  }, []); // No dependencies needed since refs are stable

  const handleBoundsCalculated = useCallback((center: [number, number, number], size: [number, number, number]) => {
    // Position camera to view the entire model
    const maxDimension = Math.max(...size);
    const distance = maxDimension * 1.5; // Adjust multiplier as needed
    const newCameraPos: [number, number, number] = [center[0] + distance, center[1] + distance, center[2] + distance];

    // Only update if values actually changed (avoid infinite re-renders)
    setCameraPosition(prev => {
      if (prev[0] === newCameraPos[0] && prev[1] === newCameraPos[1] && prev[2] === newCameraPos[2]) {
        return prev;
      }
      return newCameraPos;
    });

    // Only update orbit target if values actually changed
    setOrbitTarget(prev => {
      if (prev[0] === center[0] && prev[1] === center[1] && prev[2] === center[2]) {
        return prev;
      }
      return center;
    });
  }, []);

  // Camera mode and view functions
  const handleCameraModeChange = (mode: 'perspective' | 'orthographic') => {
    setCameraMode(mode);
  };

  const handleSwitchToTopView = () => {
    // Position camera directly above the orbit target
    const targetY = orbitTarget[1];
    const height = 30; // Default height above the target
    const newCameraPos: [number, number, number] = [orbitTarget[0], targetY + height, orbitTarget[2]];
    setCameraPosition(newCameraPos);
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

      // Get the proper block name from the backend API
      let mappedBlockName = await apiService.getBlockNameForFixtureType(newType);

      // If API doesn't return a block name, try reverse lookup in FIXTURE_TYPE_MAPPING
      if (!mappedBlockName) {
        mappedBlockName = Object.keys(FIXTURE_TYPE_MAPPING).find(
          blockName => FIXTURE_TYPE_MAPPING[blockName] === newType
        ) || newType; // fallback to newType if not found in mapping
      }

      // Update the fixture cache with new GLB URL
      fixtureCache.current.set(mappedBlockName, newGlbUrl);

      // Update the fixture type map
      fixtureTypeMap.current.set(mappedBlockName, newType);
      
      // Mark the original fixture for deletion and create a new one with the new type
      const selectedUID = generateFixtureUID(selectedLocation);

      // Create a new fixture with the new type
      const newFixture: LocationData = {
        ...selectedLocation,
        blockName: mappedBlockName,
        glbUrl: newGlbUrl,
        wasTypeChanged: true,
        wasMoved: selectedLocation.wasMoved || false,
        // Preserve original state
        originalBlockName: selectedLocation.originalBlockName || selectedLocation.blockName,
        originalPosX: selectedLocation.originalPosX ?? selectedLocation.posX,
        originalPosY: selectedLocation.originalPosY ?? selectedLocation.posY,
        originalPosZ: selectedLocation.originalPosZ ?? selectedLocation.posZ,
        originalGlbUrl: selectedLocation.originalGlbUrl || selectedLocation.glbUrl,
        // Generate new unique timestamp
        _updateTimestamp: Date.now() + Math.random() * 1000,
        _ingestionTimestamp: Date.now() + Math.random() * 1000
      };

      setLocationData(prev => {
        // Mark the original fixture as forDelete
        const withMarkedOriginal = prev.map(loc => {
          const locUID = generateFixtureUID(loc);
          if (locUID === selectedUID) {
            return { ...loc, forDelete: true };
          }
          return loc;
        });

        // Add the new fixture with changed type
        return [...withMarkedOriginal, newFixture];
      });
      
      // Update selected location to point to the new fixture
      setSelectedLocation(newFixture);
      setSelectedLocations([newFixture]);
      
    } catch (error) {
      console.error('Failed to change fixture type:', error);
      // Could add error toast here
    }
  }, [selectedLocation]);

  const handleAddFixture = useCallback(async (fixtureType: string) => {
    try {
      // Get the current floor index from the selected floor file
      const fileForFloorExtraction = selectedFloorFile || selectedFile;
      const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
      const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

      // Get the GLB URL for the fixture type
      const fixtureTypeInfo = await apiService.getFixtureTypeUrl(fixtureType);
      const glbUrl = fixtureTypeInfo.glb_url;

      // Get the proper block name from the backend API
      let mappedBlockName = await apiService.getBlockNameForFixtureType(fixtureType);

      // If API doesn't return a block name, try reverse lookup in FIXTURE_TYPE_MAPPING
      if (!mappedBlockName) {
        mappedBlockName = Object.keys(FIXTURE_TYPE_MAPPING).find(
          blockName => FIXTURE_TYPE_MAPPING[blockName] === fixtureType
        ) || fixtureType; // fallback to fixtureType if not found in mapping
      }

      // Preload the GLB
      useGLTF.preload(glbUrl);

      // Update the fixture cache with new GLB URL
      fixtureCache.current.set(mappedBlockName, glbUrl);

      // Update the fixture type map
      fixtureTypeMap.current.set(mappedBlockName, fixtureType);

      // Calculate position at screen center (currentOrbitTarget) with y=0
      // Note: currentOrbitTarget is [x, y, z] in world space
      // LocationData uses [posX, posY, posZ] where posY is actually the -Z world axis
      const posX = currentOrbitTarget[0];
      const posY = -currentOrbitTarget[2]; // World Z maps to -posY
      const posZ = 0; // Always 0 (floor level)

      // Calculate hierarchy as max+1 from current floor fixtures
      const currentFloorFixtures = locationData.filter(loc => loc.floorIndex === currentFloor);
      const maxHierarchy = currentFloorFixtures.length > 0
        ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
        : 0;
      const newHierarchy = maxHierarchy + 1;

      // Get origin values from current floor
      const floorOriginFixture = currentFloorFixtures[0];
      const originX = floorOriginFixture?.originX ?? 0;
      const originY = floorOriginFixture?.originY ?? 0;

      // Default brand is "unassigned"
      const defaultBrand = "unassigned";

      // Default count is 1
      const defaultCount = 1;

      // Create new fixture location data
      const newFixture: LocationData = {
        blockName: mappedBlockName,
        floorIndex: currentFloor,
        originX: originX,
        originY: originY,
        posX: posX,
        posY: posY,
        posZ: posZ,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        brand: defaultBrand,
        count: defaultCount,
        hierarchy: newHierarchy,
        glbUrl: glbUrl,

        // Set original values (same as current for new fixtures)
        originalBlockName: mappedBlockName,
        originalPosX: posX,
        originalPosY: posY,
        originalPosZ: posZ,
        originalRotationX: 0,
        originalRotationY: 0,
        originalRotationZ: 0,
        originalBrand: defaultBrand,
        originalCount: defaultCount,
        originalHierarchy: newHierarchy,
        originalGlbUrl: glbUrl,

        // Mark as new fixture
        wasDuplicated: true, // Reuse this flag to indicate it's a newly added fixture
        wasMoved: false,
        wasRotated: false,
        wasTypeChanged: false,
        wasBrandChanged: false,
        wasCountChanged: false,
        wasHierarchyChanged: false,

        // Generate unique timestamps
        _updateTimestamp: Date.now() + Math.random() * 1000,
        _ingestionTimestamp: Date.now() + Math.random() * 1000,
      };

      // Add to location data
      setLocationData(prev => [...prev, newFixture]);

      // Select the newly added fixture
      setSelectedLocation(newFixture);
      setSelectedLocations([newFixture]);

    } catch (error) {
      console.error('Failed to add fixture:', error);
      alert('Failed to add fixture. Please try again.');
    }
  }, [selectedFloorFile, selectedFile, currentOrbitTarget, locationData, setLocationData, setSelectedLocation, setSelectedLocations]);

  // Handler for object type selection from modal
  const handleObjectTypeSelect = useCallback((objectType: ArchitecturalObjectType) => {
    setCurrentObjectType(objectType);
    setIsAddingObject(true);
    setObjectPlacementPoint(null); // Reset placement point
    // Cursor will change in Canvas3D when isAddingObject is true
  }, []);

  // Handler for floor click during object placement
  const handleFloorClickForObjectPlacement = useCallback((point: [number, number, number]) => {
    if (!isAddingObject || !currentObjectType) return;

    const fileForFloorExtraction = selectedFloorFile || selectedFile;
    const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
    const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

    // Force placement at ground level (y = 0)
    const groundLevelPoint: [number, number, number] = [point[0], 0, point[2]];

    // Check if this is a single-point element (doors)
    const isSinglePoint = currentObjectType === 'entrance_door' || currentObjectType === 'exit_door';

    if (isSinglePoint) {
      // Single-point placement - create immediately on first click
      const defaultDimensions = currentObjectType === 'entrance_door'
        ? { width: 1.5, height: 3.0, depth: 0.1 }
        : { width: 1.0, height: 2.5, depth: 0.1 };

      // Default block names for doors
      const defaultBlockName = currentObjectType === 'entrance_door'
        ? '1500 DOUBLE GLAZING 2'  // Default entrance door block name
        : 'FIRE EXIT';  // Default exit door block name

      // Coordinate mapping: groundLevelPoint is [x, y, z] in Three.js world (y=0 is ground)
      // DoorGLB renders with position [posX, posZ, -posY], so we need to reverse this:
      // - posX = Three.js X (horizontal)
      // - posY = -(Three.js Z) (depth, negated)
      // - posZ = Three.js Y (height/up)
      const newObject: ArchitecturalObject = {
        id: `${currentObjectType}_${currentFloor}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: currentObjectType,
        variant: defaultBlockName,  // Set default variant/block name
        floorIndex: currentFloor,
        posX: groundLevelPoint[0],      // X stays same
        posY: -groundLevelPoint[2],     // 3D Z -> CSV Y (negated)
        posZ: groundLevelPoint[1],      // 3D Y (0 for ground) -> CSV Z
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        width: defaultDimensions.width,
        height: defaultDimensions.height,
        depth: defaultDimensions.depth,
        // Store original values
        originalPosX: groundLevelPoint[0],
        originalPosY: -groundLevelPoint[2],
        originalPosZ: groundLevelPoint[1],
        originalRotationX: 0,
        originalRotationY: 0,
        originalRotationZ: 0,
        originalWidth: defaultDimensions.width,
        originalHeight: defaultDimensions.height,
        originalDepth: defaultDimensions.depth,
        wasMoved: false,
        wasRotated: false,
        wasResized: false,
        customProperties: {
          doorType: currentObjectType === 'entrance_door' ? 'entrance' : 'exit'
        }
      };

      // Fetch GLB URL for the default block name and add the object
      loadFixtureGLBs([defaultBlockName]).then(glbUrlMap => {
        const glbUrl = glbUrlMap.get(defaultBlockName);

        const objectWithGlb: ArchitecturalObject = {
          ...newObject,
          customProperties: {
            ...newObject.customProperties,
            glbUrl: glbUrl
          }
        };

        console.log(`[3DViewerModifier] Creating new door with GLB URL:`, {
          type: currentObjectType,
          variant: defaultBlockName,
          hasGlbUrl: !!glbUrl
        });

        setArchitecturalObjects(prev => [...prev, objectWithGlb]);

        // Set flag to prevent onPointerMissed from clearing selection
        justCreatedObjectRef.current = true;

        // Select the newly created object
        setTimeout(() => {
          console.log('Selecting newly created door:', objectWithGlb.id, objectWithGlb.type);
          setSelectedObject(objectWithGlb);
          setSelectedLocation(null);
          setSelectedLocations([]);
          setSelectedFloorPlate(null);

          setTimeout(() => {
            justCreatedObjectRef.current = false;
          }, 100);
        }, 0);
      }).catch(err => {
        console.error(`[3DViewerModifier] Failed to fetch GLB URL for ${defaultBlockName}:`, err);

        // Add object without GLB as fallback
        setArchitecturalObjects(prev => [...prev, newObject]);

        // Set flag to prevent onPointerMissed from clearing selection
        justCreatedObjectRef.current = true;

        // Select the newly created object
        setTimeout(() => {
          console.log('Selecting newly created door:', newObject.id, newObject.type);
          setSelectedObject(newObject);
          setSelectedLocation(null);
          setSelectedLocations([]);
          setSelectedFloorPlate(null);

          setTimeout(() => {
            justCreatedObjectRef.current = false;
          }, 100);
        }, 0);
      });

      // Reset placement state immediately for single-point elements
      setIsAddingObject(false);
      setCurrentObjectType(null);
      setObjectPlacementPoint(null);

    } else {
      // Two-point placement for glazing, partition, etc.
      if (objectPlacementPoint === null) {
        // First click - set start point at ground level
        setObjectPlacementPoint(groundLevelPoint);
      } else {
        // Second click - create object with start and end points at ground level
        const newObject: ArchitecturalObject = {
          id: `${currentObjectType}_${currentFloor}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: currentObjectType,
          floorIndex: currentFloor,
          startPoint: objectPlacementPoint,
          endPoint: groundLevelPoint,
          height: objectHeight,
          rotation: 0,
          // Store original values
          originalStartPoint: objectPlacementPoint,
          originalEndPoint: groundLevelPoint,
          originalHeight: objectHeight,
          originalRotation: 0,
          wasMoved: false,
          wasRotated: false,
          wasHeightChanged: false
        };

        // Add the new object to the list
        setArchitecturalObjects(prev => [...prev, newObject]);

        // Set flag to prevent onPointerMissed from clearing selection
        justCreatedObjectRef.current = true;

        // Select the newly created object
        setTimeout(() => {
          console.log('Selecting newly created object:', newObject.id, newObject.type);
          setSelectedObject(newObject);
          setSelectedLocation(null);
          setSelectedLocations([]);
          setSelectedFloorPlate(null);

          setTimeout(() => {
            justCreatedObjectRef.current = false;
          }, 100);
        }, 0);

        // Reset placement state
        setIsAddingObject(false);
        setCurrentObjectType(null);
        setObjectPlacementPoint(null);
      }
    }
  }, [isAddingObject, currentObjectType, objectPlacementPoint, objectHeight, selectedFloorFile, selectedFile, setSelectedLocation, setSelectedLocations]);

  // Handler for floor click during measurement
  const handleFloorClickForMeasurement = useCallback((point: [number, number, number]) => {
    if (!isMeasuring) return;

    // Force placement at ground level (y = 0)
    const groundLevelPoint: [number, number, number] = [point[0], 0, point[2]];

    if (measurementPoints.length === 0) {
      // First click - set first measurement point
      setMeasurementPoints([groundLevelPoint]);
    } else if (measurementPoints.length === 1) {
      // Second click - set second measurement point
      setMeasurementPoints([measurementPoints[0], groundLevelPoint]);
    } else {
      // Already have 2 points, reset and start new measurement
      setMeasurementPoints([groundLevelPoint]);
    }
  }, [isMeasuring, measurementPoints]);

  // Handler to clear measurement
  const handleClearMeasurement = useCallback(() => {
    setMeasurementPoints([]);
  }, []);

  // Handler for floor click during spawn point setting
  const handleFloorClickForSpawnPoint = useCallback((point: [number, number, number]) => {
    if (!setSpawnPointMode) return;

    const fileForFloorExtraction = selectedFloorFile || selectedFile;
    const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
    const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

    // Set spawn point at ground level (y = 0) for the current floor
    const spawnPoint: [number, number, number] = [point[0], 0, point[2]];

    setSpawnPoints(prev => {
      const updated = new Map(prev);
      updated.set(currentFloor, spawnPoint);
      return updated;
    });

    console.log(`Spawn point set for floor ${currentFloor}:`, spawnPoint);
  }, [setSpawnPointMode, selectedFloorFile, selectedFile]);

  // Handler for object click
  const handleObjectClick = useCallback((object: ArchitecturalObject) => {
    if (!editMode || isAddingObject) return;

    // Don't process clicks if mouse was down on transform controls
    // This prevents accidental selection when clicking transform controls that overlap other objects
    if (isMouseDownOnTransformRef.current) {
      return;
    }

    setSelectedObject(object);
    // Clear fixture selections when selecting an object
    setSelectedLocation(null);
    setSelectedLocations([]);
    setSelectedFloorPlate(null);
  }, [editMode, isAddingObject]);

  // Handler for object position change
  const handleObjectPositionChange = useCallback((object: ArchitecturalObject, newCenterPosition: [number, number, number]) => {
    setArchitecturalObjects(prev => prev.map(obj => {
      if (obj.id === object.id) {
        // Check if this is a single-point element (doors)
        const isSinglePoint = obj.posX !== undefined && obj.posY !== undefined && obj.posZ !== undefined;

        if (isSinglePoint) {
          // For single-point elements: Convert Three.js position to CSV coordinates
          // Three.js: [x, y, z] where y is up
          // CSV: posX=x, posY=-z, posZ=y
          return {
            ...obj,
            posX: newCenterPosition[0],
            posZ: newCenterPosition[1], // Three.js Y -> CSV Z
            posY: -newCenterPosition[2], // Three.js Z -> CSV Y (negated)
            wasMoved: true,
            originalPosX: obj.originalPosX ?? obj.posX,
            originalPosY: obj.originalPosY ?? obj.posY,
            originalPosZ: obj.originalPosZ ?? obj.posZ
          };
        }

        // For two-point elements: Calculate offset from original center
        const originalCenter: [number, number, number] = [
          (obj.startPoint![0] + obj.endPoint![0]) / 2,
          obj.startPoint![1],  // Ground level (y coordinate of start/end points)
          (obj.startPoint![2] + obj.endPoint![2]) / 2
        ];

        // Force Y to stay at ground level (0), only allow X and Z movement
        const offset: [number, number, number] = [
          newCenterPosition[0] - originalCenter[0],
          0,  // No Y movement - keep at ground level
          newCenterPosition[2] - originalCenter[2]
        ];

        // Apply offset to both start and end points (Y remains at 0)
        const newStartPoint: [number, number, number] = [
          obj.startPoint![0] + offset[0],
          0,  // Force ground level
          obj.startPoint![2] + offset[2]
        ];

        const newEndPoint: [number, number, number] = [
          obj.endPoint![0] + offset[0],
          0,  // Force ground level
          obj.endPoint![2] + offset[2]
        ];

        return {
          ...obj,
          startPoint: newStartPoint,
          endPoint: newEndPoint,
          wasMoved: true,
          originalStartPoint: obj.originalStartPoint || obj.startPoint,
          originalEndPoint: obj.originalEndPoint || obj.endPoint
        };
      }
      return obj;
    }));

    // Update selected object
    if (selectedObject?.id === object.id) {
      setSelectedObject(prev => {
        if (!prev) return null;

        const isSinglePoint = prev.posX !== undefined && prev.posY !== undefined && prev.posZ !== undefined;

        if (isSinglePoint) {
          // For single-point elements
          return {
            ...prev,
            posX: newCenterPosition[0],
            posZ: newCenterPosition[1],
            posY: -newCenterPosition[2],
            wasMoved: true,
            originalPosX: prev.originalPosX ?? prev.posX,
            originalPosY: prev.originalPosY ?? prev.posY,
            originalPosZ: prev.originalPosZ ?? prev.posZ
          };
        }

        // For two-point elements
        const originalCenter: [number, number, number] = [
          (prev.startPoint![0] + prev.endPoint![0]) / 2,
          prev.startPoint![1],  // Ground level
          (prev.startPoint![2] + prev.endPoint![2]) / 2
        ];

        const offset: [number, number, number] = [
          newCenterPosition[0] - originalCenter[0],
          newCenterPosition[1] - originalCenter[1],
          newCenterPosition[2] - originalCenter[2]
        ];

        return {
          ...prev,
          startPoint: [
            prev.startPoint![0] + offset[0],
            prev.startPoint![1] + offset[1],
            prev.startPoint![2] + offset[2]
          ],
          endPoint: [
            prev.endPoint![0] + offset[0],
            prev.endPoint![1] + offset[1],
            prev.endPoint![2] + offset[2]
          ],
          wasMoved: true,
          originalStartPoint: prev.originalStartPoint || prev.startPoint,
          originalEndPoint: prev.originalEndPoint || prev.endPoint
        };
      });
    }
  }, [selectedObject]);

  // Handler for object rotation
  const handleObjectRotate = useCallback((object: ArchitecturalObject, angle: number) => {
    setArchitecturalObjects(prev => prev.map(obj => {
      if (obj.id === object.id) {
        // Check if this is a single-point element (doors)
        const isSinglePoint = obj.posX !== undefined && obj.posY !== undefined && obj.posZ !== undefined;

        if (isSinglePoint) {
          // For single-point elements: angle is in radians, convert to degrees and update rotationZ
          // rotationZ in CSV corresponds to Three.js Y-axis (vertical/up axis)
          const angleInDegrees = (angle * 180) / Math.PI;
          return {
            ...obj,
            rotationZ: (obj.rotationZ || 0) + angleInDegrees,
            wasRotated: true,
            originalRotationZ: obj.originalRotationZ ?? (obj.rotationZ || 0)
          };
        } else {
          // For two-point elements: update rotation (in radians)
          return {
            ...obj,
            rotation: (obj.rotation || 0) + angle,
            wasRotated: true,
            originalRotation: obj.originalRotation ?? (obj.rotation || 0)
          };
        }
      }
      return obj;
    }));

    if (selectedObject?.id === object.id) {
      setSelectedObject(prev => {
        if (!prev) return null;

        const isSinglePoint = prev.posX !== undefined && prev.posY !== undefined && prev.posZ !== undefined;

        if (isSinglePoint) {
          const angleInDegrees = (angle * 180) / Math.PI;
          return {
            ...prev,
            rotationZ: (prev.rotationZ || 0) + angleInDegrees,
            wasRotated: true,
            originalRotationZ: prev.originalRotationZ ?? (prev.rotationZ || 0)
          };
        } else {
          return {
            ...prev,
            rotation: (prev.rotation || 0) + angle,
            wasRotated: true,
            originalRotation: prev.originalRotation ?? (prev.rotation || 0)
          };
        }
      });
    }
  }, [selectedObject]);

  // Handler for object height change
  const handleObjectHeightChange = useCallback((object: ArchitecturalObject, newHeight: number) => {
    setArchitecturalObjects(prev => prev.map(obj => {
      if (obj.id === object.id) {
        return {
          ...obj,
          height: newHeight,
          wasHeightChanged: true,
          originalHeight: obj.originalHeight ?? obj.height
        };
      }
      return obj;
    }));

    if (selectedObject?.id === object.id) {
      setSelectedObject(prev => prev ? {
        ...prev,
        height: newHeight,
        wasHeightChanged: true,
        originalHeight: prev.originalHeight ?? prev.height
      } : null);
    }
  }, [selectedObject]);

  // Handler for single-point position change (for doors, columns, etc.)
  const handleSinglePointPositionChange = useCallback((object: ArchitecturalObject, newPosX: number, newPosY: number, newPosZ: number) => {
    setArchitecturalObjects(prev => prev.map(obj => {
      if (obj.id === object.id) {
        return {
          ...obj,
          posX: newPosX,
          posY: newPosY,
          posZ: newPosZ,
          wasMoved: true,
          originalPosX: obj.originalPosX ?? obj.posX,
          originalPosY: obj.originalPosY ?? obj.posY,
          originalPosZ: obj.originalPosZ ?? obj.posZ
        };
      }
      return obj;
    }));

    if (selectedObject?.id === object.id) {
      setSelectedObject(prev => prev ? {
        ...prev,
        posX: newPosX,
        posY: newPosY,
        posZ: newPosZ,
        wasMoved: true,
        originalPosX: prev.originalPosX ?? prev.posX,
        originalPosY: prev.originalPosY ?? prev.posY,
        originalPosZ: prev.originalPosZ ?? prev.posZ
      } : null);
    }
  }, [selectedObject]);

  // Handler for object start/end points change (for length editing)
  const handleObjectPointsChange = useCallback((object: ArchitecturalObject, newStartPoint: [number, number, number], newEndPoint: [number, number, number]) => {
    setArchitecturalObjects(prev => prev.map(obj => {
      if (obj.id === object.id) {
        return {
          ...obj,
          startPoint: newStartPoint,
          endPoint: newEndPoint,
          wasMoved: true,
          originalStartPoint: obj.originalStartPoint ?? obj.startPoint,
          originalEndPoint: obj.originalEndPoint ?? obj.endPoint
        };
      }
      return obj;
    }));

    if (selectedObject?.id === object.id) {
      setSelectedObject(prev => prev ? {
        ...prev,
        startPoint: newStartPoint,
        endPoint: newEndPoint,
        wasMoved: true,
        originalStartPoint: prev.originalStartPoint ?? prev.startPoint,
        originalEndPoint: prev.originalEndPoint ?? prev.endPoint
      } : null);
    }
  }, [selectedObject]);

  // Handler for object deletion
  const handleObjectDelete = useCallback((object: ArchitecturalObject) => {
    setArchitecturalObjects(prev => prev.filter(obj => obj.id !== object.id));
    setSelectedObject(null);
  }, []);

  // Handler for object reset
  const handleObjectReset = useCallback((object: ArchitecturalObject) => {
    setArchitecturalObjects(prev => prev.map(obj => {
      if (obj.id === object.id) {
        // Check if this is a single-point element (doors)
        const isSinglePoint = obj.posX !== undefined && obj.posY !== undefined && obj.posZ !== undefined;

        if (isSinglePoint) {
          // Reset single-point element properties
          return {
            ...obj,
            posX: obj.originalPosX ?? obj.posX,
            posY: obj.originalPosY ?? obj.posY,
            posZ: obj.originalPosZ ?? obj.posZ,
            rotationX: obj.originalRotationX ?? obj.rotationX ?? 0,
            rotationY: obj.originalRotationY ?? obj.rotationY ?? 0,
            rotationZ: obj.originalRotationZ ?? obj.rotationZ ?? 0,
            width: obj.originalWidth ?? obj.width,
            height: obj.originalHeight ?? obj.height,
            depth: obj.originalDepth ?? obj.depth,
            wasMoved: false,
            wasRotated: false,
            wasResized: false
          };
        } else {
          // Reset two-point element properties
          return {
            ...obj,
            startPoint: obj.originalStartPoint || obj.startPoint,
            endPoint: obj.originalEndPoint || obj.endPoint,
            height: obj.originalHeight ?? obj.height,
            rotation: obj.originalRotation ?? obj.rotation ?? 0,
            wasMoved: false,
            wasRotated: false,
            wasHeightChanged: false
          };
        }
      }
      return obj;
    }));

    if (selectedObject?.id === object.id) {
      setSelectedObject(prev => {
        if (!prev) return null;

        const isSinglePoint = prev.posX !== undefined && prev.posY !== undefined && prev.posZ !== undefined;

        if (isSinglePoint) {
          return {
            ...prev,
            posX: prev.originalPosX ?? prev.posX,
            posY: prev.originalPosY ?? prev.posY,
            posZ: prev.originalPosZ ?? prev.posZ,
            rotationX: prev.originalRotationX ?? prev.rotationX ?? 0,
            rotationY: prev.originalRotationY ?? prev.rotationY ?? 0,
            rotationZ: prev.originalRotationZ ?? prev.rotationZ ?? 0,
            width: prev.originalWidth ?? prev.width,
            height: prev.originalHeight ?? prev.height,
            depth: prev.originalDepth ?? prev.depth,
            wasMoved: false,
            wasRotated: false,
            wasResized: false
          };
        } else {
          return {
            ...prev,
            startPoint: prev.originalStartPoint || prev.startPoint,
            endPoint: prev.originalEndPoint || prev.endPoint,
            height: prev.originalHeight ?? prev.height,
            rotation: prev.originalRotation ?? prev.rotation ?? 0,
            wasMoved: false,
            wasRotated: false,
            wasHeightChanged: false
          };
        }
      });
    }
  }, [selectedObject]);

  // Helper function to get floor index mapping if floors have been reordered or deleted
  const getFloorIndexMapping = useCallback((): Map<number, number> | null => {
    if (!floorDisplayOrder || floorDisplayOrder.length === 0) {
      return null;
    }

    // Check if floors have been reordered or deleted
    const originalOrder = [...floorDisplayOrder].sort((a, b) => a - b);
    const isReordered = floorDisplayOrder.some((idx, i) => idx !== originalOrder[i]);

    // Check if floors have been deleted (if initialFloorCount is set)
    const hasDeleted = initialFloorCount > 0 && floorDisplayOrder.length < initialFloorCount;

    // If neither reordered nor deleted, no remapping needed
    if (!isReordered && !hasDeleted) {
      return null;
    }

    // Create mapping from old floor index to new sequential floor index
    const indexMapping = new Map<number, number>();
    floorDisplayOrder.forEach((oldIndex, newIndex) => {
      indexMapping.set(oldIndex, newIndex);
    });

    console.log('Floor index mapping:', Object.fromEntries(indexMapping));
    return indexMapping;
  }, [floorDisplayOrder, initialFloorCount]);

  // Helper function to apply floor remapping to location data
  const remapLocationData = useCallback((data: LocationData[], mapping: Map<number, number>): LocationData[] => {
    return data
      .filter(location => {
        // Filter out fixtures from deleted floors (floors not in the mapping)
        return mapping.has(location.floorIndex);
      })
      .map(location => ({
        ...location,
        floorIndex: mapping.get(location.floorIndex) ?? location.floorIndex
      }));
  }, []);

  // Helper function to apply floor remapping to floor plates data
  const remapFloorPlatesData = useCallback((data: Record<string, Record<string, any[]>>, mapping: Map<number, number>): Record<string, Record<string, any[]>> => {
    const newData: Record<string, Record<string, any[]>> = {};
    Object.entries(data).forEach(([oldFloorStr, brandData]) => {
      const oldFloor = parseInt(oldFloorStr);
      const newFloor = mapping.get(oldFloor) ?? oldFloor;
      newData[newFloor.toString()] = brandData;
    });
    return newData;
  }, []);

  // Helper function to rename floor files based on mapping
  const remapFloorFileName = useCallback((fileName: string, mapping: Map<number, number>): string => {
    const floorMatch = fileName.match(/(floor[_-]?)(\d+)/i);
    if (floorMatch) {
      const oldFloorNum = parseInt(floorMatch[2]);
      const newFloorNum = mapping.get(oldFloorNum);

      if (newFloorNum !== undefined) {
        // Replace the floor number with the new mapped number
        // Preserve the separator (dash or underscore) and case
        const prefix = floorMatch[1]; // e.g., "floor-", "floor_", "Floor-", etc.
        return fileName.replace(
          /(floor[_-]?)(\d+)/i,
          `${prefix}${newFloorNum}`
        );
      }
    }
    return fileName;
  }, []);

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

      // Add all fixture GLBs for the current floor (excluding deleted and forDelete fixtures)
      const currentFloorLocations = locationData.filter(location => {
        if (location.floorIndex !== currentFloor || !location.glbUrl) return false;

        // Exclude forDelete fixtures (marked when split or type-changed)
        if (location.forDelete) return false;

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

      // Add architectural objects (glazing and partitions) for the current floor
      const currentFloorObjects = architecturalObjects.filter(obj => obj.floorIndex === currentFloor);

      for (const obj of currentFloorObjects) {
        const { startPoint, endPoint, height } = obj;

        // Skip objects without required properties (two-point elements)
        if (!startPoint || !endPoint || height === undefined) {
          continue;
        }

        // Calculate dimensions and position
        const dx = endPoint[0] - startPoint[0];
        const dz = endPoint[2] - startPoint[2];
        const length = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(-dz, dx);  // Negate dz to match coordinate system

        // Position at midpoint - origin at ground level
        const position = new THREE.Vector3(
          (startPoint[0] + endPoint[0]) / 2,
          startPoint[1],  // Ground level
          (startPoint[2] + endPoint[2]) / 2
        );

        let geometry: THREE.BufferGeometry;
        let material: THREE.Material;

        // Create a group for proper origin positioning
        const objectGroup = new THREE.Group();
        objectGroup.position.copy(position);
        objectGroup.rotation.set(0, angle, 0);

        if (obj.type === 'glazing') {
          // Create plane geometry for glazing (glass)
          geometry = new THREE.PlaneGeometry(length, height);
          material = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
          });

          // Create glass mesh offset upward by height/2 (since origin is at ground level)
          const glassMesh = new THREE.Mesh(geometry, material);
          glassMesh.position.set(0, height / 2, 0);
          objectGroup.add(glassMesh);

          // Add metal frame around the glass (50mm thickness, 100mm depth)
          const frameThickness = 0.05; // 50mm
          const frameDepth = 0.1; // 100mm
          const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444, // Dark grey metal
            metalness: 0.8,
            roughness: 0.2
          });

          // Top frame
          const topFrame = new THREE.Mesh(
            new THREE.BoxGeometry(length, frameThickness, frameDepth),
            frameMaterial
          );
          topFrame.position.set(0, height - frameThickness / 2, 0);
          objectGroup.add(topFrame);

          // Bottom frame
          const bottomFrame = new THREE.Mesh(
            new THREE.BoxGeometry(length, frameThickness, frameDepth),
            frameMaterial
          );
          bottomFrame.position.set(0, frameThickness / 2, 0);
          objectGroup.add(bottomFrame);

          // Left frame
          const leftFrame = new THREE.Mesh(
            new THREE.BoxGeometry(frameThickness, height - 2 * frameThickness, frameDepth),
            frameMaterial
          );
          leftFrame.position.set(-length / 2 + frameThickness / 2, height / 2, 0);
          objectGroup.add(leftFrame);

          // Right frame
          const rightFrame = new THREE.Mesh(
            new THREE.BoxGeometry(frameThickness, height - 2 * frameThickness, frameDepth),
            frameMaterial
          );
          rightFrame.position.set(length / 2 - frameThickness / 2, height / 2, 0);
          objectGroup.add(rightFrame);
        } else {
          // Create box geometry for partition (60mm width)
          const width = 0.06;
          geometry = new THREE.BoxGeometry(length, height, width);
          material = new THREE.MeshStandardMaterial({
            color: 0xcccccc
          });

          // Create mesh offset upward by height/2 (since origin is at ground level)
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(0, height / 2, 0);

          objectGroup.add(mesh);
        }

        exportScene.add(objectGroup);
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
  }, [selectedFile, selectedFloorFile, locationData, deletedFixtures, architecturalObjects, isExporting]);

  // Export a baked floor GLB with architectural elements merged (for live deployment)
  const exportBakedFloorGLB = useCallback(async (
    floorFile: ExtractedFile,
    floorIndex: number,
    workingArchObjects: typeof architecturalObjects
  ): Promise<Blob> => {
    let dracoLoader: DRACOLoader | null = null;

    try {
      // Create a new scene to combine floor and architectural elements
      const exportScene = new THREE.Scene();

      // Load the floor model using GLTFLoader directly
      const loader = new GLTFLoader();

      // Set up DRACO loader for compressed GLBs
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(dracoLoader);

      // Add the floor model
      const floorGLTF = await new Promise<GLTF>((resolve, reject) => {
        loader.load(floorFile.url, resolve, undefined, reject);
      });
      const floorModel = floorGLTF.scene.clone();
      exportScene.add(floorModel);

      // Add architectural objects (glazing, partitions, and doors) for this floor
      const currentFloorObjects = workingArchObjects.filter(obj => obj.floorIndex === floorIndex);

      for (const obj of currentFloorObjects) {
        // Handle door objects (entrance_door, exit_door) - single point with rotation
        if (obj.type === 'entrance_door' || obj.type === 'exit_door') {
          const { posX, posY, posZ, rotationX, rotationY, rotationZ, width, height, depth } = obj;

          // Skip if missing required properties
          if (posX === undefined || posY === undefined || posZ === undefined) {
            console.warn(`Skipping door ${obj.id}: missing required position properties`);
            continue;
          }

          // Transform CSV coordinates to Three.js world coordinates
          // CSV: posX=x, posY=-z, posZ=y
          // Three.js: [x, y, z]
          const threePosition: [number, number, number] = [
            posX,           // X stays the same
            posZ || 0,      // Y comes from CSV posZ
            -(posY || 0)    // Z is negated CSV posY
          ];

          // Create door group at the correct position (matching DoorGLB component)
          const doorGroup = new THREE.Group();
          doorGroup.position.set(threePosition[0], threePosition[1], threePosition[2]);

          // Apply rotation - convert from degrees to radians (matching DoorGLB component)
          // Canvas3D.tsx:778 uses rotation order: [rotationX, rotationZ, rotationY]
          const rotX = ((rotationX || 0) * Math.PI) / 180;
          const rotY = ((rotationY || 0) * Math.PI) / 180;
          const rotZ = ((rotationZ || 0) * Math.PI) / 180;
          doorGroup.rotation.set(rotX, rotZ, rotY); // Note: Y and Z are swapped!

          // Check if door has a GLB URL (actual door model)
          const glbUrl = obj.customProperties?.glbUrl;

          if (glbUrl) {
            // Load the actual door GLB model
            try {
              const doorGLTF = await new Promise<GLTF>((resolve, reject) => {
                loader.load(glbUrl, resolve, undefined, reject);
              });

              // Clone the door model and add to group
              const doorModel = doorGLTF.scene.clone();
              doorGroup.add(doorModel);
              console.log(`[Baking] Loaded door GLB model from ${glbUrl}`);
            } catch (error) {
              console.error(`[Baking] Failed to load door GLB from ${glbUrl}, using fallback geometry:`, error);
              // Fall through to create fallback geometry
            }
          }

          // If no GLB URL or loading failed, create fallback geometry
          if (!glbUrl || doorGroup.children.length === 0) {
            console.log(`[Baking] Using fallback box geometry for door ${obj.id}`);
            const fallbackWidth = width || 1.5;
            const fallbackHeight = height || 3.0;
            const fallbackDepth = depth || 0.1;

            // Create door frame (darker material)
            const frameMaterial = new THREE.MeshStandardMaterial({
              color: obj.type === 'entrance_door' ? 0x333333 : 0xCC0000,
              metalness: 0.5,
              roughness: 0.5
            });

            // Door panel (slightly inset from frame)
            const doorMaterial = new THREE.MeshStandardMaterial({
              color: obj.type === 'entrance_door' ? 0x8B4513 : 0xFF6666,
              metalness: 0.1,
              roughness: 0.8
            });

            // Main door panel - centered at group origin
            const doorPanel = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth * 0.9, fallbackHeight * 0.9, fallbackDepth * 0.5),
              doorMaterial
            );
            doorPanel.position.set(0, 0, 0);
            doorGroup.add(doorPanel);

            // Door frame - top
            const topFrame = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth, fallbackHeight * 0.05, fallbackDepth),
              frameMaterial
            );
            topFrame.position.set(0, fallbackHeight / 2 - (fallbackHeight * 0.025), 0);
            doorGroup.add(topFrame);

            // Door frame - bottom
            const bottomFrame = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth, fallbackHeight * 0.05, fallbackDepth),
              frameMaterial
            );
            bottomFrame.position.set(0, -fallbackHeight / 2 + (fallbackHeight * 0.025), 0);
            doorGroup.add(bottomFrame);

            // Door frame - left
            const leftFrame = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth * 0.05, fallbackHeight * 0.9, fallbackDepth),
              frameMaterial
            );
            leftFrame.position.set(-fallbackWidth / 2 + (fallbackWidth * 0.025), 0, 0);
            doorGroup.add(leftFrame);

            // Door frame - right
            const rightFrame = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth * 0.05, fallbackHeight * 0.9, fallbackDepth),
              frameMaterial
            );
            rightFrame.position.set(fallbackWidth / 2 - (fallbackWidth * 0.025), 0, 0);
            doorGroup.add(rightFrame);
          }

          exportScene.add(doorGroup);
          continue; // Skip to next object
        }

        // Handle two-point objects (glazing and partitions)
        const { startPoint, endPoint, height } = obj;

        // Skip objects without required properties (two-point elements)
        if (!startPoint || !endPoint || height === undefined) {
          continue;
        }

        // Calculate dimensions and position
        const dx = endPoint[0] - startPoint[0];
        const dz = endPoint[2] - startPoint[2];
        const length = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(-dz, dx);  // Negate dz to match coordinate system

        // Position at midpoint - origin at ground level
        const position = new THREE.Vector3(
          (startPoint[0] + endPoint[0]) / 2,
          startPoint[1],  // Ground level
          (startPoint[2] + endPoint[2]) / 2
        );

        let geometry: THREE.BufferGeometry;
        let material: THREE.Material;

        // Create a group for proper origin positioning
        const objectGroup = new THREE.Group();
        objectGroup.position.copy(position);
        objectGroup.rotation.set(0, angle, 0);

        if (obj.type === 'glazing') {
          // Create plane geometry for glazing (glass)
          geometry = new THREE.PlaneGeometry(length, height);
          material = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
          });

          // Create glass mesh offset upward by height/2 (since origin is at ground level)
          const glassMesh = new THREE.Mesh(geometry, material);
          glassMesh.position.set(0, height / 2, 0);
          objectGroup.add(glassMesh);

          // Add metal frame around the glass (50mm thickness, 100mm depth)
          const frameThickness = 0.05; // 50mm
          const frameDepth = 0.1; // 100mm
          const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444, // Dark grey metal
            metalness: 0.8,
            roughness: 0.2
          });

          // Top frame
          const topFrame = new THREE.Mesh(
            new THREE.BoxGeometry(length, frameThickness, frameDepth),
            frameMaterial
          );
          topFrame.position.set(0, height - frameThickness / 2, 0);
          objectGroup.add(topFrame);

          // Bottom frame
          const bottomFrame = new THREE.Mesh(
            new THREE.BoxGeometry(length, frameThickness, frameDepth),
            frameMaterial
          );
          bottomFrame.position.set(0, frameThickness / 2, 0);
          objectGroup.add(bottomFrame);

          // Left frame
          const leftFrame = new THREE.Mesh(
            new THREE.BoxGeometry(frameThickness, height - 2 * frameThickness, frameDepth),
            frameMaterial
          );
          leftFrame.position.set(-length / 2 + frameThickness / 2, height / 2, 0);
          objectGroup.add(leftFrame);

          // Right frame
          const rightFrame = new THREE.Mesh(
            new THREE.BoxGeometry(frameThickness, height - 2 * frameThickness, frameDepth),
            frameMaterial
          );
          rightFrame.position.set(length / 2 - frameThickness / 2, height / 2, 0);
          objectGroup.add(rightFrame);
        } else {
          // Create box geometry for partition (60mm width)
          const width = 0.06;
          geometry = new THREE.BoxGeometry(length, height, width);
          material = new THREE.MeshStandardMaterial({
            color: 0xcccccc
          });

          // Create mesh offset upward by height/2 (since origin is at ground level)
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(0, height / 2, 0);

          objectGroup.add(mesh);
        }

        exportScene.add(objectGroup);
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

      // Return as blob
      return new Blob([result], { type: 'application/octet-stream' });

    } finally {
      // Cleanup DRACO loader
      if (dracoLoader) {
        dracoLoader.dispose();
      }
    }
  }, []);



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

// Generate store config JSON with floor data and fixture mappings from API
// NOTE: Architectural objects are now stored in a separate arch-objects.json file
const createStoreConfigJSON = useCallback(async (
  workingLocationData: LocationData[],
  workingExtractedFiles: ExtractedFile[],
  currentSpawnPoints: Map<number, [number, number, number]>,
  currentFloorNames: Map<number, string>
): Promise<string> => {
  log('Generating store config JSON...');

  // Check if existing store-config.json exists and preserve spawn points, floor names, and fixture mappings
  const existingConfigFile = workingExtractedFiles.find(file =>
    file.name.toLowerCase() === 'store-config.json'
  );

  let existingFloorData: Record<number, { name: string; spawn_point: number[] }> = {};
  let existingBlockFixtureTypes: Record<string, string> = {};
  let existingFixtureTypeUrls: Record<string, string> = {};

  if (existingConfigFile) {
    try {
      const response = await fetch(existingConfigFile.url);
      const existingConfig = await response.json();

      // Preserve floor data
      if (existingConfig.floor && Array.isArray(existingConfig.floor)) {
        existingConfig.floor.forEach((floor: any) => {
          if (floor.floor_index !== undefined) {
            existingFloorData[floor.floor_index] = {
              name: floor.name || '',
              spawn_point: floor.spawn_point || [0, 0, 0]
            };
          }
        });
        log('Preserved floor data from existing config:', existingFloorData);
      }

      // Preserve block_fixture_types mapping
      if (existingConfig.block_fixture_types && typeof existingConfig.block_fixture_types === 'object') {
        existingBlockFixtureTypes = { ...existingConfig.block_fixture_types };
        log('Preserved block_fixture_types from existing config:', existingBlockFixtureTypes);
      }

      // Preserve fixture_type_glb_urls mapping
      if (existingConfig.fixture_type_glb_urls && typeof existingConfig.fixture_type_glb_urls === 'object') {
        existingFixtureTypeUrls = { ...existingConfig.fixture_type_glb_urls };
        log('Preserved fixture_type_glb_urls from existing config:', existingFixtureTypeUrls);
      }
    } catch (error) {
      console.warn('Failed to parse existing store-config.json, using defaults:', error);
    }
  }

  // 1. Build floor array from extracted floor files
  const floorFiles = workingExtractedFiles.filter(file =>
    isFloorFile(file.name) && !isShatteredFloorPlateFile(file.name)
  );

  const floors = floorFiles.map(file => {
    const floorMatch = file.name.match(/floor[_-]?(\d+)/i);
    const floorIndex = floorMatch ? parseInt(floorMatch[1]) : 0;

    // Try to get existing floor data first
    const existingFloor = existingFloorData[floorIndex];

    // Extract floor name from filename (e.g., "LB_floor_0.glb" -> "LB") as fallback
    let defaultFloorName: string;

    // Check if filename starts with "dg2n-3d-" prefix
    if (file.name.toLowerCase().startsWith('dg2n-3d-')) {
      // Remove "dg2n-3d-" prefix and .glb extension
      defaultFloorName = file.name.substring(8).replace('.glb', '');
    } else {
      const nameMatch = file.name.match(/^(.+?)[-_]floor/i);
      defaultFloorName = nameMatch ? nameMatch[1] : `Floor ${floorIndex}`;
    }

    // Use existing name and spawn point if available, otherwise use defaults
    // If existing name is "dg2n-3d", replace it with the extracted name
    let floorName: string;

    // Priority: currentFloorNames > existingFloor?.name > defaultFloorName
    if (currentFloorNames.has(floorIndex)) {
      floorName = currentFloorNames.get(floorIndex)!;
    } else if (existingFloor?.name && existingFloor.name.toLowerCase() !== 'dg2n-3d') {
      floorName = existingFloor.name;
    } else {
      floorName = defaultFloorName;
    }

    // Priority: currentSpawnPoints > existingFloor?.spawn_point > throw error (spawn point required)
    let spawnPoint: [number, number, number];
    if (currentSpawnPoints.has(floorIndex)) {
      spawnPoint = currentSpawnPoints.get(floorIndex)!;
    } else if (existingFloor?.spawn_point) {
      spawnPoint = existingFloor.spawn_point as [number, number, number];
    } else {
      // Don't default to [0, 0, 0] - spawn point must be set
      throw new Error(`Spawn point not set for floor ${floorIndex}. Please set spawn points on all floors before saving.`);
    }

    return {
      name: floorName,
      glb_file_name: file.name,
      floor_index: floorIndex,
      spawn_point: spawnPoint
    };
  }).sort((a, b) => a.floor_index - b.floor_index);

  // 2. Get all unique block names from fixtures
  const uniqueBlockNames = Array.from(new Set(
    workingLocationData
      .filter(loc => !loc.forDelete)
      .map(loc => loc.blockName)
  ));

  // 3. Fetch block_fixture_types mapping from API and merge with existing
  let blockFixtureTypes: Record<string, string> = { ...existingBlockFixtureTypes };
  try {
    if (uniqueBlockNames.length > 0) {
      log(`Fetching fixture types for ${uniqueBlockNames.length} block names...`);
      const fixtureBlocks = await apiService.getFixtureBlocks(uniqueBlockNames);
      fixtureBlocks.forEach(block => {
        if (block.block_name && block.fixture_type) {
          blockFixtureTypes[block.block_name] = block.fixture_type;
        }
      });
      log(`Block-to-fixture-type mappings: ${Object.keys(blockFixtureTypes).length} total (${Object.keys(existingBlockFixtureTypes).length} preserved, ${fixtureBlocks.length} fetched)`);
    }
  } catch (error) {
    console.error('Failed to fetch block fixture types:', error);
    // Continue with preserved mappings only
  }

  // 4. Get all unique fixture types from merged mappings
  const uniqueFixtureTypes = Array.from(new Set(Object.values(blockFixtureTypes)));

  // 5. Fetch fixture_type_glb_urls mapping from API and merge with existing
  let fixtureTypeGlbUrls: Record<string, string> = { ...existingFixtureTypeUrls };
  try {
    if (uniqueFixtureTypes.length > 0) {
      log(`Fetching GLB URLs for ${uniqueFixtureTypes.length} fixture types...`);
      const urlPromises = uniqueFixtureTypes.map(async (fixtureType) => {
        try {
          const typeInfo = await apiService.getFixtureTypeUrl(fixtureType);
          return { fixtureType, url: typeInfo.glb_url };
        } catch (error) {
          console.error(`Failed to fetch URL for fixture type ${fixtureType}:`, error);
          return { fixtureType, url: null };
        }
      });

      const results = await Promise.all(urlPromises);
      results.forEach(result => {
        if (result.url) {
          fixtureTypeGlbUrls[result.fixtureType] = result.url;
        }
      });
      log(`Fixture-type-to-URL mappings: ${Object.keys(fixtureTypeGlbUrls).length} total (${Object.keys(existingFixtureTypeUrls).length} preserved, ${results.filter(r => r.url).length} fetched)`);
    }
  } catch (error) {
    console.error('Failed to fetch fixture type URLs:', error);
    // Continue with preserved mappings only
  }

  // 6. Fetch direct render fixture types
  let directRenderTypes: string[] = [];
  try {
    log('Fetching direct render fixture types...');
    const directRenderData = await apiService.getDirectRenderTypes('02');
    directRenderTypes = directRenderData.direct_render_fixture_types;
    log(`Found ${directRenderTypes.length} direct render fixture types`);
  } catch (error) {
    console.error('Failed to fetch direct render types:', error);
    // Continue without direct render types
  }

  // 7. Build the config object (architectural elements now stored in separate file)
  const config = {
    floor: floors,
    block_fixture_types: blockFixtureTypes,
    fixture_type_glb_urls: fixtureTypeGlbUrls,
    additional_block_fixture_type: directRenderTypes
  };

  log('Store config generated with', floors.length, 'floors');
  return JSON.stringify(config, null, 2);
}, []);

const createModifiedZipBlob = useCallback(async (): Promise<Blob> => {
    const zip = new JSZip();
    log('Building modified ZIP...');

    // Check if floors need to be remapped
    const floorMapping = getFloorIndexMapping();

    // Apply floor remapping to data if needed
    let workingLocationData = locationData;
    let workingExtractedFiles = extractedFiles;

    if (floorMapping) {
      log('Applying floor remapping to export data');
      workingLocationData = remapLocationData(locationData, floorMapping);

      // Remap file names
      workingExtractedFiles = extractedFiles.map(file => {
        const newName = remapFloorFileName(file.name, floorMapping);
        if (newName !== file.name) {
          log(`Renaming file: ${file.name} -> ${newName}`);
          return { ...file, name: newName };
        }
        return file;
      });
    }

    log('Extracted files:', workingExtractedFiles.map(f => f.name));

    // Add all original files except the CSVs that need to be modified, store-config.json, and arch-objects.json
    // NOTE: Architectural elements are stored in arch-objects.json (not CSV or GLB)
    for (const file of workingExtractedFiles) {
      if (isLocationCsv(file.name) || isFloorPlatesCsv(file.name)) {
        log('Skipping original CSV in bundle:', file.name);
        continue;
      }

      // Skip existing store-config.json and arch-objects.json since we'll regenerate them
      if (file.name.toLowerCase() === 'store-config.json') {
        log('Skipping original store-config.json (will regenerate):', file.name);
        continue;
      }

      if (file.name.toLowerCase() === 'arch-objects.json') {
        log('Skipping original arch-objects.json (will regenerate):', file.name);
        continue;
      }

      // Add all other files including floor GLBs (without architectural elements baked in)
      zip.file(file.name, file.blob);
    }

    // Create modified location-master.csv using remapped data
    await createModifiedLocationMasterCSV(zip, deletedFixturePositions, workingLocationData, workingExtractedFiles, floorMapping);

    // Create modified floor plates CSV if there are floor plate changes or floor remapping, otherwise preserve original
    if (modifiedFloorPlates.size > 0 || floorMapping) {
      await createModifiedFloorPlatesCSV(zip, workingExtractedFiles, floorMapping);
    } else {
      const originalFloorPlatesFile = workingExtractedFiles.find((file) => isFloorPlatesCsv(file.name));
      if (originalFloorPlatesFile) {
        log('No floor plate edits; keeping original:', originalFloorPlatesFile.name);
        zip.file(originalFloorPlatesFile.name, originalFloorPlatesFile.blob);
      }
    }

    // NOTE: Architectural elements are saved in arch-objects.json (see below)
    // They are NOT baked into GLB files, allowing them to remain editable

    // Generate and add store config JSON (without architectural elements)
    try {
      log('Creating store config JSON...');
      const configJson = await createStoreConfigJSON(workingLocationData, workingExtractedFiles, spawnPoints, floorNames);
      zip.file('store-config.json', configJson);
      log('Added store-config.json to ZIP');
    } catch (error) {
      console.error('Failed to create store config JSON:', error);
      // If spawn point is missing, throw error to prevent saving
      if (error instanceof Error && error.message.includes('Spawn point not set')) {
        throw error;
      }
      // Continue with export for other errors
    }

    // Generate and add arch objects JSON (separate file for architectural elements)
    try {
      log('Creating arch objects JSON...');
      const archObjectsJson = JSON.stringify(architecturalObjects, null, 2);
      zip.file('arch-objects.json', archObjectsJson);
      log('Added arch-objects.json to ZIP with', architecturalObjects.length, 'architectural elements');
    } catch (error) {
      console.error('Failed to create arch objects JSON:', error);
      // Continue with export even if arch objects fail
    }

    // Generate and add baked floor GLBs (with architectural elements merged)
    // These will be used for live deployment
    try {
      log('Generating baked floor GLB models with architectural elements...');

      // Apply floor remapping to architectural objects if needed
      let workingArchObjects = architecturalObjects;
      if (floorMapping) {
        workingArchObjects = architecturalObjects.map(obj => ({
          ...obj,
          floorIndex: floorMapping.get(obj.floorIndex) ?? obj.floorIndex
        }));
      }

      const floorFiles = workingExtractedFiles.filter(file =>
        isFloorFile(file.name) && !isShatteredFloorPlateFile(file.name)
      );

      for (const floorFile of floorFiles) {
        const floorMatch = floorFile.name.match(/floor[_-]?(\d+)/i);
        const floorIndex = floorMatch ? parseInt(floorMatch[1]) : 0;

        log(`Generating baked GLB for floor ${floorIndex}...`);
        const bakedBlob = await exportBakedFloorGLB(floorFile, floorIndex, workingArchObjects);

        // Add baked GLB with "_baked" suffix before the extension
        const bakedFileName = floorFile.name.replace(/\.glb$/i, '_baked.glb');
        zip.file(bakedFileName, bakedBlob);
        log(`Added baked floor GLB: ${bakedFileName}`);
      }

      log(`Generated ${floorFiles.length} baked floor GLB models`);
    } catch (error) {
      console.error('Failed to generate baked floor GLBs:', error);
      // Continue with export even if baking fails
    }

    log('Modified ZIP built.');
    const blob = await zip.generateAsync({ type: 'blob' });
    return blob;
  }, [extractedFiles, modifiedFloorPlates, deletedFixturePositions, locationData, deletedFixtures, floorPlatesData, getFloorIndexMapping, remapLocationData, remapFloorPlatesData, remapFloorFileName, architecturalObjects, spawnPoints, floorNames, createStoreConfigJSON]);

  const handleDownloadModifiedZip = useCallback(async () => {
    if (isExportingZip) return;
    setIsExportingZip(true);
    try {
      let blob = await createModifiedZipBlob();

      // Migrate brand names in location-master.csv
      console.log('[3DViewerModifier] Starting brand migration for download...');
      const migrationResult = await migrateBrandsInZip(blob, '02');
      blob = migrationResult.zipBlob;
      if (migrationResult.migratedCount > 0) {
        console.log(`[3DViewerModifier] Successfully migrated ${migrationResult.migratedCount} brand names`);
      }

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

  const handleDownloadSpaceTracker = useCallback(() => {
    try {
      // Try to find the store data in multiple ways
      let selectedStore: StoreData | null = null;
      let identificationMethod = 'unknown';

      // 1. Try using saveStoreId (from saved store or user selection)
      if (saveStoreId && saveStoreId.trim()) {
        selectedStore = storeData.find(store => store.storeCode === saveStoreId.trim()) || null;
        if (selectedStore) {
          identificationMethod = zipPath ? 'saved store (zipPath)' : 'user selection (saveStoreId)';
        }
      }

      // 2. If not found, try to extract store code from jobId
      if (!selectedStore && jobId) {
        // JobId might contain store code (e.g., "STORE123-job-456")
        const storeCodeMatch = jobId.match(/^([A-Z0-9]+)-/i);
        if (storeCodeMatch) {
          const potentialStoreCode = storeCodeMatch[1];
          selectedStore = storeData.find(store =>
            store.storeCode.toUpperCase() === potentialStoreCode.toUpperCase()
          ) || null;
          if (selectedStore) {
            identificationMethod = 'jobId prefix match';
          }
        }

        // Also try matching entire jobId against store codes
        if (!selectedStore) {
          selectedStore = storeData.find(store =>
            jobId.toUpperCase().includes(store.storeCode.toUpperCase())
          ) || null;
          if (selectedStore) {
            identificationMethod = 'jobId contains storeCode';
          }
        }
      }

      // Log store identification result
      if (selectedStore) {
        console.log(`[Space Tracker] Store identified via: ${identificationMethod}`);
        console.log(`[Space Tracker] Store: ${selectedStore.storeCode} - ${selectedStore.storeName}`);
      } else if (storeData.length > 0) {
        console.warn('[Space Tracker] Store not found in store master data. Store-related columns will be empty.');
        console.warn('[Space Tracker] Attempted methods:', {
          saveStoreId: saveStoreId || 'not set',
          jobId: jobId || 'not set',
          zipPath: zipPath || 'not set',
        });
        console.warn('[Space Tracker] Available stores:', storeData.map(s => s.storeCode).join(', '));
      }

      // Generate Space Tracker data
      const trackerData = generateSpaceTrackerData(
        locationData,
        selectedStore,
        fixtureTypeMap.current,
        floorNames,
        deletedFixtures
      );

      // Convert to CSV
      const csvContent = spaceTrackerToCSV(trackerData);

      // Download the CSV
      const storeName = selectedStore?.storeName || saveStoreId || jobId || 'unknown';
      downloadSpaceTrackerCSV(csvContent, storeName);

      // Show warning if store data not found
      if (!selectedStore && storeData.length > 0) {
        alert('Note: Store information could not be found in the store master file. Store-related columns (zone, state, city, etc.) will be empty in the CSV.');
      }
    } catch (error) {
      console.error('Failed to generate Space Tracker CSV:', error);
      alert('Failed to generate Space Tracker CSV file');
    }
  }, [locationData, storeData, saveStoreId, jobId, zipPath, floorNames, deletedFixtures]);

  const handleSaveStore = useCallback(async () => {
    if (!saveStoreId.trim() || !saveStoreName.trim()) {
      alert('Please provide both Store ID and Store Name');
      return;
    }

    // Validate that the store ID exists in the master list
    if (!storeCodes.includes(saveStoreId.trim())) {
      alert('Invalid Store ID. Please select a valid store ID from the dropdown.');
      return;
    }

    try {
      setIsSavingStore(true);
      log('Save Store: building ZIP...');
      let blob = await createModifiedZipBlob();

      // Migrate brand names in location-master.csv
      console.log('[3DViewerModifier] Starting brand migration for save...');
      const migrationResult = await migrateBrandsInZip(blob, '02');
      blob = migrationResult.zipBlob;
      if (migrationResult.migratedCount > 0) {
        console.log(`[3DViewerModifier] Successfully migrated ${migrationResult.migratedCount} brand names`);
      }

      const size = blob.size;
      const ts = new Date();
      const dateStr = ts.toISOString().replace(/[:.]/g, '-');
      const jobIdPrefix = jobId ? `${jobId}-` : '';
      const fileName = `${jobIdPrefix}layout-${dateStr}.zip`;
      const path = `${saveStoreId}/${fileName}`;

      // Upload to storage
      await uploadStoreZip(path, blob);
      log('Save Store: uploaded to', path, 'size', size);

      // Find store metadata from master data
      // Insert DB record (metadata will be fetched from CSV when making store live)
      await insertStoreRecord({
        store_id: saveStoreId,
        store_name: saveStoreName,
        zip_path: path,
        zip_size: size,
        job_id: jobId,
        entity: saveEntity.toLowerCase(), // Ensure lowercase for API compatibility
      });

      setSaveDialogOpen(false);
      setSaveEntity('trends');
      setSaveStoreId('');
      setSaveStoreName('');
      alert('Store saved successfully');
    } catch (e: any) {
      console.error('Failed to save store:', e);
      alert(`Failed to save store: ${e?.message || e}`);
    } finally {
      setIsSavingStore(false);
    }
  }, [createModifiedZipBlob, jobId, saveStoreId, saveStoreName, storeCodes, saveEntity, uploadStoreZip, insertStoreRecord, storeData]);

  // Handle store selection and auto-populate store name and entity
  const handleStoreSelection = useCallback((selectedStoreCode: string) => {
    setSaveStoreId(selectedStoreCode);

    // Find the store data to auto-populate the store name and entity
    const selectedStore = storeData.find(store => store.storeCode === selectedStoreCode);
    if (selectedStore) {
      const displayName = selectedStore.nocName || selectedStore.sapName || selectedStore.storeName || '';
      setSaveStoreName(`${selectedStoreCode} - ${displayName}`);

      // Set entity from formatType, defaulting to 'trends' if not found
      // Normalize to lowercase for API compatibility
      const entity = (selectedStore.formatType || 'trends').toLowerCase();
      setSaveEntity(entity);
    } else {
      setSaveStoreName('');
      setSaveEntity('trends');
    }
  }, [storeData]);

  // Floor management handlers
  const handleDeleteFloor = useCallback((floorFile: ExtractedFile) => {
    // Remove floor file from extracted files and GLB files
    setExtractedFiles(prev => prev.filter(file => file.name !== floorFile.name));
    setGlbFiles(prev => prev.filter(file => file.name !== floorFile.name));

    // Extract floor number to remove associated fixtures and floor plates
    const floorMatch = floorFile.name.match(/floor[_-]?(\d+)/i) || floorFile.name.match(/(\d+)/i);
    const floorNumber = floorMatch ? parseInt(floorMatch[1]) : 0;

    // Remove from floor display order
    setFloorDisplayOrder(prev => prev.filter(idx => idx !== floorNumber));

    // Remove all fixtures on this floor
    setLocationData(prev => prev.filter(location => location.floorIndex !== floorNumber));

    // Remove floor plates data for this floor
    setFloorPlatesData(prev => {
      const newData = { ...prev };
      delete newData[floorNumber.toString()];
      return newData;
    });

    // Clear any modified floor plates for this floor
    setModifiedFloorPlates(prev => {
      const newMap = new Map(prev);
      const floorPlatesForFloor = floorPlatesData[floorNumber.toString()] || {};
      Object.values(floorPlatesForFloor).forEach(plates => {
        (plates as any[]).forEach(plate => {
          const key = plate.meshName || `${plate.surfaceId}-${plate.brand}`;
          newMap.delete(key);
        });
      });
      return newMap;
    });
  }, [floorPlatesData]);


  const handleMoveFloorUp = useCallback((floorFile: ExtractedFile) => {
    // Extract floor index from the file
    const floorMatch = floorFile.name.match(/floor[_-]?(\d+)/i) || floorFile.name.match(/(\d+)/i);
    const floorIndex = floorMatch ? parseInt(floorMatch[1]) : 0;

    // Find the position of this floor in the display order
    const displayPosition = floorDisplayOrder.indexOf(floorIndex);

    if (displayPosition <= 0) {
      return; // Already at the top or not found
    }

    // Swap with the floor above
    const newOrder = [...floorDisplayOrder];
    [newOrder[displayPosition - 1], newOrder[displayPosition]] =
      [newOrder[displayPosition], newOrder[displayPosition - 1]];

    setFloorDisplayOrder(newOrder);
  }, [floorDisplayOrder]);

  const handleMoveFloorDown = useCallback((floorFile: ExtractedFile) => {
    // Extract floor index from the file
    const floorMatch = floorFile.name.match(/floor[_-]?(\d+)/i) || floorFile.name.match(/(\d+)/i);
    const floorIndex = floorMatch ? parseInt(floorMatch[1]) : 0;

    // Find the position of this floor in the display order
    const displayPosition = floorDisplayOrder.indexOf(floorIndex);

    if (displayPosition < 0 || displayPosition >= floorDisplayOrder.length - 1) {
      return; // Already at the bottom or not found
    }

    // Swap with the floor below
    const newOrder = [...floorDisplayOrder];
    [newOrder[displayPosition], newOrder[displayPosition + 1]] =
      [newOrder[displayPosition + 1], newOrder[displayPosition]];

    setFloorDisplayOrder(newOrder);
  }, [floorDisplayOrder]);

  const handleRenameFloor = useCallback(async (floorFile: ExtractedFile, newName: string) => {
    // Create a new file name by replacing the title part while keeping the extension and floor number
    const floorMatch = floorFile.name.match(/floor[_-]?(\d+)/i);
    const floorNumber = floorMatch ? floorMatch[0] : 'floor-0';
    const floorIndex = floorMatch ? parseInt(floorMatch[1]) : 0;

    // Generate new file name: sanitize the new name and append floor number and extension
    const sanitizedName = newName.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '-');
    const newFileName = `${sanitizedName}-${floorNumber}.glb`;

    // Update the floor names map immediately
    setFloorNames(prev => {
      const updated = new Map(prev);
      updated.set(floorIndex, newName);
      return updated;
    });

    // Update store-config.json if it exists
    const storeConfigFile = extractedFiles.find(f => f.name.toLowerCase() === 'store-config.json');
    if (storeConfigFile) {
      try {
        const response = await fetch(storeConfigFile.url);
        const config = await response.json();

        if (config.floor && Array.isArray(config.floor)) {
          const floorEntry = config.floor.find((f: any) => f.floor_index === floorIndex);
          if (floorEntry) {
            floorEntry.name = newName;
            floorEntry.glb_file_name = newFileName;
          }
        }

        // Create new blob with updated config
        const updatedConfigBlob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const updatedConfigUrl = URL.createObjectURL(updatedConfigBlob);

        // Clean up old URL
        URL.revokeObjectURL(storeConfigFile.url);

        // Update the store-config.json file
        setExtractedFiles(prev => prev.map(f =>
          f.name.toLowerCase() === 'store-config.json'
            ? { ...f, blob: updatedConfigBlob, url: updatedConfigUrl }
            : f.name === floorFile.name
            ? { ...f, name: newFileName }
            : f
        ));
      } catch (error) {
        console.warn('Failed to update store-config.json:', error);
        // Still update the floor file name even if config update fails
        setExtractedFiles(prev => prev.map(file =>
          file.name === floorFile.name
            ? { ...file, name: newFileName }
            : file
        ));
      }
    } else {
      // No store-config.json, just update the floor file name
      setExtractedFiles(prev => prev.map(file =>
        file.name === floorFile.name
          ? { ...file, name: newFileName }
          : file
      ));
    }

    // Update the file in glbFiles
    setGlbFiles(prev => prev.map(file =>
      file.name === floorFile.name
        ? { ...file, name: newFileName }
        : file
    ));

    // Update selectedFile if it's the renamed file
    setSelectedFile(prev =>
      prev?.name === floorFile.name
        ? { ...prev, name: newFileName }
        : prev
    );

    // Update selectedFloorFile if it's the renamed file
    setSelectedFloorFile(prev =>
      prev?.name === floorFile.name
        ? { ...prev, name: newFileName }
        : prev
    );
  }, [extractedFiles]);


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

  const handleEditModeChange = useCallback((enabled: boolean) => {
    // Call the original function with the appropriate mode
    handleEditModeChangeOriginal(enabled ? 'fixtures' : 'off');
  }, []);

  const handleOrbitTargetUpdate = useCallback((newTarget: [number, number, number]) => {
    setCurrentOrbitTarget(prev => {
      // Only update if actually changed (avoid unnecessary re-renders)
      if (prev[0] === newTarget[0] && prev[1] === newTarget[1] && prev[2] === newTarget[2]) {
        return prev;
      }
      return newTarget;
    });
  }, []);

  const handleFloorPlateClick = useCallback((plateData: any) => {
    setSelectedFloorPlate(plateData);
  }, []);

  const handlePointerMissed = useCallback(() => {
    // Don't clear selection when:
    // - Adding objects
    // - Just created an object
    // - Currently transforming
    // - Mouse is/was down on transform controls
    // - Just finished transforming
    if (isAddingObject || justCreatedObjectRef.current || isTransforming || isMouseDownOnTransformRef.current || justFinishedTransformRef.current) return;

    if (editFloorplatesMode) {
      setSelectedFloorPlate(null);
    } else {
      setSelectedLocations([]);
      setSelectedLocation(null);
      setSelectedObject(null);
    }
  }, [isAddingObject, isTransforming, editFloorplatesMode, setSelectedLocations, setSelectedLocation]);

  // Clear selections when spawn point mode changes
  useEffect(() => {
    if (setSpawnPointMode) {
      // Clear fixture selections when entering spawn point mode
      setSelectedLocation(null);
      setSelectedLocations([]);
      setSelectedFloorPlate(null);
      setSelectedObject(null);
    }
  }, [setSpawnPointMode]);

  const handleEditModeChangeOriginal = useCallback((mode: 'off' | 'fixtures' | 'floorplates') => {
    if (mode === "off") {
      setEditMode(false);
      setEditFloorplatesMode(false);

      // Switch back to original floor
      const baseFile = selectedFloorFile || selectedFile;
      if (baseFile) {
        const floorMatch = baseFile.name.match(/floor[_-]?(\d+)/i) || baseFile.name.match(/(\d+)/i);
        const currentFloor = floorMatch ? floorMatch[1] : '0';
        const originalFloorFile = glbFiles.find(file =>
          isFloorFile(file.name) && file.name.match(/floor[_-]?(\d+)/i)?.[1] === currentFloor
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
          isFloorFile(file.name) && file.name.match(/floor[_-]?(\d+)/i)?.[1] === currentFloor
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

  const createModifiedLocationMasterCSV = async (
    zip: JSZip,
    deletedPositions: Set<string>,
    workingLocationData: LocationData[] = locationData,
    workingExtractedFiles: ExtractedFile[] = extractedFiles,
    floorMapping?: Map<number, number> | null
  ) => {

  // Find original location-master.csv (support hyphen/underscore variants)
    const originalFile = workingExtractedFiles.find(file => isLocationCsv(file.name));

    if (!originalFile) {
      console.warn('Original location-master.csv not found. Generating from current state.');
      const generated = generateLocationCSVFromState(workingLocationData);
      zip.file('location-master.csv', generated);
      return;
    }

    // Read original CSV content directly from blob (avoid URL caching issues)
    const csvText = await originalFile.blob.text();
    const lines = csvText.split(/\r?\n/); // Split by both CRLF and LF
    if (lines.length === 0) return;

    // Keep header, ensuring it has Fixture ID column (15th column)
    let headerLine = lines[0].trim(); // Trim to remove any trailing newlines
    const headerColumns = headerLine.split(',').map(col => col.trim()); // Trim each column
    console.log(`[createModifiedLocationMasterCSV] Original header columns: ${headerColumns.length}`, headerColumns);
    if (headerColumns.length < 15 || !headerColumns[14]) {
      // Add or replace the 15th column header with "Fixture ID"
      console.log(`[createModifiedLocationMasterCSV] Adding Fixture ID header (was ${headerColumns.length} columns)`);
      while (headerColumns.length < 14) {
        headerColumns.push('');
      }
      headerColumns[14] = 'Fixture ID';
      console.log('[createModifiedLocationMasterCSV] New header columns:', headerColumns);
    } else {
      console.log('[createModifiedLocationMasterCSV] Header already has Fixture ID:', headerColumns[14]);
    }
    headerLine = headerColumns.join(',');
    const modifiedLines = [headerLine];

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
    // ONLY include fixtures that should match to CSV rows (not duplicates, splits, or forDelete)
    const currentByOriginalKey = new Map<string, LocationData>();
    for (const loc of workingLocationData) {
      // Skip fixtures marked for deletion (split/type-change originals)
      if (loc.forDelete) continue;

      // Skip derived fixtures (duplicates and splits) - they go to the "add new fixtures" section
      if (loc.wasDuplicated || loc.wasSplit) continue;

      const key = getLocationOriginalKey(loc);
      currentByOriginalKey.set(key, loc);
    }
    // Track processed fixtures to identify duplicates
    const originalFixtures = new Set<string>();
    let updated = 0; let notFoundKept = 0; let deletedCount = 0; let duplicatesAdded = 0; let deletedFloorCount = 0;
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
      let blockName, posX, posY, posZ, floorIndex;
      try {
        const clean = (val: string) => val.replace(/"/g, '').trim();
        blockName = clean(values[0]);
        values[0] = blockName;
        floorIndex = parseInt(clean(values[1] || '0'));
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

      // If floor mapping exists, check if this fixture's floor has been deleted
      if (floorMapping && !floorMapping.has(floorIndex)) {
        // This fixture is on a deleted floor, skip it
        deletedFloorCount++;
        continue;
      }

      // Find matching location by original CSV key (deterministic)
      const originalKey = buildOriginalCsvKey(blockName, posX, posY, posZ);
      let matchingLocation = currentByOriginalKey.get(originalKey);

      if (!matchingLocation) {
        // Check if this CSV row matches a forDelete fixture (split or type-changed original)
        // These fixtures should be removed from the CSV
        const forDeleteMatch = workingLocationData.find(loc => {
          if (!loc.forDelete) return false;
          const locOriginalKey = getLocationOriginalKey(loc);
          return locOriginalKey === originalKey;
        });

        if (forDeleteMatch) {
          // This CSV row represents a fixture that was split or type-changed
          // Skip it (don't include in export)
          deletedCount++;
          continue;
        }

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
        // Use current floor index (which includes any floor reordering)
        values[1] = currentLocationData.floorIndex.toString();  // Floor Index

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

        // Use current fixture ID (15th column)
        if (values.length > 14) {
          values[14] = currentLocationData.fixtureId || '';
        } else {
          values.push(currentLocationData.fixtureId || '');
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
    
    // Add any duplicated/split/type-changed fixtures that weren't in the original CSV
    workingLocationData.forEach(location => {
      // Skip fixtures marked for deletion
      if (location.forDelete) return;

      const originalLocationKey = getLocationOriginalKey(location);

      // Add fixture if:
      // 1. It's a duplicate/split (these are new fixtures even if original position matches CSV)
      // 2. OR it wasn't in the original CSV (by original UID)
      const isDerivedFixture = location.wasDuplicated || location.wasSplit;
      const wasNotInOriginalCSV = !originalFixtures.has(originalLocationKey);

      if (isDerivedFixture || wasNotInOriginalCSV) {
        // Create CSV line for new fixture using correct 15-column structure
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
          location.hierarchy.toString(), // 13: Hierarchy
          location.fixtureId || ''       // 14: Fixture ID
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
    log('Location CSV summary:', { updated, notFoundKept, deleted: deletedCount, deletedFloorCount, duplicatesAdded, outLines: modifiedLines.length });
  };

  const generateLocationCSVFromState = (data: LocationData[] = locationData) => {
    const header = 'Block Name,Floor Index,Origin X (m),Origin Y (m),Origin Z (m),Pos X (m),Pos Y (m),Pos Z (m),Rotation X (deg),Rotation Y (deg),Rotation Z (deg),Brand,Count,Hierarchy,Fixture ID';
    const rows = data.map(loc => [
      loc.blockName,
      loc.floorIndex,
      Number((loc.originX ?? 0).toFixed(12)),
      Number((loc.originY ?? 0).toFixed(12)),
      0, // Origin Z is always 0
      Number(loc.posX.toFixed(12)),
      Number(loc.posY.toFixed(12)),
      Number(loc.posZ.toFixed(1)),
      Number(loc.rotationX.toFixed(1)),
      Number(loc.rotationY.toFixed(1)),
      Number(loc.rotationZ.toFixed(1)),
      loc.brand,
      loc.count,
      loc.hierarchy,
      loc.fixtureId || '' // Fixture ID (15th column)
    ].join(','));
    const csv = [header, ...rows].join('\n');
    log('Generated CSV from state. Rows:', rows.length);
    return csv;
  };

  const createModifiedFloorPlatesCSV = async (
    zip: JSZip,
    workingExtractedFiles: ExtractedFile[] = extractedFiles,
    floorMapping?: Map<number, number> | null
  ) => {
    // Find original floor plates CSV
    const originalFile = workingExtractedFiles.find(file => isFloorPlatesCsv(file.name));

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

      // Try to update floor index and brand
      try {
        // Handle floor index remapping if floor mapping exists
        if (floorMapping) {
          const oldFloorIndex = parseInt(values[0]);
          const newFloorIndex = floorMapping.get(oldFloorIndex);

          if (newFloorIndex !== undefined) {
            // Remap the floor index
            values[0] = newFloorIndex.toString();
          } else {
            // This floor was deleted, skip this row
            continue;
          }
        }

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
    log('Floor plates CSV summary:', { totalLines: modifiedLines.length, floorMappingApplied: !!floorMapping });
  };

  // Log summary of failed GLBs once
  useEffect(() => {
    if (failedGLBs.size > 0) {
      console.warn(`Failed to load ${failedGLBs.size} GLB fixture(s):`, Array.from(failedGLBs));
    }
  }, [failedGLBs]);

  // Helper function to select the floor with the lowest floor number
  const selectLowestFloorFile = (floorFiles: ExtractedFile[]) => {
    if (floorFiles.length === 0) return null;

    // Sort by floor number and pick the lowest
    const sortedFloors = [...floorFiles].sort((a, b) => {
      const aMatch = a.name.match(/floor[_-]?(\d+)/i) || a.name.match(/(\d+)/i);
      const bMatch = b.name.match(/floor[_-]?(\d+)/i) || b.name.match(/(\d+)/i);
      const aNum = aMatch ? parseInt(aMatch[1]) : 999;
      const bNum = bMatch ? parseInt(bMatch[1]) : 999;
      return aNum - bNum;
    });

    return sortedFloors[0];
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Please upload a ZIP file');
      return;
    }

    setExtracting(true);
    setFixturesLoaded(false);
    setError(null);

    try {
      const files = await extractZipFiles(file);
      setExtractedFiles(files);

      // Filter GLB files - include both original floor files and shattered floor plates for switching
      const glbFiles = files.filter(file =>
        file.name.toLowerCase().endsWith('.glb') &&
        (isFloorFile(file.name) ||
         isShatteredFloorPlateFile(file.name) ||
         !file.name.includes('floor'))
      );
      setGlbFiles(glbFiles);

      // Select floor with lowest floor number by default (not shattered)
      const originalFloorFiles = glbFiles.filter(file => !isShatteredFloorPlateFile(file.name));
      const lowestFloor = selectLowestFloorFile(originalFloorFiles);
      if (lowestFloor) {
        setSelectedFile(lowestFloor);
        setSelectedFloorFile(lowestFloor); // Initialize dropdown state
      }
    } catch (err) {
      console.error('Failed to extract zip file:', err);
      setError('Failed to extract ZIP file');
    } finally {
      setExtracting(false);
      setLoading(false);
    }
  };

  // Drag and drop handlers for file upload
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      handleFileUpload(file);
    }
  };

  useEffect(() => {
    const fetchJobZip = async () => {
      if (isUnmountingRef.current) return; // Skip if unmounting
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
        setFixturesLoaded(false);
        const zipBlob = await apiService.fetchJobFilesAsZip(jobData.job_id);
        const extracted = await extractZipFiles(zipBlob);

        setExtractedFiles(extracted);

        const glbFiles = extracted.filter(file =>
          file.type === '3d-model' &&
          (isFloorFile(file.name) ||
           isShatteredFloorPlateFile(file.name) ||
           !file.name.includes('floor'))
        );
        setGlbFiles(glbFiles);

        const originalFloorFiles = glbFiles.filter(file => !isShatteredFloorPlateFile(file.name));
        const lowestFloor = selectLowestFloorFile(originalFloorFiles);
        if (lowestFloor) {
          setSelectedFile(lowestFloor);
          setSelectedFloorFile(lowestFloor);
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
      if (isUnmountingRef.current) return; // Skip if unmounting
      if (!zipUrl) return;
      try {
        setLoading(true);
        setExtracting(true);
        setFixturesLoaded(false);
        const resp = await fetch(zipUrl);
        if (!resp.ok) throw new Error(`Failed to fetch ZIP (${resp.status})`);
        const zipBlob = await resp.blob();
        const extracted = await extractZipFiles(zipBlob);
        setExtractedFiles(extracted);

        const glbFiles = extracted.filter(file =>
          file.type === '3d-model' &&
          (isFloorFile(file.name) ||
           isShatteredFloorPlateFile(file.name) ||
           !file.name.includes('floor'))
        );
        setGlbFiles(glbFiles);

        const originalFloorFiles = glbFiles.filter(file => !isShatteredFloorPlateFile(file.name));
        const lowestFloor = selectLowestFloorFile(originalFloorFiles);
        if (lowestFloor) {
          setSelectedFile(lowestFloor);
          setSelectedFloorFile(lowestFloor);
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
      if (isUnmountingRef.current) return; // Skip if unmounting
      if (!zipPath) return;
      try {
        setLoading(true);
        setExtracting(true);
        setFixturesLoaded(false);

        // Query store_saves table to get store_id and store_name
        console.log('[3DViewerModifier] Querying store_saves for zipPath:', zipPath);
        const { data: storeRecords, error: queryError } = await supabase
          .from('store_saves')
          .select('store_id, store_name, entity')
          .eq('zip_path', zipPath)
          .limit(1);

        if (queryError) {
          console.warn('[3DViewerModifier] Failed to query store_saves:', queryError);
        } else if (storeRecords && storeRecords.length > 0) {
          const record = storeRecords[0];
          console.log('[3DViewerModifier] Found store record:', record.store_id, record.store_name);
          setSaveStoreId(record.store_id || '');
          setSaveStoreName(record.store_name || '');
          if (record.entity) {
            setSaveEntity(record.entity);
          }
        } else {
          console.warn('[3DViewerModifier] No store record found for zipPath:', zipPath);
        }

        const bucket = bucketParam || DEFAULT_BUCKET;
        const blob = await downloadZip(zipPath, bucket);
        const extracted = await extractZipFiles(blob);
        setExtractedFiles(extracted);

        const glbFiles = extracted.filter(file =>
          file.type === '3d-model' &&
          (isFloorFile(file.name) ||
           isShatteredFloorPlateFile(file.name) ||
           !file.name.includes('floor'))
        );
        setGlbFiles(glbFiles);

        const originalFloorFiles = glbFiles.filter(file => !isShatteredFloorPlateFile(file.name));
        const lowestFloor = selectLowestFloorFile(originalFloorFiles);
        if (lowestFloor) {
          setSelectedFile(lowestFloor);
          setSelectedFloorFile(lowestFloor);
        }
      } catch (err) {
        console.error('Failed to load zip from Supabase:', err);
        setError('Failed to load ZIP from saved store.');
        setLoading(false);
        setExtracting(false);
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
      // Skip cleanup during unmount to prevent blocking navigation
      // Memory will be reclaimed when page is fully unloaded
    };
  }, [jobId, zipUrl, zipPath]);

  // Track unmounting state and clear store name on unmount
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true; // Stop all effects immediately
      setStoreName(null); // Clear store name when leaving the page
    };
  }, [setStoreName]);

  // Update store name in navbar when it changes
  useEffect(() => {
    setStoreName(saveStoreName || null);
  }, [saveStoreName, setStoreName]);

  // Fetch brand categories from API
  useEffect(() => {
    const fetchBrandCategories = async () => {
      if (isUnmountingRef.current) return; // Skip if unmounting
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
      if (isUnmountingRef.current) return; // Skip if unmounting
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

  // Load store master data
  useEffect(() => {
    const loadStores = async () => {
      if (isUnmountingRef.current) return; // Skip if unmounting
      setIsLoadingStores(true);
      try {
        const stores = await loadStoreMasterData();
        setStoreData(stores);
        const codes = getUniqueStoreCodes(stores);
        setStoreCodes(codes);
      } catch (error) {
        console.error('Failed to load store master data:', error);
      } finally {
        setIsLoadingStores(false);
      }
    };

    loadStores();
  }, []); // Only run once on component mount

  // Initialize floor display order and extract floor names from store-config.json
  useEffect(() => {
    if (glbFiles.length > 0) {
      // Extract floor numbers from GLB files
      const floorFiles = glbFiles.filter(file => !file.name.includes('dg2n-shattered-floor-plates-'));
      const floorIndices = floorFiles.map(file => {
        const match = file.name.match(/floor[_-]?(\d+)/i) || file.name.match(/(\d+)/i);
        return match ? parseInt(match[1]) : 0;
      }).sort((a, b) => a - b);

      // Only initialize if not yet set or if floor count changed (floor added/removed)
      if (floorDisplayOrder.length === 0 || floorDisplayOrder.length !== floorIndices.length) {
        setFloorDisplayOrder(floorIndices);

        // Set initial floor count only on first initialization (when it's 0)
        if (initialFloorCount === 0 && floorIndices.length > 0) {
          setInitialFloorCount(floorIndices.length);
        }
      }

      // Extract floor names and spawn points from store-config.json or from file names
      // Only run once on initial load to avoid overwriting manual changes
      if (!floorNamesInitializedRef.current) {
        const extractFloorNames = async () => {
          if (isUnmountingRef.current) return; // Skip if unmounting
          const namesMap = new Map<number, string>();
          const spawnPointsMap = new Map<number, [number, number, number]>();

          // Check if store-config.json exists
          const storeConfigFile = extractedFiles.find(file =>
            file.name.toLowerCase() === 'store-config.json'
          );

          if (storeConfigFile) {
            try {
              const response = await fetch(storeConfigFile.url);
              const config = await response.json();

              if (config.floor && Array.isArray(config.floor)) {
                config.floor.forEach((floor: any) => {
                  if (floor.floor_index !== undefined && floor.name) {
                    // If floor name is "dg2n-3d", extract from glb_file_name or use default
                    if (floor.name.toLowerCase() === 'dg2n-3d') {
                      if (floor.glb_file_name && floor.glb_file_name.toLowerCase().startsWith('dg2n-3d-')) {
                        // Extract the part after "dg2n-3d-" and remove .glb extension
                        const extractedName = floor.glb_file_name.substring(8).replace('.glb', '');
                        namesMap.set(floor.floor_index, extractedName);
                      } else {
                        // Default to floor-{index} format
                        namesMap.set(floor.floor_index, `floor-${floor.floor_index}`);
                      }
                    } else {
                      namesMap.set(floor.floor_index, floor.name);
                    }
                  }

                  // Extract spawn point if it exists
                  if (floor.floor_index !== undefined && floor.spawn_point && Array.isArray(floor.spawn_point)) {
                    spawnPointsMap.set(floor.floor_index, floor.spawn_point as [number, number, number]);
                  }
                });
              }
            } catch (error) {
              console.warn('Failed to parse store-config.json for floor names and spawn points:', error);
            }
          }

          // Load architectural elements from arch-objects.json
          const archObjectsFile = extractedFiles.find(file =>
            file.name.toLowerCase() === 'arch-objects.json'
          );

          if (archObjectsFile) {
            // Load from arch-objects.json (new format)
            try {
              const response = await fetch(archObjectsFile.url);
              const archObjects = await response.json();

              if (Array.isArray(archObjects)) {
                console.log(`[3DViewerModifier] Loading ${archObjects.length} architectural elements from arch-objects.json`);

                let elements = archObjects as ArchitecturalObject[];

                // First, assign default variants to doors that don't have them
                elements = elements.map(obj => {
                  if ((obj.type === 'entrance_door' || obj.type === 'exit_door') && !obj.variant) {
                    const defaultBlockName = obj.type === 'entrance_door'
                      ? '1500 DOUBLE GLAZING 2'
                      : 'FIRE EXIT';
                    console.log(`[3DViewerModifier] Assigning default variant to ${obj.type}: ${defaultBlockName}`);
                    return {
                      ...obj,
                      variant: defaultBlockName
                    };
                  }
                  return obj;
                });

                // Check if any doors are missing GLB URLs
                const doorsNeedingGlb = elements.filter(obj =>
                  (obj.type === 'entrance_door' || obj.type === 'exit_door') &&
                  !obj.customProperties?.glbUrl &&
                  obj.variant // Now all doors should have variants
                );

                if (doorsNeedingGlb.length > 0) {
                  console.log(`[3DViewerModifier] ${doorsNeedingGlb.length} doors missing GLB URLs, fetching from backend...`);

                  // Get unique block names from doors
                  const blockNames = [...new Set(doorsNeedingGlb.map(obj => obj.variant!))];

                  // Fetch GLB URLs
                  loadFixtureGLBs(blockNames).then(glbUrlMap => {
                    console.log(`[3DViewerModifier] Received GLB URLs for block names:`, Array.from(glbUrlMap.keys()));

                    // Update doors with GLB URLs
                    const updatedElements = elements.map(obj => {
                      if ((obj.type === 'entrance_door' || obj.type === 'exit_door') &&
                          obj.variant &&
                          !obj.customProperties?.glbUrl) {
                        const glbUrl = glbUrlMap.get(obj.variant);
                        if (glbUrl) {
                          console.log(`[3DViewerModifier] Adding GLB URL for door ${obj.id} (${obj.variant}): ${glbUrl}`);
                          return {
                            ...obj,
                            customProperties: {
                              ...obj.customProperties,
                              glbUrl: glbUrl
                            }
                          };
                        } else {
                          console.warn(`[3DViewerModifier] No GLB URL found for door variant: ${obj.variant}`);
                        }
                      }
                      return obj;
                    });

                    console.log(`[3DViewerModifier] Updated architectural objects:`, updatedElements.map(obj => ({
                      id: obj.id,
                      type: obj.type,
                      variant: obj.variant,
                      hasGlbUrl: !!obj.customProperties?.glbUrl
                    })));

                    setArchitecturalObjects(updatedElements);
                  }).catch(err => {
                    console.error('[3DViewerModifier] Failed to fetch GLB URLs for doors:', err);
                    setArchitecturalObjects(elements);
                  });
                } else {
                  setArchitecturalObjects(elements);
                }
              }
            } catch (error) {
              console.warn('Failed to parse arch-objects.json:', error);
            }
          }

          // For floors without names in store-config, use filename-based names
          floorFiles.forEach(file => {
            const match = file.name.match(/floor[_-]?(\d+)/i);
            const floorIndex = match ? parseInt(match[1]) : 0;

            if (!namesMap.has(floorIndex)) {
              // Extract floor name from filename as fallback
              if (file.name.toLowerCase().startsWith('dg2n-3d-')) {
                namesMap.set(floorIndex, file.name.substring(8).replace('.glb', ''));
              } else {
                const nameMatch = file.name.match(/^(.+?)[-_]floor/i);
                const defaultName = nameMatch ? nameMatch[1] : `Floor ${floorIndex}`;
                namesMap.set(floorIndex, defaultName);
              }
            }
          });

          setFloorNames(namesMap);

          // Set spawn points if any were found in store-config.json
          if (spawnPointsMap.size > 0) {
            console.log('[3DViewerModifier] Loading spawn points from store-config.json:', spawnPointsMap);
            setSpawnPoints(spawnPointsMap);
          }

          floorNamesInitializedRef.current = true;
        };

        extractFloorNames();
      }
    }
  }, [glbFiles, extractedFiles, initialFloorCount]);

  // Extract unique brands from location data for current floor
  useEffect(() => {
    if (locationData.length > 0 && (selectedFloorFile || selectedFile)) {
      // Extract floor index from the selected floor file
      const fileForFloorExtraction = selectedFloorFile || selectedFile;
      const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
      const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

      // Get unique brands for the current floor, excluding deleted and forDelete fixtures
      const floorBrands = new Set<string>();
      locationData
        .filter(location => location.floorIndex === currentFloor)
        .filter(location => {
          // Exclude forDelete fixtures
          if (location.forDelete) return false;

          // Exclude deleted fixtures
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
    const abortController = new AbortController();

    const loadLocationData = async () => {
      if (isUnmountingRef.current) return; // Skip if unmounting
      if (extractedFiles.length === 0) {
        // No extracted files yet - set fixtures loaded to unblock UI
        setFixturesLoaded(true);
        return;
      }

      try {
        // Find the location-master.csv file in extracted files
        const csvFile = extractedFiles.find(file => isLocationCsv(file.name));

        if (!csvFile) {
          console.warn('location-master.csv not found in extracted files');
          console.log('Available files:', extractedFiles.map(f => f.name));
          setFixturesLoaded(true); // Unblock UI even without CSV
          return;
        }

        // Verify the CSV file URL is valid
        if (!csvFile.url || csvFile.url === '') {
          console.warn('Invalid CSV file URL');
          setFixturesLoaded(true); // Unblock UI even with invalid URL
          return;
        }

        const response = await fetch(csvFile.url, { signal: abortController.signal });
        if (!response.ok) {
          console.warn(`Failed to fetch CSV file: ${response.status} ${response.statusText}`);
          setFixturesLoaded(true); // Unblock UI even with failed fetch
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
            const originX = parseFloat(values[2]) || 0;
            const originY = parseFloat(values[3]) || 0;
            const posX = parseFloat(values[5]) || 0;
            const posY = parseFloat(values[6]) || 0;
            const posZ = parseFloat(values[7]) || 0;
            const rotationX = parseFloat(values[8]) || 0;
            const rotationY = parseFloat(values[9]) || 0;
            const rotationZ = parseFloat(values[10]) || 0;
            const brand = values[11]?.trim() || 'unknown';
            const count = parseInt(values[12]) || 1;
            const hierarchy = parseInt(values[13]) || 0;
            const fixtureId = values[14]?.trim() || undefined; // Fixture ID (optional, 15th column)

            const locationItem = {
              // Current state
              blockName,
              floorIndex: parseInt(values[1]) || 0,
              originX,
              originY,
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
              fixtureId, // Fixture ID from CSV

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
              originalFixtureId: fixtureId,

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

        // Load GLB URLs for ALL fixtures first (including doors)
        const blockNames = data
          .filter(location => location.blockName && location.blockName.trim() !== '')
          .map(location => location.blockName);

        let glbUrlMap = new Map<string, string>();
        if (blockNames.length > 0) {
          glbUrlMap = await loadFixtureGLBs(blockNames);
        }

        // Apply GLB URLs to all data
        const dataWithGLBs = data.map(location => {
          if (location.blockName && glbUrlMap.has(location.blockName)) {
            return { ...location, glbUrl: glbUrlMap.get(location.blockName) };
          }
          return location;
        });

        // NOW migrate doors from fixtures to architectural elements (with GLB URLs)
        const migratedDoors: ArchitecturalObject[] = [];
        const nonDoorFixtures: LocationData[] = [];

        dataWithGLBs.forEach(location => {
          const doorCheck = isDoorBlockName(location.blockName);
          if (doorCheck.isDoor && doorCheck.type) {
            // Convert to architectural door element (now has glbUrl)
            const doorElement = convertFixtureToDoor(location, doorCheck.type);
            migratedDoors.push(doorElement);
            console.log(`[Migration] Converted ${location.blockName} to ${doorCheck.type} at floor ${location.floorIndex}`, location.glbUrl ? '(with GLB)' : '(no GLB)');
          } else {
            // Keep as regular fixture
            nonDoorFixtures.push(location);
          }
        });

        if (migratedDoors.length > 0) {
          console.log(`[Migration] Successfully migrated ${migratedDoors.length} doors to architectural elements`);
        }

        // Use non-door fixtures for final data
        const finalDataWithGLBs = nonDoorFixtures;

        if (isUnmountingRef.current) return; // Skip setState if unmounting

        // Preserve any modified fixtures when setting new location data
        setLocationData(prev => {
          // If we already have location data, preserve all modifications
          // Only reload from CSV if we have no previous data
          if (prev.length > 0) {
            // Don't reload - this prevents losing modifications when cache/typeMap updates
            // Just update GLB URLs for any fixtures that need them
            return prev.map(location => {
              if (!location.glbUrl && location.blockName && glbUrlMap.has(location.blockName)) {
                return { ...location, glbUrl: glbUrlMap.get(location.blockName) };
              }
              return location;
            });
          }

          // First time loading: use CSV data (without doors)
          const newData = [...finalDataWithGLBs];
          return newData;
        });

        // Add migrated doors to architectural objects (only on first load)
        if (migratedDoors.length > 0) {
          setArchitecturalObjects(prev => {
            // Only add migrated doors if we don't already have them
            if (prev.length === 0) {
              return migratedDoors;
            }
            // If we already have architectural objects, preserve them
            return prev;
          });
        }

        if (isUnmountingRef.current) return; // Skip setState if unmounting

        // Mark fixtures as loaded after location data is set
        setFixturesLoaded(true);

      } catch (err) {
        // Ignore AbortError - it's expected when component unmounts
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to load location data:', err);
        // Set empty location data so the component continues to work
        setLocationData([]);
        // Mark as loaded even on error to unblock UI
        setFixturesLoaded(true);
      }
    };

    const loadFloorPlatesData = async () => {
      if (isUnmountingRef.current) return; // Skip if unmounting
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

        const response = await fetch(csvFile.url, { signal: abortController.signal });
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

        if (!isUnmountingRef.current) {
          setFloorPlatesData(floorData);
        }

      } catch (err) {
        // Ignore AbortError - it's expected when component unmounts
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to load floor plates data:', err);
        // Set empty floor plates data so the component continues to work
        setFloorPlatesData({});
      }
    };

    loadLocationData();
    loadFloorPlatesData();

    // Cleanup: abort pending fetch requests
    return () => {
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedFiles]);

  if (loading || extracting || !fixturesLoaded) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">
            {extracting ? 'Extracting files from ZIP...' : 'Loading fixtures...'}
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
          
          <div
            className={`border-2 border-dashed rounded-lg p-8 mb-4 transition-colors cursor-pointer ${
              isDragging
                ? 'border-primary bg-primary/10'
                : 'border-muted hover:border-primary/50'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
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
              <div className="text-sm font-medium">
                {isDragging ? 'Drop ZIP file here' : 'Click to upload ZIP file'}
              </div>
              <div className="text-xs text-muted-foreground">
                {isDragging ? 'Release to upload' : 'Or drag and drop'}
              </div>
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
    <div className="flex flex-col" style={{ height: 'calc(100vh - 6rem)' }}>
      {/* 3D Canvas */}
      <div className="flex-1 relative pointer-events-auto">
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
          setSpawnPointMode={setSpawnPointMode}
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
          floorDisplayOrder={floorDisplayOrder}
          initialFloorCount={initialFloorCount}
          architecturalObjectsCount={architecturalObjects.length}
          spawnPoints={spawnPoints}
          isMeasuring={isMeasuring}
          measurementPoints={measurementPoints}
          cameraMode={cameraMode}
          onCameraModeChange={handleCameraModeChange}
          onSwitchToTopView={handleSwitchToTopView}
          onMeasuringChange={setIsMeasuring}
          onClearMeasurement={handleClearMeasurement}
          onFloorFileChange={handleFloorFileChange}
          onShowSpheresChange={setShowSpheres}
          onFixtureTypeChange={setSelectedFixtureType}
          onBrandChange={setSelectedBrand}
          onShowWireframeChange={setShowWireframe}
          onShowFixtureLabelsChange={setShowFixtureLabels}
          onShowWallsChange={setShowWalls}
          onEditModeChange={handleEditModeChange}
          onSetSpawnPointModeChange={setSetSpawnPointMode}
          onTransformSpaceChange={setTransformSpace}
          onDownloadGLB={handleDownloadGLB}
          onDownloadModifiedZip={handleDownloadModifiedZip}
          onDownloadSpaceTracker={handleDownloadSpaceTracker}
          onSaveStoreClick={() => setSaveDialogOpen(true)}
          onManageFloorsClick={() => setFloorManagementModalOpen(true)}
          onAddFixtureClick={() => {
            setIsAddingFixture(true);
            setAddFixtureModalOpen(true);
          }}
          onAddObjectsClick={() => setAddObjectModalOpen(true)}
        />
        <Canvas3D
          cameraPosition={cameraPosition}
          orbitTarget={orbitTarget}
          cameraMode={cameraMode}
          orthoZoom={orthoZoom}
          selectedFile={selectedFile}
          selectedFloorFile={selectedFloorFile}
          locationData={locationData}
          showSpheres={showSpheres}
          editFloorplatesMode={editFloorplatesMode}
          selectedFixtureType={selectedFixtureType}
          selectedBrand={selectedBrand}
          fixtureTypeMap={fixtureTypeMap.current}
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
          architecturalObjects={architecturalObjects}
          isAddingObject={isAddingObject}
          currentObjectType={currentObjectType}
          objectPlacementPoint={objectPlacementPoint}
          selectedObject={selectedObject}
          onFloorClickForObjectPlacement={handleFloorClickForObjectPlacement}
          onObjectClick={handleObjectClick}
          onObjectPositionChange={handleObjectPositionChange}
          setSpawnPointMode={setSpawnPointMode}
          spawnPoints={spawnPoints}
          onFloorClickForSpawnPoint={handleFloorClickForSpawnPoint}
          isMeasuring={isMeasuring}
          measurementPoints={measurementPoints}
          onFloorClickForMeasurement={handleFloorClickForMeasurement}
          onBoundsCalculated={handleBoundsCalculated}
          onGLBError={handleGLBError}
          onFixtureClick={handleFixtureClickWithObjectClear}
          isLocationSelected={isLocationSelected}
          onPositionChange={handlePositionChange}
          onMultiPositionChange={handleMultiPositionChange}
          onFloorPlateClick={handleFloorPlateClick}
          onPointerMissed={handlePointerMissed}
          setIsTransforming={handleSetIsTransforming}
          onOrbitTargetUpdate={handleOrbitTargetUpdate}
        />
        
        {/* Show MultiRightInfoPanel when multiple fixtures are selected */}
        {selectedLocations.length > 1 && !editFloorplatesMode && (
          <MultiRightInfoPanel
            selectedLocations={selectedLocations}
            editMode={editMode}
            fixtureTypeMap={fixtureTypeMap.current}
            transformSpace={transformSpace}
            onClose={clearSelections}
            onOpenBrandModal={() => setBrandModalOpen(true)}
            onRotateFixture={handleMultiRotateFixture}
            onResetLocation={handleResetPosition}
            onResetMultiple={handleResetMultiplePositions}
            onDeleteFixtures={handleDeleteFixtures}
            onMergeFixtures={handleMergeFixtures}
            canMergeFixtures={canMergeFixtures}
            onCountChange={handleFixtureCountChangeMulti}
            onHierarchyChange={handleFixtureHierarchyChangeMulti}
            availableFloorIndices={availableFloorIndices}
            floorNames={floorNames}
            floorDisplayOrder={floorDisplayOrder}
            onAlignFixtures={handleAlignFixtures}
            onFloorChange={(locations, newFloorIndex, keepSamePosition = false) => {
              // Update floor index, origin values, and position for all selected locations
              const keys = locations.map(loc => generateFixtureUID(loc));

              // Find the origin values for the target floor BEFORE updating state
              const targetFloorFixture = locationData.find(loc => loc.floorIndex === newFloorIndex && !loc.forDelete);
              const newOriginX = targetFloorFixture?.originX ?? 0;
              const newOriginY = targetFloorFixture?.originY ?? 0;

              setLocationData(prev => {
                return prev.map(loc => {
                  if (keys.includes(generateFixtureUID(loc))) {
                    // Get current origin values for this fixture
                    const currentOriginX = loc.originX ?? 0;
                    const currentOriginY = loc.originY ?? 0;

                    // Calculate the origin difference to adjust position
                    const originDiffX = keepSamePosition ? 0 : currentOriginX - newOriginX;
                    const originDiffY = keepSamePosition ? 0 : currentOriginY - newOriginY;

                    return {
                      ...loc,
                      floorIndex: newFloorIndex,
                      originX: newOriginX,
                      originY: newOriginY,
                      posX: loc.posX + originDiffX,
                      posY: loc.posY + originDiffY,
                      wasMoved: true,
                      originalPosX: loc.originalPosX ?? loc.posX,
                      originalPosY: loc.originalPosY ?? loc.posY,
                    };
                  }
                  return loc;
                });
              });

              // Update selected locations with the same values
              setSelectedLocations(prev => {
                return prev.map(loc => {
                  // Get current origin values for this fixture
                  const currentOriginX = loc.originX ?? 0;
                  const currentOriginY = loc.originY ?? 0;

                  // Calculate the origin difference to adjust position
                  const originDiffX = keepSamePosition ? 0 : currentOriginX - newOriginX;
                  const originDiffY = keepSamePosition ? 0 : currentOriginY - newOriginY;

                  return {
                    ...loc,
                    floorIndex: newFloorIndex,
                    originX: newOriginX,
                    originY: newOriginY,
                    posX: loc.posX + originDiffX,
                    posY: loc.posY + originDiffY,
                    wasMoved: true,
                    originalPosX: loc.originalPosX ?? loc.posX,
                    originalPosY: loc.originalPosY ?? loc.posY,
                  };
                });
              });
            }}
          />
        )}
        
        {/* Show ObjectInfoPanel when an architectural object is selected */}
        {selectedObject && (
          <ObjectInfoPanel
            selectedObject={selectedObject}
            editMode={editMode}
            onClose={() => setSelectedObject(null)}
            onRotate={handleObjectRotate}
            onHeightChange={handleObjectHeightChange}
            onPositionChange={handleObjectPointsChange}
            onSinglePointPositionChange={handleSinglePointPositionChange}
            onDelete={handleObjectDelete}
            onReset={handleObjectReset}
          />
        )}

        {/* Show RightInfoPanel for single selection or floor plates */}
        {selectedLocations.length <= 1 && !selectedObject && (
          <RightInfoPanel
            selectedLocation={selectedLocation}
            selectedFloorPlate={selectedFloorPlate}
            editMode={editMode}
            editFloorplatesMode={editFloorplatesMode}
            setSpawnPointMode={setSpawnPointMode}
            currentFloorIndex={(() => {
              const fileForFloorExtraction = selectedFloorFile || selectedFile;
              const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
              return floorMatch ? parseInt(floorMatch[1]) : 0;
            })()}
            spawnPoints={spawnPoints}
            modifiedFloorPlates={modifiedFloorPlates}
            fixtureTypeMap={fixtureTypeMap.current}
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
            availableFloorIndices={availableFloorIndices}
            floorNames={floorNames}
            floorDisplayOrder={floorDisplayOrder}
            onFloorChange={(location, newFloorIndex, keepSamePosition = false) => {
              // Update the location's floor index, origin values, and position
              const key = generateFixtureUID(location);

              // Get current origin values
              const currentOriginX = location.originX ?? 0;
              const currentOriginY = location.originY ?? 0;

              // Find the origin values for the target floor BEFORE updating state
              const targetFloorFixture = locationData.find(loc => loc.floorIndex === newFloorIndex && !loc.forDelete);
              const newOriginX = targetFloorFixture?.originX ?? 0;
              const newOriginY = targetFloorFixture?.originY ?? 0;

              // Calculate the origin difference to adjust position
              const originDiffX = keepSamePosition ? 0 : currentOriginX - newOriginX;
              const originDiffY = keepSamePosition ? 0 : currentOriginY - newOriginY;

              setLocationData(prev => {
                return prev.map(loc => {
                  if (generateFixtureUID(loc) === key) {
                    return {
                      ...loc,
                      floorIndex: newFloorIndex,
                      originX: newOriginX,
                      originY: newOriginY,
                      posX: loc.posX + originDiffX,
                      posY: loc.posY + originDiffY,
                      wasMoved: true,
                      originalPosX: loc.originalPosX ?? loc.posX,
                      originalPosY: loc.originalPosY ?? loc.posY,
                    };
                  }
                  return loc;
                });
              });

              // Update selected location with the same values
              setSelectedLocation(prev => {
                if (prev && generateFixtureUID(prev) === key) {
                  return {
                    ...prev,
                    floorIndex: newFloorIndex,
                    originX: newOriginX,
                    originY: newOriginY,
                    posX: prev.posX + originDiffX,
                    posY: prev.posY + originDiffY,
                    wasMoved: true,
                    originalPosX: prev.originalPosX ?? prev.posX,
                    originalPosY: prev.originalPosY ?? prev.posY,
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
      
      {/* Fixture Type Selection Modal - used for both changing and adding fixtures */}
      <FixtureTypeSelectionModal
        open={fixtureTypeModalOpen || addFixtureModalOpen}
        onOpenChange={(open) => {
          setFixtureTypeModalOpen(open);
          setAddFixtureModalOpen(open);
          if (!open) {
            setIsAddingFixture(false);
          }
        }}
        currentType={isAddingFixture ? '' : (selectedLocation ? (fixtureTypeMap.current.get(selectedLocation.blockName) || 'Unknown') : '')}
        availableTypes={fixtureTypes}
        onTypeSelect={(type) => {
          if (isAddingFixture) {
            handleAddFixture(type);
          } else {
            handleFixtureTypeChange(type);
          }
        }}
        isAddMode={isAddingFixture}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteConfirmationOpen}
        onOpenChange={setDeleteConfirmationOpen}
        fixtureCount={fixturesToDelete.length}
        onConfirmDelete={handleConfirmDelete}
      />

      {/* Floor Management Modal */}
      <FloorManagementModal
        open={floorManagementModalOpen}
        onOpenChange={setFloorManagementModalOpen}
        glbFiles={glbFiles}
        selectedFloorFile={selectedFloorFile}
        onFloorFileChange={handleFloorFileChange}
        onDeleteFloor={handleDeleteFloor}
        onMoveFloorUp={handleMoveFloorUp}
        onMoveFloorDown={handleMoveFloorDown}
        onRenameFloor={handleRenameFloor}
        floorDisplayOrder={floorDisplayOrder}
      />

      {/* Add Object Modal */}
      <AddObjectModal
        open={addObjectModalOpen}
        onOpenChange={setAddObjectModalOpen}
        onObjectSelect={handleObjectTypeSelect}
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
              <label className="text-sm font-medium">Entity</label>
              <select
                value={saveEntity}
                onChange={(e) => setSaveEntity(e.target.value)}
                className="w-full px-3 py-2 rounded border border-border bg-background"
              >
                <option value="trends">Trends</option>
                <option value="tst">TST</option>
                <option value="demo">Demo</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Store ID</label>
              {isLoadingStores ? (
                <div className="w-full px-3 py-2 rounded border border-border bg-background text-gray-500">
                  Loading stores...
                </div>
              ) : (
                <select
                  value={saveStoreId}
                  onChange={(e) => handleStoreSelection(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-border bg-background"
                >
                  <option value="">Select a Store ID</option>
                  {storeCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Store Name</label>
              <input
                type="text"
                value={saveStoreName}
                onChange={(e) => setSaveStoreName(e.target.value)}
                placeholder="Store name (auto-filled from store ID)"
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
                disabled={isSavingStore || extractedFiles.length === 0 || !saveStoreId.trim()}
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


