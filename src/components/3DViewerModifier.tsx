import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../contexts/StoreContext';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFExporter, GLTFLoader, DRACOLoader } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';
import { Button } from "@/shadcn/components/ui/button";
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiService, type JobStatus, type BrandCategoriesResponse, type FixtureVariant } from '../services/api';
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
import { useUndoRedo } from '../hooks/useUndoRedo';
import type { Command } from '../hooks/useUndoRedo';
import { ensureStableId, findFixtureById, updateFixtureById, findObjectById, updateObjectById } from '../hooks/fixtureHelpers';
import { useClipboard, transformFixturesForPaste, transformArchObjectsForPaste, type PasteOptions } from '../hooks/useClipboard';
import { usePasteValidation, type ValidationResult, type ValidationError } from '../hooks/usePasteValidation';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/shadcn/components/ui/dialog';
import { DEFAULT_BUCKET, useSupabaseService } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';
import { loadStoreMasterData, getUniqueStoreCodes, type StoreData } from '../utils/csvUtils';
import { generateSpaceTrackerData, spaceTrackerToCSV, downloadSpaceTrackerCSV } from '../utils/spaceTrackerUtils';
import { AddObjectModal } from './AddObjectModal';
import { VariantSelectionModal } from './VariantSelectionModal';
import { ObjectInfoPanel } from './ObjectInfoPanel';
import { MultiObjectInfoPanel } from './MultiObjectInfoPanel';
import { PasteConfirmationDialog } from './PasteConfirmationDialog';
import { ValidationErrorDialog } from './ValidationErrorDialog';
import { ClipboardNotification } from './ClipboardNotification';
import { migrateBrandsInZip } from '../utils/brandMigration';

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
  | 'door'
  | 'window'
  | 'column'
  | 'wall'
  | 'staircase'
  | 'toilet'
  | 'trial_room'
  | 'boh'
  | 'cash_till'
  | 'window_display';

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
  const [pipelineVersion, setPipelineVersion] = useState<string>('02');
  const [floorHeights, setFloorHeights] = useState<Map<number, string>>(new Map());
  const [fixtureStyle, setFixtureStyle] = useState<string>('2.0');
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
  const [, setCurrentOrbitTarget] = useState<[number, number, number]>([0, 0, 0]); // Kept for handleOrbitTargetUpdate callback
  const [cameraMode, setCameraMode] = useState<'perspective' | 'orthographic'>('perspective');
  const [orthoZoom] = useState<number>(50); // Orthographic zoom level
  const [failedGLBs, setFailedGLBs] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editFloorplatesMode, setEditFloorplatesMode] = useState(false);
  const [setSpawnPointMode, setSetSpawnPointMode] = useState(false);
  const [spawnPoints, setSpawnPoints] = useState<Map<number, [number, number, number]>>(new Map());

  // Hierarchy definition mode state
  const [hierarchyDefMode, setHierarchyDefMode] = useState(false);
  const [hierarchySequence, setHierarchySequence] = useState<LocationData[]>([]);
  const [hierarchyStartValue, setHierarchyStartValue] = useState<number>(1);
  const [isTransforming, setIsTransforming] = useState(false);
  const [floorPlatesData, setFloorPlatesData] = useState<Record<string, Record<string, any[]>>>({});
  const [selectedFloorFile, setSelectedFloorFile] = useState<ExtractedFile | null>(null); // The floor selected in dropdown
  const [selectedFloorPlate, setSelectedFloorPlate] = useState<any | null>(null); // Selected floor plate data
  const [showWireframe, setShowWireframe] = useState(false);

  const [showFixtureLabels, setShowFixtureLabels] = useState(false);
  const [showWalls, setShowWalls] = useState(true);
  const [showFixtureArea, setShowFixtureArea] = useState(false);
  const [transformSpace, setTransformSpace] = useState<'world' | 'local'>('local');
  const [isExporting, setIsExporting] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [fixtureTypeModalOpen, setFixtureTypeModalOpen] = useState(false);
  const [isMultiTypeEdit, setIsMultiTypeEdit] = useState(false);
  const [addFixtureModalOpen, setAddFixtureModalOpen] = useState(false);
  const [isAddingFixture, setIsAddingFixture] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveEntity, setSaveEntity] = useState('');
  const [saveStoreId, setSaveStoreId] = useState('');
  const [saveStoreName, setSaveStoreName] = useState('');
  const [brandCategories, setBrandCategories] = useState<BrandCategoriesResponse | null>(null);
  const fixtureCache = useRef<Map<string, string>>(new Map());
  const [fixtureTypes, setFixtureTypes] = useState<string[]>([]);
  const [selectedFixtureType, setSelectedFixtureType] = useState<string[]>(['all']);
  const fixtureTypeMap = useRef<Map<string, string>>(new Map());
  const [brands, setBrands] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string[]>(['all']);
  const [storeData, setStoreData] = useState<StoreData[]>([]);
  const [storeCodes, setStoreCodes] = useState<string[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const storeDropdownRef = useRef<HTMLDivElement>(null);
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
  // ID-based selection for architectural objects
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);

  // Variant selection for architectural objects
  const [archObjectVariantModalOpen, setArchObjectVariantModalOpen] = useState(false);
  const [pendingArchObjectType, setPendingArchObjectType] = useState<ArchitecturalObjectType | null>(null);

  // Variant selection for regular fixtures
  const [fixtureVariantModalOpen, setFixtureVariantModalOpen] = useState(false);
  const [pendingFixtureType, setPendingFixtureType] = useState<string | null>(null);

  // Measurement tool state
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurementPoints, setMeasurementPoints] = useState<[number, number, number][]>([]);
  const justCreatedObjectRef = useRef<boolean>(false); // Track if we just created an object
  const justFinishedTransformRef = useRef<boolean>(false); // Track if we just finished transforming
  const isMouseDownOnTransformRef = useRef<boolean>(false); // Track if mouse is down on transform controls
  const selectedVariantRef = useRef<{ block_name: string; glb_url: string } | null>(null); // Store selected variant for arch objects
  const pendingFixtureRef = useRef<{ blockName: string; glbUrl: string; fixtureType: string; variant?: string } | null>(null); // Store pending fixture data for click-to-place
  const [isDragging, setIsDragging] = useState(false); // Track drag state for file upload
  const floorNamesInitializedRef = useRef<boolean>(false); // Track if floor names have been extracted
  const isUnmountingRef = useRef(false); // Track unmounting state to prevent operations during unmount

  const { uploadStoreZip, insertStoreRecord, downloadZip } = useSupabaseService();

  // Use custom hooks for fixture selection and modifications
  const {
    selectedLocationId,
    selectedLocationIds,
    setSelectedLocationId,
    setSelectedLocationIds,
    handleFixtureClick,
    isLocationSelected,
    clearSelections: clearFixtureSelections,
  } = useFixtureSelection(editFloorplatesMode);

  // Derived selectedLocation / selectedLocations from ID-based state
  const selectedLocation = useMemo(
    () => locationData.find(loc => loc._stableId === selectedLocationId) ?? null,
    [locationData, selectedLocationId]
  );
  const selectedLocations = useMemo(
    () => locationData.filter(loc => selectedLocationIds.includes(loc._stableId)),
    [locationData, selectedLocationIds]
  );

  // Derived selectedObject / selectedObjects from ID-based state
  const selectedObject = useMemo(
    () => architecturalObjects.find(obj => obj.id === selectedObjectId) ?? null,
    [architecturalObjects, selectedObjectId]
  );
  const selectedObjects = useMemo(
    () => architecturalObjects.filter(obj => selectedObjectIds.includes(obj.id)),
    [architecturalObjects, selectedObjectIds]
  );

  // State refs — used by undo/redo commands to get current arrays without stale closures
  const locationDataRef = useRef<LocationData[]>(locationData);
  useEffect(() => { locationDataRef.current = locationData; }, [locationData]);
  const architecturalObjectsRef = useRef<ArchitecturalObject[]>(architecturalObjects);
  useEffect(() => { architecturalObjectsRef.current = architecturalObjects; }, [architecturalObjects]);

  // Undo/Redo
  const { executeCommand, handleUndo, handleRedo, canUndo, canRedo } = useUndoRedo();

  // Enhanced clear selections that also clears architectural objects
  const clearSelections = useCallback(() => {
    clearFixtureSelections();
    setSelectedObjectId(null);
    setSelectedObjectIds([]);
  }, [clearFixtureSelections]);

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
    setSelectedLocationId,
    setSelectedLocationIds,
    setLocationData,
    setSelectedFloorPlate,
    executeCommand,
    locationDataRef
  );

  // Clipboard hooks
  const {
    clipboardState,
    copyFixtures,
    copyArchObjects,
    getClipboardData,
    checkClipboard,
  } = useClipboard();

  // Clipboard-related state
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'warning' | 'error';
  } | null>(null);
  const [showPasteConfirmDialog, setShowPasteConfirmDialog] = useState(false);
  const [showValidationErrorDialog, setShowValidationErrorDialog] = useState(false);
  const [pasteValidationResult, setPasteValidationResult] = useState<ValidationResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Check clipboard on mount
  useEffect(() => {
    checkClipboard();
  }, [checkClipboard]);

  // Click handler wrapper for hierarchy definition mode
  const handleFixtureClickWrapper = useCallback((clickedLocation: LocationData, event?: any) => {
    if (hierarchyDefMode) {
      const clickedUID = generateFixtureUID(clickedLocation);
      const existingIndex = hierarchySequence.findIndex(
        loc => generateFixtureUID(loc) === clickedUID
      );

      if (existingIndex !== -1) {
        // Re-clicking: remove and add to end
        setHierarchySequence(prev => {
          const newSeq = [...prev];
          newSeq.splice(existingIndex, 1);
          newSeq.push(clickedLocation);
          return newSeq;
        });
      } else {
        // First click: add to sequence
        setHierarchySequence(prev => [...prev, clickedLocation]);
      }
      return;
    }

    // Normal selection logic
    handleFixtureClick(clickedLocation, event);
  }, [hierarchyDefMode, hierarchySequence, handleFixtureClick]);

  // Wrap handleFixtureClick to clear selected object when a fixture is clicked
  const handleFixtureClickWithObjectClear = useCallback((clickedLocation: LocationData, event?: any) => {
    // Don't process clicks if mouse was down on transform controls
    // This prevents accidental selection when clicking transform controls that overlap other fixtures
    if (isMouseDownOnTransformRef.current) {
      return;
    }

    setSelectedObjectId(null); // Clear selected architectural object
    setSelectedObjectIds([]); // Clear selected architectural objects array
    handleFixtureClickWrapper(clickedLocation, event);
  }, [handleFixtureClickWrapper]);

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

  // Get current floor index from selected floor file
  const currentFloor = useMemo(() => {
    const fileForFloorExtraction = selectedFloorFile || selectedFile;
    const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
    return floorMatch ? parseInt(floorMatch[1]) : 0;
  }, [selectedFloorFile, selectedFile]);

  // Paste validation hook (needs availableFloorIndices)
  const { validatePaste } = usePasteValidation(
    availableFloorIndices,
    brandCategories,
    fixtureTypeMap.current
  );

  // Copy/Paste handlers
  const showNotification = useCallback((message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 2500);
  }, []);

  const handleCopySelected = useCallback(() => {
    if (selectedObjects.length > 0) {
      // Copy multiple arch objects
      const success = copyArchObjects(selectedObjects, jobId || undefined);
      if (success) {
        showNotification(`${selectedObjects.length} architectural object${selectedObjects.length > 1 ? 's' : ''} copied`);
      }
    } else if (selectedObject) {
      // Copy single arch object
      const success = copyArchObjects([selectedObject], jobId || undefined);
      if (success) {
        showNotification('1 architectural object copied');
      }
    } else if (selectedLocations.length > 0) {
      // Copy multiple fixtures
      const success = copyFixtures(selectedLocations, jobId || undefined);
      if (success) {
        showNotification(`${selectedLocations.length} fixture${selectedLocations.length > 1 ? 's' : ''} copied`);
      }
    } else if (selectedLocation) {
      // Copy single fixture
      const success = copyFixtures([selectedLocation], jobId || undefined);
      if (success) {
        showNotification('1 fixture copied');
      }
    } else {
      showNotification('No items selected to copy', 'warning');
    }
  }, [selectedLocation, selectedLocations, selectedObject, selectedObjects, copyFixtures, copyArchObjects, jobId, showNotification]);

  const executePaste = useCallback((
    clipboardData: any,
    options: PasteOptions
  ) => {
    // Transform fixtures — assign _stableId at creation site
    const rawFixtures = transformFixturesForPaste(
      clipboardData.fixtures,
      options,
      locationData
    );
    const newFixtures = rawFixtures.map((f: LocationData) =>
      f._stableId ? f : { ...f, _stableId: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`) }
    );

    // Transform arch objects
    const newArchObjects = transformArchObjectsForPaste(
      clipboardData.architecturalObjects,
      options
    );

    const newFixtureStableIds = newFixtures.map((f: LocationData) => f._stableId);
    const newObjectIds = newArchObjects.map((o: ArchitecturalObject) => o.id);

    const pasteCmd: Command = {
      commandName: 'Paste',
      do() {
        setLocationData(prev => [...prev, ...newFixtures]);
        setArchitecturalObjects(prev => [...prev, ...newArchObjects]);

        // Select pasted items (mutually exclusive - prefer fixtures if both types pasted)
        if (newFixtureStableIds.length > 0) {
          setSelectedLocationIds(newFixtureStableIds);
          setSelectedLocationId(newFixtureStableIds[0]);
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
        } else if (newObjectIds.length > 0) {
          setSelectedObjectIds(newObjectIds);
          setSelectedObjectId(newObjectIds[0]);
          setSelectedLocationId(null);
          setSelectedLocationIds([]);
        }
      },
      undo() {
        setLocationData(prev => prev.filter(f => !newFixtureStableIds.includes(f._stableId)));
        setArchitecturalObjects(prev => prev.filter(o => !newObjectIds.includes(o.id)));
        // Rule 3 — clear selection only if it still points at pasted items
        setSelectedLocationId(cur => newFixtureStableIds.includes(cur ?? '') ? null : cur);
        setSelectedLocationIds(cur => cur.filter(id => !newFixtureStableIds.includes(id)));
        setSelectedObjectId(cur => newObjectIds.includes(cur ?? '') ? null : cur);
        setSelectedObjectIds(cur => cur.filter(id => !newObjectIds.includes(id)));
      },
    };

    executeCommand(pasteCmd);

    // Show notification
    const totalItems = newFixtures.length + newArchObjects.length;
    showNotification(`Pasted ${totalItems} item${totalItems > 1 ? 's' : ''}`);

    // Close dialog
    setShowPasteConfirmDialog(false);
  }, [locationData, setLocationData, setArchitecturalObjects, setSelectedLocationId, setSelectedLocationIds, setSelectedObjectId, setSelectedObjectIds, executeCommand, showNotification]);

  const handlePaste = useCallback(() => {
    const clipboardData = getClipboardData();
    if (!clipboardData) {
      showNotification('Clipboard is empty', 'warning');
      return;
    }

    // Validate
    const validationResult = validatePaste(clipboardData, currentFloor);

    if (validationResult.errors.length > 0) {
      // Show error dialog - cannot paste
      setValidationErrors(validationResult.errors);
      setShowValidationErrorDialog(true);
      return;
    }

    if (validationResult.warnings.length > 0) {
      // Show confirmation dialog with warnings
      setPasteValidationResult(validationResult);
      setShowPasteConfirmDialog(true);
      return;
    }

    // No warnings/errors - paste directly
    executePaste(clipboardData, { targetFloorIndex: currentFloor });
  }, [currentFloor, getClipboardData, validatePaste, executePaste, showNotification]);

  // Keyboard shortcuts for copy/paste
  useKeyboardShortcuts({
    onCopy: handleCopySelected,
    onPaste: handlePaste,
    onUndo: handleUndo,
    onRedo: handleRedo,
    enabled: editMode && !editFloorplatesMode && !hierarchyDefMode,
  });

  // Map from fixture UID to sequence position (1-based) for hierarchy definition mode
  const hierarchySequenceMap = useMemo(() => {
    const map = new Map<string, number>();
    hierarchySequence.forEach((loc, index) => {
      const uid = generateFixtureUID(loc);
      map.set(uid, index + 1);
    });
    return map;
  }, [hierarchySequence]);

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
      const fixtureBlocks = await apiService.getFixtureBlocks(uncachedBlocks, pipelineVersion);

      // Update cache and build URL map, also store fixture types
      fixtureBlocks.forEach(block => {
        // Always store fixture type regardless of whether a GLB URL exists
        if (block.fixture_type) {
          fixtureTypeMap.current.set(block.block_name, block.fixture_type);
        }
        if (block.glb_url) {
          fixtureCache.current.set(block.block_name, block.glb_url);
          urlMap.set(block.block_name, block.glb_url);
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
  }, [pipelineVersion]);

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
    if (!selectedLocation || selectedLocations.length > 1) return;

    // Capture before await
    const prevStableId = selectedLocation._stableId;
    const prevBlockName = selectedLocation.blockName;
    const prevGlbUrl = selectedLocation.glbUrl;
    const prevWasTypeChanged = selectedLocation.wasTypeChanged;
    const prevOriginalBlockName = selectedLocation.originalBlockName;
    const prevOriginalGlbUrl = selectedLocation.originalGlbUrl;
    const prevSelectedLocationId = selectedLocationId;
    const prevSelectedLocationIds = [...selectedLocationIds];
    const newStableId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const fixtureTypeInfo = await apiService.getFixtureTypeUrl(newType, pipelineVersion);
      const newGlbUrl = fixtureTypeInfo.glb_url;

      // Don't clear old GLB cache — other fixtures of the same type may still reference it.
      // Clearing would cause them to suspend (re-fetch) on next re-render, blanking the canvas.
      useGLTF.preload(newGlbUrl);
      await new Promise(resolve => setTimeout(resolve, 100));

      let mappedBlockName = await apiService.getBlockNameForFixtureType(newType, pipelineVersion);
      if (!mappedBlockName) {
        mappedBlockName = Object.keys(FIXTURE_TYPE_MAPPING).find(
          blockName => FIXTURE_TYPE_MAPPING[blockName] === newType
        ) || newType;
      }

      fixtureCache.current.set(mappedBlockName, newGlbUrl);
      fixtureTypeMap.current.set(mappedBlockName, newType);

      // Captured after await
      const newBlockName = mappedBlockName;

      const newFixture: LocationData = {
        ...selectedLocation,
        _stableId: newStableId,
        blockName: newBlockName,
        glbUrl: newGlbUrl,
        wasTypeChanged: true,
        wasMoved: selectedLocation.wasMoved || false,
        originalBlockName: selectedLocation.originalBlockName || selectedLocation.blockName,
        originalPosX: selectedLocation.originalPosX ?? selectedLocation.posX,
        originalPosY: selectedLocation.originalPosY ?? selectedLocation.posY,
        originalPosZ: selectedLocation.originalPosZ ?? selectedLocation.posZ,
        originalGlbUrl: selectedLocation.originalGlbUrl || selectedLocation.glbUrl,
        _updateTimestamp: Date.now() + Math.random() * 1000,
        _ingestionTimestamp: Date.now() + Math.random() * 1000,
      };

      executeCommand({
        commandName: 'ChangeFixtureType',
        do() {
          setLocationData(prev => {
            // Idempotent: if new fixture already exists, just mark original forDelete
            const newExists = prev.some(loc => loc._stableId === newStableId);
            const withMarked = prev.map(loc =>
              loc._stableId === prevStableId ? { ...loc, forDelete: true } : loc
            );
            if (newExists) return withMarked;
            return [...withMarked, newFixture];
          });
          setSelectedLocationId(newStableId);
          setSelectedLocationIds([newStableId]);
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
        },
        undo() {
          setLocationData(prev => {
            const withoutNew = prev.filter(loc => loc._stableId !== newStableId);
            return withoutNew.map(loc => {
              if (loc._stableId !== prevStableId) return loc;
              return {
                ...loc,
                forDelete: false,
                blockName: prevBlockName,
                glbUrl: prevGlbUrl,
                wasTypeChanged: prevWasTypeChanged,
                originalBlockName: prevOriginalBlockName,
                originalGlbUrl: prevOriginalGlbUrl,
              };
            });
          });
          // Restore selection filtered to existing
          const restoredIds = prevSelectedLocationIds.filter(id =>
            locationDataRef.current.some(loc => loc._stableId === id)
          );
          setSelectedLocationId(
            restoredIds.includes(prevSelectedLocationId ?? '') ? prevSelectedLocationId : null
          );
          setSelectedLocationIds(restoredIds);
        },
      });

    } catch (error) {
      console.error('Failed to change fixture type:', error);
      // No executeCommand call on error — no history entry
    }
  }, [selectedLocation, selectedLocations, selectedLocationId, selectedLocationIds, pipelineVersion, executeCommand, setLocationData, setSelectedLocationId, setSelectedLocationIds, setSelectedObjectId, setSelectedObjectIds, locationDataRef]);

  const handleMultiFixtureTypeChange = useCallback(async (newType: string) => {
    if (selectedLocations.length === 0) return;

    // Capture per-fixture data before await
    const perFixture = selectedLocations.map(loc => ({
      prevStableId: loc._stableId,
      prevBlockName: loc.blockName,
      prevGlbUrl: loc.glbUrl,
      prevWasTypeChanged: loc.wasTypeChanged,
      prevOriginalBlockName: loc.originalBlockName,
      prevOriginalGlbUrl: loc.originalGlbUrl,
      newStableId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }));

    try {
      const fixtureTypeInfo = await apiService.getFixtureTypeUrl(newType, pipelineVersion);
      const newGlbUrl = fixtureTypeInfo.glb_url;

      // Don't clear old GLB cache — other fixtures of the same type may still reference it.
      useGLTF.preload(newGlbUrl);
      await new Promise(resolve => setTimeout(resolve, 100));

      let mappedBlockName = await apiService.getBlockNameForFixtureType(newType, pipelineVersion);
      if (!mappedBlockName) {
        mappedBlockName = Object.keys(FIXTURE_TYPE_MAPPING).find(
          blockName => FIXTURE_TYPE_MAPPING[blockName] === newType
        ) || newType;
      }

      fixtureCache.current.set(mappedBlockName, newGlbUrl);
      fixtureTypeMap.current.set(mappedBlockName, newType);

      const newBlockName = mappedBlockName;
      const newFixtures: LocationData[] = perFixture.map(({ newStableId }, i) => ({
        ...selectedLocations[i],
        _stableId: newStableId,
        blockName: newBlockName,
        glbUrl: newGlbUrl,
        wasTypeChanged: true,
        wasMoved: selectedLocations[i].wasMoved || false,
        originalBlockName: selectedLocations[i].originalBlockName || selectedLocations[i].blockName,
        originalPosX: selectedLocations[i].originalPosX ?? selectedLocations[i].posX,
        originalPosY: selectedLocations[i].originalPosY ?? selectedLocations[i].posY,
        originalPosZ: selectedLocations[i].originalPosZ ?? selectedLocations[i].posZ,
        originalGlbUrl: selectedLocations[i].originalGlbUrl || selectedLocations[i].glbUrl,
        _updateTimestamp: Date.now() + Math.random() * 1000,
        _ingestionTimestamp: Date.now() + Math.random() * 1000,
      }));

      const newStableIds = perFixture.map(p => p.newStableId);
      const prevStableIds = perFixture.map(p => p.prevStableId);

      executeCommand({
        commandName: 'ChangeFixtureTypeMulti',
        do() {
          setLocationData(prev => {
            const prevSet = new Set<string>(prevStableIds);
            const withMarked = prev.map(loc =>
              prevSet.has(loc._stableId) ? { ...loc, forDelete: true } : loc
            );
            const newSet = new Set<string>(newStableIds);
            const withoutExisting = withMarked.filter(loc => !newSet.has(loc._stableId));
            return [...withoutExisting, ...newFixtures];
          });
          setSelectedLocationIds(newStableIds);
          setSelectedLocationId(newStableIds[0] ?? null);
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
        },
        undo() {
          setLocationData(prev => {
            const newSet = new Set<string>(newStableIds);
            const withoutNew = prev.filter(loc => !newSet.has(loc._stableId));
            return withoutNew.map(loc => {
              const info = perFixture.find(p => p.prevStableId === loc._stableId);
              if (!info) return loc;
              return {
                ...loc,
                forDelete: false,
                blockName: info.prevBlockName,
                glbUrl: info.prevGlbUrl,
                wasTypeChanged: info.prevWasTypeChanged,
                originalBlockName: info.prevOriginalBlockName,
                originalGlbUrl: info.prevOriginalGlbUrl,
              };
            });
          });
          const restoredIds = prevStableIds.filter(id =>
            locationDataRef.current.some(loc => loc._stableId === id)
          );
          setSelectedLocationIds(restoredIds);
          setSelectedLocationId(restoredIds[0] ?? null);
        },
      });

    } catch (error) {
      console.error('Failed to change fixture types:', error);
    }
  }, [selectedLocations, pipelineVersion, executeCommand, setLocationData, setSelectedLocationId, setSelectedLocationIds, setSelectedObjectId, setSelectedObjectIds, locationDataRef]);

  // Helper function to check if a fixture type requires variant selection
  const fixtureTypeRequiresVariantSelection = (fixtureType: string): boolean => {
    const variantRequiredTypes = ['PODIUM-DISPLAY'];
    return variantRequiredTypes.includes(fixtureType);
  };

  const handleAddFixture = useCallback(async (fixtureType: string) => {
    // Check if this fixture type requires variant selection
    if (fixtureTypeRequiresVariantSelection(fixtureType)) {
      setPendingFixtureType(fixtureType);
      setFixtureVariantModalOpen(true);
      return;
    }

    try {
      // Get the GLB URL for the fixture type
      const fixtureTypeInfo = await apiService.getFixtureTypeUrl(fixtureType, pipelineVersion);
      const glbUrl = fixtureTypeInfo.glb_url;

      // Get the proper block name from the backend API
      let mappedBlockName = await apiService.getBlockNameForFixtureType(fixtureType, pipelineVersion);

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

      // Store pending fixture data and enter click-to-place mode
      pendingFixtureRef.current = { blockName: mappedBlockName, glbUrl, fixtureType };
      setIsAddingObject(true);
      setCurrentObjectType(null);
      setObjectPlacementPoint(null);

    } catch (error) {
      console.error('Failed to add fixture:', error);
      alert('Failed to add fixture. Please try again.');
    }
  }, [pipelineVersion]);

  // Handler for variant selection for regular fixtures
  const handleFixtureVariantSelect = useCallback(async (variant: { id: string; name: string; url: string; description?: string }) => {
    if (!pendingFixtureType) return;

    try {
      // Use the variant's GLB URL
      const glbUrl = variant.url;

      // Get the proper block name from the backend API
      let mappedBlockName = await apiService.getBlockNameForFixtureType(pendingFixtureType, pipelineVersion);

      // If API doesn't return a block name, try reverse lookup in FIXTURE_TYPE_MAPPING
      if (!mappedBlockName) {
        mappedBlockName = Object.keys(FIXTURE_TYPE_MAPPING).find(
          blockName => FIXTURE_TYPE_MAPPING[blockName] === pendingFixtureType
        ) || pendingFixtureType; // fallback to fixtureType if not found in mapping
      }

      // Preload the GLB
      useGLTF.preload(glbUrl);

      // Update the fixture cache with new GLB URL
      fixtureCache.current.set(mappedBlockName, glbUrl);

      // Update the fixture type map
      fixtureTypeMap.current.set(mappedBlockName, pendingFixtureType);

      // Store pending fixture data and enter click-to-place mode
      pendingFixtureRef.current = { blockName: mappedBlockName, glbUrl, fixtureType: pendingFixtureType, variant: variant.name };
      setIsAddingObject(true);
      setCurrentObjectType(null);
      setObjectPlacementPoint(null);

      // Clear pending state
      setPendingFixtureType(null);
      setFixtureVariantModalOpen(false);
      setAddFixtureModalOpen(false);
      setFixtureTypeModalOpen(false);

    } catch (error) {
      console.error('Failed to add fixture with variant:', error);
      alert('Failed to add fixture. Please try again.');
    }
  }, [pendingFixtureType, pipelineVersion]);

  // Mapping from architectural object types to fixture types for API calls
  // These must match the fixture types defined in the backend config.py
  const getFixtureTypeForArchObject = (objectType: ArchitecturalObjectType): string => {
    const mapping: Record<ArchitecturalObjectType, string> = {
      'entrance_door': 'ENTRANCE',        // Backend uses 'ENTRANCE'
      'exit_door': 'FIRE-EXIT',          // Backend uses 'FIRE-EXIT'
      'door': 'DOOR',                    // Backend uses 'DOOR' (interior doors)
      'staircase': 'STAIRCASE',          // Backend uses 'STAIRCASE'
      'toilet': 'TOILET',                // Backend uses 'TOILET'
      'trial_room': 'TRIAL-ROOM',        // Backend uses 'TRIAL-ROOM' (with hyphen)
      'boh': 'BOH',                      // Backend uses 'BOH'
      'cash_till': 'CASH-TILL',          // Backend uses 'CASH-TILL' (with hyphen)
      'glazing': 'GLAZING',
      'partition': 'PARTITION',
      'window': 'WINDOW',
      'column': 'COLUMN',
      'wall': 'WALL',
      'window_display': 'WINDOW-DISPLAY'
    };
    return mapping[objectType] || objectType.toUpperCase();
  };

  // Handler for object type selection from modal
  const handleObjectTypeSelect = useCallback((objectType: ArchitecturalObjectType) => {
    // Check if this is a single-point element that needs variant selection
    const isSinglePoint = objectType === 'entrance_door' ||
                         objectType === 'exit_door' ||
                         objectType === 'door' ||
                         objectType === 'staircase' ||
                         objectType === 'toilet' ||
                         objectType === 'trial_room' ||
                         objectType === 'boh' ||
                         objectType === 'cash_till' ||
                         objectType === 'window_display';

    if (isSinglePoint) {
      // Show variant selection modal for single-point elements
      setPendingArchObjectType(objectType);
      setArchObjectVariantModalOpen(true);
    } else {
      // For two-point elements (glazing, partition), start placement immediately
      setCurrentObjectType(objectType);
      setIsAddingObject(true);
      setObjectPlacementPoint(null);
    }
  }, []);

  // Handler for variant selection for architectural objects
  const handleArchObjectVariantSelect = useCallback((variant: { id: string; name: string; url: string; description?: string }) => {
    if (!pendingArchObjectType) return;

    console.log('[3DViewerModifier] Variant selected for arch object:', {
      type: pendingArchObjectType,
      variantId: variant.id,
      variantName: variant.name,
      glbUrl: variant.url
    });

    // Start placement mode with the selected variant info stored
    setCurrentObjectType(pendingArchObjectType);
    setIsAddingObject(true);
    setObjectPlacementPoint(null);

    // Store the variant info so it can be used when creating the object
    // We'll use a ref to avoid re-renders during placement
    // Convert to the format expected by the object creation code
    selectedVariantRef.current = {
      block_name: variant.name,  // Use variant name as block name
      glb_url: variant.url       // Use variant URL as GLB URL
    };

    // Clear pending state and close modal
    setPendingArchObjectType(null);
    setArchObjectVariantModalOpen(false);
  }, [pendingArchObjectType]);

  // Handler for floor click during object placement (also handles fixture click-to-place)
  const handleFloorClickForObjectPlacement = useCallback((point: [number, number, number]) => {
    if (!isAddingObject) return;

    const fileForFloorExtraction = selectedFloorFile || selectedFile;
    const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
    const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

    // Handle fixture click-to-place
    if (pendingFixtureRef.current) {
      const groundLevelPoint: [number, number, number] = [point[0], 0, point[2]];
      const { blockName, glbUrl, variant } = pendingFixtureRef.current;

      // Coordinate mapping: posX = world X, posY = -world Z, posZ = 0
      const posX = groundLevelPoint[0];
      const posY = -groundLevelPoint[2];
      const posZ = 0;

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

      const newFixture: LocationData = {
        _stableId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        blockName,
        floorIndex: currentFloor,
        originX,
        originY,
        posX,
        posY,
        posZ,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        brand: "unassigned",
        count: 1,
        hierarchy: newHierarchy,
        glbUrl,
        ...(variant ? { variant } : {}),

        originalBlockName: blockName,
        originalPosX: posX,
        originalPosY: posY,
        originalPosZ: posZ,
        originalRotationX: 0,
        originalRotationY: 0,
        originalRotationZ: 0,
        originalBrand: "unassigned",
        originalCount: 1,
        originalHierarchy: newHierarchy,
        originalGlbUrl: glbUrl,

        wasDuplicated: true,
        wasMoved: false,
        wasRotated: false,
        wasTypeChanged: false,
        wasBrandChanged: false,
        wasCountChanged: false,
        wasHierarchyChanged: false,

        _updateTimestamp: Date.now() + Math.random() * 1000,
        _ingestionTimestamp: Date.now() + Math.random() * 1000,
      };

      justCreatedObjectRef.current = true;
      setTimeout(() => { justCreatedObjectRef.current = false; }, 100);

      const newStableId = newFixture._stableId;
      executeCommand({
        commandName: 'CreateFixture',
        do() {
          setLocationData(prev => {
            if (prev.some(loc => loc._stableId === newStableId)) return prev;
            return [...prev, newFixture];
          });
          setSelectedLocationId(newStableId);
          setSelectedLocationIds([newStableId]);
          setSelectedObjectId(null);
          setSelectedObjectIds([]);
        },
        undo() {
          setLocationData(prev => prev.filter(loc => loc._stableId !== newStableId));
          setSelectedLocationId(cur => cur === newStableId ? null : cur);
          setSelectedLocationIds(cur => cur.length === 1 && cur[0] === newStableId ? [] : cur);
        },
      });

      // Reset placement state
      pendingFixtureRef.current = null;
      setIsAddingObject(false);
      setCurrentObjectType(null);
      setObjectPlacementPoint(null);
      return;
    }

    // Arch object placement requires a currentObjectType
    if (!currentObjectType) return;

    // Force placement at ground level (y = 0)
    const groundLevelPoint: [number, number, number] = [point[0], 0, point[2]];

    // Check if this is a single-point element (doors and other single-point architectural objects)
    const isSinglePoint = currentObjectType === 'entrance_door' ||
                         currentObjectType === 'exit_door' ||
                         currentObjectType === 'door' ||
                         currentObjectType === 'staircase' ||
                         currentObjectType === 'toilet' ||
                         currentObjectType === 'trial_room' ||
                         currentObjectType === 'boh' ||
                         currentObjectType === 'cash_till' ||
                         currentObjectType === 'window_display';

    if (isSinglePoint) {
      // Single-point placement - create immediately on first click
      // Default dimensions for each object type
      let defaultDimensions = { width: 1.5, height: 3.0, depth: 0.1 };
      if (currentObjectType === 'entrance_door') defaultDimensions = { width: 1.5, height: 3.0, depth: 0.1 };
      else if (currentObjectType === 'exit_door') defaultDimensions = { width: 1.0, height: 2.5, depth: 0.1 };
      else if (currentObjectType === 'door') defaultDimensions = { width: 0.9, height: 2.1, depth: 0.1 };
      else if (currentObjectType === 'staircase') defaultDimensions = { width: 2.0, height: 3.0, depth: 1.5 };
      else if (currentObjectType === 'toilet') defaultDimensions = { width: 1.5, height: 2.5, depth: 1.5 };
      else if (currentObjectType === 'trial_room') defaultDimensions = { width: 1.5, height: 2.5, depth: 1.5 };
      else if (currentObjectType === 'boh') defaultDimensions = { width: 2.0, height: 2.5, depth: 2.0 };
      else if (currentObjectType === 'cash_till') defaultDimensions = { width: 1.0, height: 1.2, depth: 0.6 };
      else if (currentObjectType === 'window_display') defaultDimensions = { width: 2.0, height: 2.5, depth: 0.5 };

      // Default block names for each object type (to be configured in backend)
      let defaultBlockName = 'PLACEHOLDER';
      if (currentObjectType === 'entrance_door') defaultBlockName = '1500 DOUBLE GLAZING 2';
      else if (currentObjectType === 'exit_door') defaultBlockName = 'FIRE EXIT';
      else if (currentObjectType === 'door') defaultBlockName = 'DOOR';
      else if (currentObjectType === 'staircase') defaultBlockName = 'STAIRCASE';
      else if (currentObjectType === 'toilet') defaultBlockName = 'TOILET';
      else if (currentObjectType === 'trial_room') defaultBlockName = 'TRIAL ROOM';
      else if (currentObjectType === 'boh') defaultBlockName = 'BOH';
      else if (currentObjectType === 'cash_till') defaultBlockName = 'CASH TILL';
      else if (currentObjectType === 'window_display') defaultBlockName = 'WINDOW DISPLAY';

      // Get variant info from the selected variant (from modal)
      const variantInfo = selectedVariantRef.current;
      const variantBlockName = variantInfo?.block_name || defaultBlockName;
      const variantGlbUrl = variantInfo?.glb_url;

      // Coordinate mapping: groundLevelPoint is [x, y, z] in Three.js world (y=0 is ground)
      // DoorGLB renders with position [posX, posZ, -posY], so we need to reverse this:
      // - posX = Three.js X (horizontal)
      // - posY = -(Three.js Z) (depth, negated)
      // - posZ = Three.js Y (height/up)
      const newObject: ArchitecturalObject = {
        id: `${currentObjectType}_${currentFloor}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: currentObjectType,
        variant: variantBlockName,
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
          objectCategory: 'single_point_element',
          glbUrl: variantGlbUrl  // Use GLB URL from selected variant
        }
      };

      console.log(`[3DViewerModifier] Creating new architectural object with GLB URL:`, {
        type: currentObjectType,
        variant: variantBlockName,
        glbUrl: variantGlbUrl,
        hasGlbUrl: !!variantGlbUrl
      });

      // Clear the selected variant ref for next use
      selectedVariantRef.current = null;

      const newObjectId = newObject.id;
      justCreatedObjectRef.current = true;
      setTimeout(() => { justCreatedObjectRef.current = false; }, 100);

      executeCommand({
        commandName: 'CreateObject',
        do() {
          setArchitecturalObjects(prev => {
            if (prev.some(obj => obj.id === newObjectId)) return prev;
            return [...prev, newObject];
          });
          setSelectedObjectId(newObjectId);
          setSelectedObjectIds([newObjectId]);
          setSelectedLocationId(null);
          setSelectedLocationIds([]);
          setSelectedFloorPlate(null);
        },
        undo() {
          setArchitecturalObjects(prev => prev.filter(obj => obj.id !== newObjectId));
          setSelectedObjectId(cur => cur === newObjectId ? null : cur);
          setSelectedObjectIds(cur => cur.length === 1 && cur[0] === newObjectId ? [] : cur);
        },
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

        const newObjectId = newObject.id;
        justCreatedObjectRef.current = true;
        setTimeout(() => { justCreatedObjectRef.current = false; }, 100);

        executeCommand({
          commandName: 'CreateObject',
          do() {
            setArchitecturalObjects(prev => {
              if (prev.some(obj => obj.id === newObjectId)) return prev;
              return [...prev, newObject];
            });
            setSelectedObjectId(newObjectId);
            setSelectedObjectIds([newObjectId]);
            setSelectedLocationId(null);
            setSelectedLocationIds([]);
            setSelectedFloorPlate(null);
          },
          undo() {
            setArchitecturalObjects(prev => prev.filter(obj => obj.id !== newObjectId));
            setSelectedObjectId(cur => cur === newObjectId ? null : cur);
            setSelectedObjectIds(cur => cur.length === 1 && cur[0] === newObjectId ? [] : cur);
          },
        });

        // Reset placement state
        setIsAddingObject(false);
        setCurrentObjectType(null);
        setObjectPlacementPoint(null);
      }
    }
  }, [isAddingObject, currentObjectType, objectPlacementPoint, objectHeight, selectedFloorFile, selectedFile, locationData, setLocationData, executeCommand]);

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
  const handleObjectClick = useCallback((object: ArchitecturalObject, event?: any) => {
    if (!editMode || isAddingObject) return;

    // Don't process clicks if mouse was down on transform controls
    if (isMouseDownOnTransformRef.current) {
      return;
    }

    const isMultiSelect = event?.shiftKey || event?.metaKey || event?.ctrlKey;

    if (isMultiSelect) {
      setSelectedObjectIds(prev => {
        const currentIds = prev.length === 0 && selectedObjectId ? [selectedObjectId] : prev;
        if (currentIds.includes(object.id)) {
          return currentIds.filter(id => id !== object.id);
        } else {
          return [...currentIds, object.id];
        }
      });
      setSelectedObjectId(null);
    } else {
      setSelectedObjectId(object.id);
      setSelectedObjectIds([object.id]);
    }

    // Clear fixture selections when selecting an object
    setSelectedLocationId(null);
    setSelectedLocationIds([]);
    setSelectedFloorPlate(null);
  }, [editMode, isAddingObject, selectedObjectId]);

  // Handler for multi-object position change (when moving multiple objects together)
  const handleMultiObjectPositionChange = useCallback((delta: [number, number, number]) => {
    // Capture prev positions from selectedObjects at call time
    const prevSnapshots = selectedObjects.map(obj => {
      const isSinglePoint = obj.posX !== undefined && obj.posY !== undefined && obj.posZ !== undefined;
      if (isSinglePoint) {
        return {
          objectId: obj.id, isSinglePoint: true as const,
          prevPosX: obj.posX!, prevPosY: obj.posY!, prevPosZ: obj.posZ!,
          prevWasMoved: obj.wasMoved ?? false,
          prevOrigPosX: obj.originalPosX, prevOrigPosY: obj.originalPosY, prevOrigPosZ: obj.originalPosZ,
        };
      } else {
        return {
          objectId: obj.id, isSinglePoint: false as const,
          prevStartPoint: obj.startPoint ? [...obj.startPoint] as [number, number, number] : undefined,
          prevEndPoint: obj.endPoint ? [...obj.endPoint] as [number, number, number] : undefined,
          prevWasMoved: obj.wasMoved ?? false,
          prevOrigStartPoint: obj.originalStartPoint ? [...obj.originalStartPoint] as [number, number, number] : undefined,
          prevOrigEndPoint: obj.originalEndPoint ? [...obj.originalEndPoint] as [number, number, number] : undefined,
        };
      }
    });

    executeCommand({
      commandName: 'MoveObjects',
      do() {
        setArchitecturalObjects(prev => prev.map(obj => {
          const snap = prevSnapshots.find(s => s.objectId === obj.id);
          if (!snap) return obj;
          if (snap.isSinglePoint) {
            return {
              ...obj,
              posX: snap.prevPosX + delta[0],
              posY: snap.prevPosY + delta[1],
              posZ: snap.prevPosZ + delta[2],
              wasMoved: true,
              originalPosX: obj.originalPosX ?? obj.posX,
              originalPosY: obj.originalPosY ?? obj.posY,
              originalPosZ: obj.originalPosZ ?? obj.posZ,
            };
          } else if (snap.prevStartPoint && snap.prevEndPoint) {
            return {
              ...obj,
              startPoint: [snap.prevStartPoint[0] + delta[0], snap.prevStartPoint[1] + delta[1], snap.prevStartPoint[2] + delta[2]] as [number, number, number],
              endPoint: [snap.prevEndPoint[0] + delta[0], snap.prevEndPoint[1] + delta[1], snap.prevEndPoint[2] + delta[2]] as [number, number, number],
              wasMoved: true,
              originalStartPoint: obj.originalStartPoint ?? obj.startPoint,
              originalEndPoint: obj.originalEndPoint ?? obj.endPoint,
            };
          }
          return obj;
        }));
      },
      undo() {
        setArchitecturalObjects(prev => prev.map(obj => {
          const snap = prevSnapshots.find(s => s.objectId === obj.id);
          if (!snap) return obj;
          if (snap.isSinglePoint) {
            return { ...obj, posX: snap.prevPosX, posY: snap.prevPosY, posZ: snap.prevPosZ, wasMoved: snap.prevWasMoved, originalPosX: snap.prevOrigPosX, originalPosY: snap.prevOrigPosY, originalPosZ: snap.prevOrigPosZ };
          } else {
            return { ...obj, startPoint: snap.prevStartPoint, endPoint: snap.prevEndPoint, wasMoved: snap.prevWasMoved, originalStartPoint: snap.prevOrigStartPoint, originalEndPoint: snap.prevOrigEndPoint };
          }
        }));
      },
    });
  }, [selectedObjects, executeCommand]);

  // Handler for object position change
  const handleObjectPositionChange = useCallback((object: ArchitecturalObject, newCenterPosition: [number, number, number]) => {
    const current = findObjectById(architecturalObjectsRef.current, object.id);
    if (!current) return;
    const isSinglePoint = current.posX !== undefined && current.posY !== undefined && current.posZ !== undefined;

    // Capture all prev values needed for undo
    const prevWasMoved = current.wasMoved ?? false;
    const prevPosX = current.posX; const prevPosY = current.posY; const prevPosZ = current.posZ;
    const prevOrigPosX = current.originalPosX; const prevOrigPosY = current.originalPosY; const prevOrigPosZ = current.originalPosZ;
    const prevStartPoint = current.startPoint ? [...current.startPoint] as [number, number, number] : undefined;
    const prevEndPoint = current.endPoint ? [...current.endPoint] as [number, number, number] : undefined;
    const prevOrigStartPoint = current.originalStartPoint ? [...current.originalStartPoint] as [number, number, number] : undefined;
    const prevOrigEndPoint = current.originalEndPoint ? [...current.originalEndPoint] as [number, number, number] : undefined;

    // Pre-calculate the new values
    let newPosX: number | undefined, newPosY: number | undefined, newPosZ: number | undefined;
    let newStartPoint: [number, number, number] | undefined, newEndPoint: [number, number, number] | undefined;

    if (isSinglePoint) {
      newPosX = newCenterPosition[0];
      newPosZ = newCenterPosition[1]; // Three.js Y -> CSV Z
      newPosY = -newCenterPosition[2]; // Three.js Z -> CSV Y (negated)
    } else {
      const originalCenter: [number, number, number] = [
        (current.startPoint![0] + current.endPoint![0]) / 2,
        current.startPoint![1],
        (current.startPoint![2] + current.endPoint![2]) / 2,
      ];
      const offset: [number, number, number] = [
        newCenterPosition[0] - originalCenter[0],
        0,
        newCenterPosition[2] - originalCenter[2],
      ];
      newStartPoint = [current.startPoint![0] + offset[0], 0, current.startPoint![2] + offset[2]];
      newEndPoint = [current.endPoint![0] + offset[0], 0, current.endPoint![2] + offset[2]];
    }

    executeCommand({
      commandName: 'MoveObject',
      do() {
        updateObjectById(setArchitecturalObjects, object.id, obj => {
          if (isSinglePoint) {
            return { ...obj, posX: newPosX, posY: newPosY, posZ: newPosZ, wasMoved: true, originalPosX: obj.originalPosX ?? prevPosX, originalPosY: obj.originalPosY ?? prevPosY, originalPosZ: obj.originalPosZ ?? prevPosZ };
          } else {
            return { ...obj, startPoint: newStartPoint, endPoint: newEndPoint, wasMoved: true, originalStartPoint: obj.originalStartPoint ?? prevStartPoint, originalEndPoint: obj.originalEndPoint ?? prevEndPoint };
          }
        });
      },
      undo() {
        updateObjectById(setArchitecturalObjects, object.id, obj => {
          if (isSinglePoint) {
            return { ...obj, posX: prevPosX, posY: prevPosY, posZ: prevPosZ, wasMoved: prevWasMoved, originalPosX: prevOrigPosX, originalPosY: prevOrigPosY, originalPosZ: prevOrigPosZ };
          } else {
            return { ...obj, startPoint: prevStartPoint, endPoint: prevEndPoint, wasMoved: prevWasMoved, originalStartPoint: prevOrigStartPoint, originalEndPoint: prevOrigEndPoint };
          }
        });
      },
    });
  }, [executeCommand]);

  // Handler for object rotation
  const handleObjectRotate = useCallback((object: ArchitecturalObject, angle: number) => {
    const current = findObjectById(architecturalObjectsRef.current, object.id);
    if (!current) return;
    const isSinglePoint = current.posX !== undefined && current.posY !== undefined && current.posZ !== undefined;

    const prevWasRotated = current.wasRotated ?? false;
    const prevRotationZ = current.rotationZ;
    const prevOrigRotationZ = current.originalRotationZ;
    const prevRotation = current.rotation;
    const prevOrigRotation = current.originalRotation;

    executeCommand({
      commandName: 'RotateObject',
      do() {
        updateObjectById(setArchitecturalObjects, object.id, obj => {
          if (isSinglePoint) {
            const angleInDegrees = (angle * 180) / Math.PI;
            return { ...obj, rotationZ: (obj.rotationZ || 0) + angleInDegrees, wasRotated: true, originalRotationZ: obj.originalRotationZ ?? (obj.rotationZ || 0) };
          } else {
            return { ...obj, rotation: (obj.rotation || 0) + angle, wasRotated: true, originalRotation: obj.originalRotation ?? (obj.rotation || 0) };
          }
        });
      },
      undo() {
        updateObjectById(setArchitecturalObjects, object.id, obj => {
          if (isSinglePoint) {
            return { ...obj, rotationZ: prevRotationZ, wasRotated: prevWasRotated, originalRotationZ: prevOrigRotationZ };
          } else {
            return { ...obj, rotation: prevRotation, wasRotated: prevWasRotated, originalRotation: prevOrigRotation };
          }
        });
      },
    });
  }, [executeCommand]);

  // Handler for object height change
  const handleObjectHeightChange = useCallback((object: ArchitecturalObject, newHeight: number) => {
    const current = findObjectById(architecturalObjectsRef.current, object.id);
    if (!current) return;
    const prevHeight = current.height;
    const prevWasHeightChanged = current.wasHeightChanged ?? false;
    const prevOriginalHeight = current.originalHeight;

    executeCommand({
      commandName: 'ObjectHeightChange',
      do() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, height: newHeight, wasHeightChanged: true, originalHeight: obj.originalHeight ?? obj.height,
        }));
      },
      undo() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, height: prevHeight, wasHeightChanged: prevWasHeightChanged, originalHeight: prevOriginalHeight,
        }));
      },
    });
  }, [executeCommand]);

  // Handler for single-point position change (for doors, columns, etc.)
  const handleSinglePointPositionChange = useCallback((object: ArchitecturalObject, newPosX: number, newPosY: number, newPosZ: number) => {
    const current = findObjectById(architecturalObjectsRef.current, object.id);
    if (!current) return;
    const prevPosX = current.posX; const prevPosY = current.posY; const prevPosZ = current.posZ;
    const prevWasMoved = current.wasMoved ?? false;
    const prevOrigPosX = current.originalPosX; const prevOrigPosY = current.originalPosY; const prevOrigPosZ = current.originalPosZ;

    executeCommand({
      commandName: 'MoveObject',
      do() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, posX: newPosX, posY: newPosY, posZ: newPosZ, wasMoved: true,
          originalPosX: obj.originalPosX ?? obj.posX, originalPosY: obj.originalPosY ?? obj.posY, originalPosZ: obj.originalPosZ ?? obj.posZ,
        }));
      },
      undo() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, posX: prevPosX, posY: prevPosY, posZ: prevPosZ, wasMoved: prevWasMoved,
          originalPosX: prevOrigPosX, originalPosY: prevOrigPosY, originalPosZ: prevOrigPosZ,
        }));
      },
    });
  }, [executeCommand]);

  // Handler for object start/end points change (for length editing)
  const handleObjectPointsChange = useCallback((object: ArchitecturalObject, newStartPoint: [number, number, number], newEndPoint: [number, number, number]) => {
    const current = findObjectById(architecturalObjectsRef.current, object.id);
    if (!current) return;
    const prevStartPoint = current.startPoint ? [...current.startPoint] as [number, number, number] : undefined;
    const prevEndPoint = current.endPoint ? [...current.endPoint] as [number, number, number] : undefined;
    const prevWasMoved = current.wasMoved ?? false;
    const prevOrigStartPoint = current.originalStartPoint ? [...current.originalStartPoint] as [number, number, number] : undefined;
    const prevOrigEndPoint = current.originalEndPoint ? [...current.originalEndPoint] as [number, number, number] : undefined;

    executeCommand({
      commandName: 'MoveObject',
      do() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, startPoint: newStartPoint, endPoint: newEndPoint, wasMoved: true,
          originalStartPoint: obj.originalStartPoint ?? obj.startPoint, originalEndPoint: obj.originalEndPoint ?? obj.endPoint,
        }));
      },
      undo() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, startPoint: prevStartPoint, endPoint: prevEndPoint, wasMoved: prevWasMoved,
          originalStartPoint: prevOrigStartPoint, originalEndPoint: prevOrigEndPoint,
        }));
      },
    });
  }, [executeCommand]);

  // Handler for object deletion
  const handleObjectDelete = useCallback((object: ArchitecturalObject) => {
    const prevSelectedObjectId = selectedObjectId;
    const prevSelectedObjectIds = [...selectedObjectIds];
    const frozenSnapshot = { ...object, customProperties: object.customProperties ? { ...object.customProperties } : undefined };

    executeCommand({
      commandName: 'DeleteObject',
      do() {
        setArchitecturalObjects(prev => prev.filter(obj => obj.id !== frozenSnapshot.id));
        setSelectedObjectId(cur => cur === frozenSnapshot.id ? null : cur);
        setSelectedObjectIds(cur => cur.filter(id => id !== frozenSnapshot.id));
      },
      undo() {
        setArchitecturalObjects(prev => [...prev, frozenSnapshot]);
        const restoredIds = prevSelectedObjectIds.filter(id =>
          architecturalObjectsRef.current.some(obj => obj.id === id) || id === frozenSnapshot.id
        );
        setSelectedObjectId(restoredIds.includes(prevSelectedObjectId ?? '') ? prevSelectedObjectId : null);
        setSelectedObjectIds(restoredIds);
      },
    });
  }, [selectedObjectId, selectedObjectIds, executeCommand]);

  // Handler for object reset
  const handleObjectReset = useCallback((object: ArchitecturalObject) => {
    const current = findObjectById(architecturalObjectsRef.current, object.id);
    if (!current) return;
    // Capture all current values that reset will change
    const isSinglePoint = current.posX !== undefined && current.posY !== undefined && current.posZ !== undefined;
    const prevFields = isSinglePoint ? {
      posX: current.posX, posY: current.posY, posZ: current.posZ,
      rotationX: current.rotationX, rotationY: current.rotationY, rotationZ: current.rotationZ,
      width: current.width, height: current.height, depth: current.depth,
      wasMoved: current.wasMoved ?? false, wasRotated: current.wasRotated ?? false, wasResized: current.wasResized ?? false,
    } : {
      startPoint: current.startPoint ? [...current.startPoint] as [number, number, number] : undefined,
      endPoint: current.endPoint ? [...current.endPoint] as [number, number, number] : undefined,
      height: current.height, rotation: current.rotation,
      wasMoved: current.wasMoved ?? false, wasRotated: current.wasRotated ?? false, wasHeightChanged: current.wasHeightChanged ?? false,
    };

    executeCommand({
      commandName: 'ResetObject',
      do() {
        updateObjectById(setArchitecturalObjects, object.id, obj => {
          const sp = obj.posX !== undefined && obj.posY !== undefined && obj.posZ !== undefined;
          if (sp) {
            return {
              ...obj,
              posX: obj.originalPosX ?? obj.posX, posY: obj.originalPosY ?? obj.posY, posZ: obj.originalPosZ ?? obj.posZ,
              rotationX: obj.originalRotationX ?? obj.rotationX ?? 0, rotationY: obj.originalRotationY ?? obj.rotationY ?? 0, rotationZ: obj.originalRotationZ ?? obj.rotationZ ?? 0,
              width: obj.originalWidth ?? obj.width, height: obj.originalHeight ?? obj.height, depth: obj.originalDepth ?? obj.depth,
              wasMoved: false, wasRotated: false, wasResized: false,
            };
          } else {
            return {
              ...obj,
              startPoint: obj.originalStartPoint || obj.startPoint, endPoint: obj.originalEndPoint || obj.endPoint,
              height: obj.originalHeight ?? obj.height, rotation: obj.originalRotation ?? obj.rotation ?? 0,
              wasMoved: false, wasRotated: false, wasHeightChanged: false,
            };
          }
        });
      },
      undo() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, ...prevFields,
        }));
      },
    });
  }, [executeCommand]);

  // Handler for object variant change
  const handleObjectVariantChange = useCallback((object: ArchitecturalObject, variant: FixtureVariant) => {
    const current = findObjectById(architecturalObjectsRef.current, object.id);
    if (!current) return;
    const prevVariant = current.variant;
    const prevGlbUrl = current.customProperties?.glbUrl;

    const variantName = variant.name || variant.block_name || 'Unknown';
    const variantUrl = variant.url || variant.glb_url;

    executeCommand({
      commandName: 'ObjectVariantChange',
      do() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, variant: variantName, customProperties: { ...obj.customProperties, glbUrl: variantUrl },
        }));
      },
      undo() {
        updateObjectById(setArchitecturalObjects, object.id, obj => ({
          ...obj, variant: prevVariant, customProperties: { ...obj.customProperties, glbUrl: prevGlbUrl },
        }));
      },
    });
  }, [executeCommand]);

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

        // Exclude deleted fixtures (keyed by _stableId)
        return !deletedFixtures.has(location._stableId);
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

      // Add architectural objects (glazing, partitions, and single-point elements) for this floor
      const currentFloorObjects = workingArchObjects.filter(obj => obj.floorIndex === floorIndex);

      for (const obj of currentFloorObjects) {
        // Handle single-point elements (doors, staircase, toilet, etc.) - single point with rotation
        const isSinglePointElement = obj.type === 'entrance_door' ||
                                     obj.type === 'exit_door' ||
                                     obj.type === 'staircase' ||
                                     obj.type === 'toilet' ||
                                     obj.type === 'trial_room' ||
                                     obj.type === 'boh' ||
                                     obj.type === 'cash_till';

        if (isSinglePointElement) {
          const { posX, posY, posZ, rotationX, rotationY, rotationZ, width, height, depth } = obj;

          // Skip if missing required properties
          if (posX === undefined || posY === undefined || posZ === undefined) {
            console.warn(`Skipping ${obj.type} ${obj.id}: missing required position properties`);
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

          // Create element group at the correct position (matching DoorGLB component)
          const elementGroup = new THREE.Group();
          elementGroup.position.set(threePosition[0], threePosition[1], threePosition[2]);

          // Apply rotation - convert from degrees to radians (matching DoorGLB component)
          // Canvas3D.tsx:778 uses rotation order: [rotationX, rotationZ, rotationY]
          const rotX = ((rotationX || 0) * Math.PI) / 180;
          const rotY = ((rotationY || 0) * Math.PI) / 180;
          const rotZ = ((rotationZ || 0) * Math.PI) / 180;
          elementGroup.rotation.set(rotX, rotZ, rotY); // Note: Y and Z are swapped!

          // Check if element has a GLB URL (actual 3D model)
          const glbUrl = obj.customProperties?.glbUrl;

          if (glbUrl) {
            // Load the actual GLB model
            try {
              const elementGLTF = await new Promise<GLTF>((resolve, reject) => {
                loader.load(glbUrl, resolve, undefined, reject);
              });

              // Clone the model and add to group
              const elementModel = elementGLTF.scene.clone();
              elementGroup.add(elementModel);
              console.log(`[Baking] Loaded ${obj.type} GLB model from ${glbUrl}`);
            } catch (error) {
              console.error(`[Baking] Failed to load ${obj.type} GLB from ${glbUrl}, using fallback geometry:`, error);
              // Fall through to create fallback geometry
            }
          }

          // If no GLB URL or loading failed, create fallback geometry
          if (!glbUrl || elementGroup.children.length === 0) {
            console.log(`[Baking] Using fallback box geometry for ${obj.type} ${obj.id}`);
            const fallbackWidth = width || 1.5;
            const fallbackHeight = height || 3.0;
            const fallbackDepth = depth || 0.1;

            // Get color based on element type
            let frameColor = 0x333333;
            let panelColor = 0x8B4513;
            if (obj.type === 'entrance_door') { frameColor = 0x333333; panelColor = 0x8B4513; }
            else if (obj.type === 'exit_door') { frameColor = 0xCC0000; panelColor = 0xFF6666; }
            else if (obj.type === 'staircase') { frameColor = 0x2C4B6B; panelColor = 0x4682B4; }
            else if (obj.type === 'toilet') { frameColor = 0x1A8A8A; panelColor = 0x20B2AA; }
            else if (obj.type === 'trial_room') { frameColor = 0x9B6BAD; panelColor = 0xDDA0DD; }
            else if (obj.type === 'boh') { frameColor = 0x8B6330; panelColor = 0xCD853F; }
            else if (obj.type === 'cash_till') { frameColor = 0xB8960F; panelColor = 0xFFD700; }

            // Create frame (darker material)
            const frameMaterial = new THREE.MeshStandardMaterial({
              color: frameColor,
              metalness: 0.5,
              roughness: 0.5
            });

            // Panel (slightly inset from frame)
            const panelMaterial = new THREE.MeshStandardMaterial({
              color: panelColor,
              metalness: 0.1,
              roughness: 0.8
            });

            // Main panel - centered at group origin
            const mainPanel = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth * 0.9, fallbackHeight * 0.9, fallbackDepth * 0.5),
              panelMaterial
            );
            mainPanel.position.set(0, 0, 0);
            elementGroup.add(mainPanel);

            // Frame - top
            const topFrame = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth, fallbackHeight * 0.05, fallbackDepth),
              frameMaterial
            );
            topFrame.position.set(0, fallbackHeight / 2 - (fallbackHeight * 0.025), 0);
            elementGroup.add(topFrame);

            // Frame - bottom
            const bottomFrame = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth, fallbackHeight * 0.05, fallbackDepth),
              frameMaterial
            );
            bottomFrame.position.set(0, -fallbackHeight / 2 + (fallbackHeight * 0.025), 0);
            elementGroup.add(bottomFrame);

            // Frame - left
            const leftFrame = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth * 0.05, fallbackHeight * 0.9, fallbackDepth),
              frameMaterial
            );
            leftFrame.position.set(-fallbackWidth / 2 + (fallbackWidth * 0.025), 0, 0);
            elementGroup.add(leftFrame);

            // Frame - right
            const rightFrame = new THREE.Mesh(
              new THREE.BoxGeometry(fallbackWidth * 0.05, fallbackHeight * 0.9, fallbackDepth),
              frameMaterial
            );
            rightFrame.position.set(fallbackWidth / 2 - (fallbackWidth * 0.025), 0, 0);
            elementGroup.add(rightFrame);
          }

          exportScene.add(elementGroup);
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
      spawn_point: spawnPoint,
      floor_height: floorHeights.get(floorIndex) ?? '9ft'
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
      const fixtureBlocks = await apiService.getFixtureBlocks(uniqueBlockNames, pipelineVersion);
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
          const typeInfo = await apiService.getFixtureTypeUrl(fixtureType, pipelineVersion);
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
    const directRenderData = await apiService.getDirectRenderTypes(pipelineVersion);
    directRenderTypes = directRenderData.direct_render_fixture_types;
    log(`Found ${directRenderTypes.length} direct render fixture types`);
  } catch (error) {
    console.error('Failed to fetch direct render types:', error);
    // Continue without direct render types
  }

  // 7. Build the config object (architectural elements now stored in separate file)
  const config = {
    pipeline_version: pipelineVersion,
    fixture_style: fixtureStyle,
    floor: floors,
    block_fixture_types: blockFixtureTypes,
    fixture_type_glb_urls: fixtureTypeGlbUrls,
    additional_block_fixture_type: directRenderTypes
  };

  log('Store config generated with', floors.length, 'floors');
  return JSON.stringify(config, null, 2);
}, [pipelineVersion, fixtureStyle, floorHeights]);

const createModifiedZipBlob = useCallback(async (): Promise<Blob> => {
    const zip = new JSZip();
    log('Building modified ZIP...');

    // Check if floors need to be remapped
    const floorMapping = getFloorIndexMapping();

    // Apply floor remapping to data if needed
    let workingLocationData = locationData;
    let workingExtractedFiles = extractedFiles;
    let workingSpawnPoints = spawnPoints;
    let workingFloorNames = floorNames;

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

      // Remap spawn points to new floor indices
      workingSpawnPoints = new Map<number, [number, number, number]>();
      spawnPoints.forEach((value, oldIndex) => {
        const newIndex = floorMapping.get(oldIndex);
        if (newIndex !== undefined) {
          workingSpawnPoints.set(newIndex, value);
        }
      });
      log('Remapped spawn points:', Object.fromEntries(workingSpawnPoints));

      // Remap floor names to new floor indices
      workingFloorNames = new Map<number, string>();
      floorNames.forEach((value, oldIndex) => {
        const newIndex = floorMapping.get(oldIndex);
        if (newIndex !== undefined) {
          workingFloorNames.set(newIndex, value);
        }
      });
      log('Remapped floor names:', Object.fromEntries(workingFloorNames));
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
      const configJson = await createStoreConfigJSON(workingLocationData, workingExtractedFiles, workingSpawnPoints, workingFloorNames);
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
      const migrationResult = await migrateBrandsInZip(blob, pipelineVersion);
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
  }, [createModifiedZipBlob, isExportingZip, jobId, pipelineVersion]);

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
      const migrationResult = await migrateBrandsInZip(blob, pipelineVersion);
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
      setSaveEntity('');
      setSaveStoreId('');
      setSaveStoreName('');
      alert('Store saved successfully');
    } catch (e: any) {
      console.error('Failed to save store:', e);
      alert(`Failed to save store: ${e?.message || e}`);
    } finally {
      setIsSavingStore(false);
    }
  }, [createModifiedZipBlob, jobId, saveStoreId, saveStoreName, storeCodes, saveEntity, uploadStoreZip, insertStoreRecord, storeData, pipelineVersion]);

  // Derive entity from formatType — consistent with Make Live logic
  const deriveEntityFromFormatType = useCallback((formatType: string): string => {
    const ft = (formatType || '').toLowerCase().trim();
    if (ft === 'trends small town') return 'tst';
    if (ft === 'trends') return 'trends';
    return 'trends-extension';
  }, []);

  // Stores filtered by selected entity and search text
  const filteredStores = useMemo(() => {
    return storeData.filter(store => {
      const ft = (store.formatType || '').toLowerCase().trim();
      if (saveEntity === 'tst') {
        if (ft !== 'trends small town') return false;
      } else if (saveEntity === 'trends') {
        if (ft !== 'trends') return false;
      } else if (saveEntity === 'trends-extension') {
        if (ft === 'trends' || ft === 'trends small town') return false;
      }
      // '' or 'demo' — no entity filter, show all stores
      if (!storeSearch.trim()) return true;
      const search = storeSearch.toLowerCase();
      const displayName = (store.nocName || store.sapName || store.storeName || '').toLowerCase();
      return store.storeCode.toLowerCase().includes(search) || displayName.includes(search);
    });
  }, [storeData, saveEntity, storeSearch]);

  // Handle store selection and auto-populate store name and entity
  const handleStoreSelection = useCallback((selectedStoreCode: string) => {
    setSaveStoreId(selectedStoreCode);
    setStoreSearch(selectedStoreCode);
    setShowStoreDropdown(false);

    const selectedStore = storeData.find(store => store.storeCode === selectedStoreCode);
    if (selectedStore) {
      const displayName = selectedStore.nocName || selectedStore.sapName || selectedStore.storeName || '';
      setSaveStoreName(`${selectedStoreCode} - ${displayName}`);
      setSaveEntity(deriveEntityFromFormatType(selectedStore.formatType));
    } else {
      setSaveStoreName('');
      setSaveEntity('');
    }
  }, [storeData, deriveEntityFromFormatType]);

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

  const handleGizmoRotationChange = useCallback((location: LocationData, newRotation: [number, number, number]) => {
    const stableId = location._stableId;
    if (!stableId) return;

    const current = findFixtureById(locationDataRef.current, stableId);
    if (!current) return;

    const prevRotX = current.rotationX; const prevRotY = current.rotationY; const prevRotZ = current.rotationZ;
    const prevWasRotated = current.wasRotated ?? false;
    const prevOrigRotX = current.originalRotationX; const prevOrigRotY = current.originalRotationY; const prevOrigRotZ = current.originalRotationZ;

    executeCommand({
      commandName: 'GizmoRotation',
      do() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc, rotationX: newRotation[0], rotationY: newRotation[1], rotationZ: newRotation[2],
          wasRotated: true,
          originalRotationX: loc.originalRotationX ?? loc.rotationX,
          originalRotationY: loc.originalRotationY ?? loc.rotationY,
          originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
        }));
      },
      undo() {
        updateFixtureById(setLocationData, stableId, loc => ({
          ...loc, rotationX: prevRotX, rotationY: prevRotY, rotationZ: prevRotZ,
          wasRotated: prevWasRotated,
          originalRotationX: prevOrigRotX, originalRotationY: prevOrigRotY, originalRotationZ: prevOrigRotZ,
        }));
      },
    });
  }, [executeCommand]);

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
      setSelectedLocationIds([]);
      setSelectedLocationId(null);
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
    }
  }, [isAddingObject, isTransforming, editFloorplatesMode]);

  // Clear selections when spawn point mode changes
  useEffect(() => {
    if (setSpawnPointMode) {
      // Clear fixture selections when entering spawn point mode
      setSelectedLocationId(null);
      setSelectedLocationIds([]);
      setSelectedFloorPlate(null);
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
    }
  }, [setSpawnPointMode]);

  // Hierarchy definition mode toggle handler
  const handleHierarchyDefModeChange = useCallback((enabled: boolean) => {
    if (enabled) {
      // Entering hierarchy definition mode

      // Deactivate other modes
      setEditMode(false);
      setEditFloorplatesMode(false);
      setSetSpawnPointMode(false);
      setIsMeasuring(false);
      clearSelections();

      // Calculate max hierarchy for current floor
      const fileForFloorExtraction = selectedFloorFile || selectedFile;
      const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) ||
                         fileForFloorExtraction?.name.match(/(\d+)/i);
      const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

      const currentFloorFixtures = locationData.filter(loc =>
        loc.floorIndex === currentFloor && !loc.forDelete
      );
      const maxHierarchy = currentFloorFixtures.length > 0
        ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
        : 0;

      setHierarchyStartValue(maxHierarchy + 1);
      setHierarchySequence([]);
      setHierarchyDefMode(true);
    } else {
      // Exiting hierarchy definition mode - just clear without applying
      setHierarchyDefMode(false);
      setHierarchySequence([]);
      clearSelections();
    }
  }, [selectedFloorFile, selectedFile, locationData, clearSelections]);

  const handleAcceptHierarchySequence = useCallback(() => {
    // Apply the hierarchy changes
    if (hierarchySequence.length > 0) {
      hierarchySequence.forEach((loc, index) => {
        const newHierarchy = hierarchyStartValue + index;
        handleFixtureHierarchyChange(loc, newHierarchy);
      });
    }

    // Exit the mode and clear all related states
    setHierarchyDefMode(false);
    setHierarchySequence([]);
    clearSelections();
  }, [hierarchySequence, hierarchyStartValue, handleFixtureHierarchyChange, clearSelections]);

  // Recalculate hierarchy start value on floor change
  useEffect(() => {
    if (hierarchyDefMode) {
      const fileForFloorExtraction = selectedFloorFile || selectedFile;
      const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) ||
                         fileForFloorExtraction?.name.match(/(\d+)/i);
      const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

      const currentFloorFixtures = locationData.filter(loc =>
        loc.floorIndex === currentFloor && !loc.forDelete
      );
      const maxHierarchy = currentFloorFixtures.length > 0
        ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
        : 0;

      setHierarchyStartValue(maxHierarchy + 1);
      setHierarchySequence([]); // Clear sequence on floor change
    }
  }, [selectedFloorFile, selectedFile, hierarchyDefMode, locationData]);

  // Clear hierarchy sequence (called on right-click)
  const handleClearHierarchySequence = useCallback(() => {
    setHierarchySequence([]);
  }, []);

  // Cancel adding architectural object or fixture (called on right-click)
  const handleCancelAddObject = useCallback(() => {
    setIsAddingObject(false);
    setCurrentObjectType(null);
    setObjectPlacementPoint(null);
    pendingFixtureRef.current = null;
  }, []);

  const handleEditModeChangeOriginal = useCallback((mode: 'off' | 'fixtures' | 'floorplates') => {
    if (mode === "off") {
      setEditMode(false);
      setEditFloorplatesMode(false);

      // Deactivate hierarchy mode if active
      if (hierarchyDefMode) {
        setHierarchyDefMode(false);
        setHierarchySequence([]);
      }

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

      // Deactivate hierarchy mode if active
      if (hierarchyDefMode) {
        setHierarchyDefMode(false);
        setHierarchySequence([]);
      }

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

      // Deactivate hierarchy mode if active
      if (hierarchyDefMode) {
        setHierarchyDefMode(false);
        setHierarchySequence([]);
      }

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
  }, [selectedFloorFile, selectedFile, glbFiles, hierarchyDefMode]);

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
        // Check if this CSV row is a door that was migrated to architectural objects
        const doorCheck = isDoorBlockName(blockName);
        if (doorCheck.isDoor) {
          // This is a door that was migrated out - skip it in the CSV
          deletedCount++;
          console.log(`[CSV Export] Skipping migrated door: ${blockName} at floor ${floorIndex}`);
          continue;
        }

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
      
      // Check if this fixture has been deleted - skip if so (keyed by _stableId)
      if (deletedFixtures.has(matchingLocation._stableId)) {
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
      // Read pipeline version, fixture style, and per-floor heights from store-config.json before extracting
      const preZip = await JSZip.loadAsync(file);
      const preConfigFile = preZip.file('store-config.json');
      if (preConfigFile) {
        try {
          const configText = await preConfigFile.async('text');
          const preConfig = JSON.parse(configText);
          if (preConfig.pipeline_version) {
            setPipelineVersion(preConfig.pipeline_version);
          }
          if (preConfig.fixture_style) {
            setFixtureStyle(preConfig.fixture_style);
          }
          if (preConfig.floor && Array.isArray(preConfig.floor)) {
            const heights = new Map<number, string>();
            preConfig.floor.forEach((f: any) => {
              if (f.floor_index !== undefined && f.floor_height) {
                heights.set(Number(f.floor_index), f.floor_height);
              }
            });
            if (heights.size > 0) setFloorHeights(heights);
          }
        } catch (e) { /* use default */ }
      }

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

        // Extract pipeline version from job config
        if (jobData.config?.pipeline_version) {
          setPipelineVersion(jobData.config.pipeline_version);
        }

        setExtracting(true);
        setFixturesLoaded(false);
        const zipBlob = await apiService.fetchJobFilesAsZip(jobId);
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
        let zipBlob = await resp.blob();

        // Read pipeline version, fixture style, and per-floor heights from store-config.json in ZIP before brand migration
        let detectedPipelineVersion = '02'; // fallback for older stores
        const preZip = await JSZip.loadAsync(zipBlob);
        const preConfigFile = preZip.file('store-config.json');
        if (preConfigFile) {
          try {
            const configText = await preConfigFile.async('text');
            const preConfig = JSON.parse(configText);
            if (preConfig.pipeline_version) {
              detectedPipelineVersion = preConfig.pipeline_version;
            }
            if (preConfig.fixture_style) {
              setFixtureStyle(preConfig.fixture_style);
            }
            if (preConfig.floor && Array.isArray(preConfig.floor)) {
              const heights = new Map<number, string>();
              preConfig.floor.forEach((f: any) => {
                if (f.floor_index !== undefined && f.floor_height) {
                  heights.set(Number(f.floor_index), f.floor_height);
                }
              });
              if (heights.size > 0) setFloorHeights(heights);
            }
          } catch (e) { /* use fallback */ }
        }
        setPipelineVersion(detectedPipelineVersion);

        // Migrate brand names in location-master.csv on store open
        console.log('[3DViewerModifier] Starting brand migration on store open (URL)...');
        const migrationResult = await migrateBrandsInZip(zipBlob, detectedPipelineVersion);
        zipBlob = migrationResult.zipBlob;
        if (migrationResult.migratedCount > 0) {
          console.log(`[3DViewerModifier] Successfully migrated ${migrationResult.migratedCount} brand names on open`);
        }

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
        let blob = await downloadZip(zipPath, bucket);

        // Read pipeline version, fixture style, and per-floor heights from store-config.json in ZIP before brand migration
        let detectedPipelineVersion = '02'; // fallback for older stores
        const preZip = await JSZip.loadAsync(blob);
        const preConfigFile = preZip.file('store-config.json');
        if (preConfigFile) {
          try {
            const configText = await preConfigFile.async('text');
            const preConfig = JSON.parse(configText);
            if (preConfig.pipeline_version) {
              detectedPipelineVersion = preConfig.pipeline_version;
            }
            if (preConfig.fixture_style) {
              setFixtureStyle(preConfig.fixture_style);
            }
            if (preConfig.floor && Array.isArray(preConfig.floor)) {
              const heights = new Map<number, string>();
              preConfig.floor.forEach((f: any) => {
                if (f.floor_index !== undefined && f.floor_height) {
                  heights.set(Number(f.floor_index), f.floor_height);
                }
              });
              if (heights.size > 0) setFloorHeights(heights);
            }
          } catch (e) { /* use fallback */ }
        }
        setPipelineVersion(detectedPipelineVersion);

        // Migrate brand names in location-master.csv on store open
        console.log('[3DViewerModifier] Starting brand migration on store open (Supabase)...');
        const migrationResult = await migrateBrandsInZip(blob, detectedPipelineVersion);
        blob = migrationResult.zipBlob;
        if (migrationResult.migratedCount > 0) {
          console.log(`[3DViewerModifier] Successfully migrated ${migrationResult.migratedCount} brand names on open`);
        }

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
        const categories = await apiService.getBrandCategories(pipelineVersion);
        setBrandCategories(categories);
      } catch (error) {
        console.warn('Failed to fetch brand categories:', error);
        // Fall back to legacy behavior if API fails
      }
    };

    fetchBrandCategories();
  }, [pipelineVersion]);

  // Load all available fixture types from API
  useEffect(() => {
    const loadAllFixtureTypes = async () => {
      if (isUnmountingRef.current) return; // Skip if unmounting
      try {
        const allTypes = await apiService.getAllFixtureTypes(pipelineVersion);
        // Filter out architectural object types
        const architecturalTypes = ['ENTRANCE', 'FIRE-EXIT', 'DOOR', 'STAIRCASE', 'TOILET', 'TRIAL-ROOM', 'BOH', 'CASH-TILL', 'WINDOW-DISPLAY', 'MID-WALL-BAY'];
        const fixtureOnlyTypes = allTypes.filter(type => !architecturalTypes.includes(type));
        setFixtureTypes(fixtureOnlyTypes);
      } catch (error) {
        console.warn('Failed to load fixture types from API:', error);
        // Fallback to hardcoded types from mapping
        const architecturalTypes = ['ENTRANCE', 'FIRE-EXIT', 'DOOR', 'STAIRCASE', 'TOILET', 'TRIAL-ROOM', 'BOH', 'CASH-TILL', 'WINDOW-DISPLAY', 'MID-WALL-BAY'];
        const fixtureOnlyTypes = Object.values(FIXTURE_TYPE_MAPPING).filter(type => !architecturalTypes.includes(type));
        setFixtureTypes(fixtureOnlyTypes);
      }
    };

    loadAllFixtureTypes();
  }, [pipelineVersion]);

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

  // Close store search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(e.target as Node)) {
        setShowStoreDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          const floorHeightsMap = new Map<number, string>();

          // Check if store-config.json exists
          const storeConfigFile = extractedFiles.find(file =>
            file.name.toLowerCase() === 'store-config.json'
          );

          if (storeConfigFile) {
            try {
              const response = await fetch(storeConfigFile.url);
              const config = await response.json();

              // Extract pipeline version (fallback to '02' for older stores)
              if (config.pipeline_version) {
                setPipelineVersion(config.pipeline_version);
              }

              // Extract fixture style
              if (config.fixture_style) {
                setFixtureStyle(config.fixture_style);
              }

              // Seed fixtureTypeMap from stored block_fixture_types (covers blocks
              // not in the backend's API database, e.g. store-specific block names)
              if (config.block_fixture_types && typeof config.block_fixture_types === 'object') {
                Object.entries(config.block_fixture_types).forEach(([blockName, fixtureType]) => {
                  if (typeof fixtureType === 'string' && !fixtureTypeMap.current.has(blockName)) {
                    fixtureTypeMap.current.set(blockName, fixtureType);
                  }
                });
              }

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

                  // Extract floor height if it exists
                  if (floor.floor_index !== undefined && floor.floor_height) {
                    floorHeightsMap.set(Number(floor.floor_index), floor.floor_height);
                  }
                });

                if (floorHeightsMap.size > 0) {
                  setFloorHeights(floorHeightsMap);
                }
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

                // Reset modification flags - loaded state is now the "default" state
                // This ensures purple bounding boxes don't appear on load
                elements = elements.map(obj => ({
                  ...obj,
                  wasMoved: false,
                  wasRotated: false,
                  // Update original values to match current values
                  originalPosX: obj.posX,
                  originalPosY: obj.posY,
                  originalPosZ: obj.posZ,
                  originalRotationX: obj.rotationX,
                  originalRotationY: obj.rotationY,
                  originalRotationZ: obj.rotationZ,
                  originalWidth: obj.width,
                  originalHeight: obj.height,
                  originalDepth: obj.depth
                }));

                // First, assign default variants to single-point elements that don't have them
                elements = elements.map(obj => {
                  const isSinglePointElement = obj.type === 'entrance_door' ||
                                              obj.type === 'exit_door' ||
                                              obj.type === 'staircase' ||
                                              obj.type === 'toilet' ||
                                              obj.type === 'trial_room' ||
                                              obj.type === 'boh' ||
                                              obj.type === 'cash_till';

                  if (isSinglePointElement && !obj.variant) {
                    let defaultBlockName = 'PLACEHOLDER';
                    if (obj.type === 'entrance_door') defaultBlockName = '1500 DOUBLE GLAZING 2';
                    else if (obj.type === 'exit_door') defaultBlockName = 'FIRE EXIT';
                    else if (obj.type === 'staircase') defaultBlockName = 'STAIRCASE';
                    else if (obj.type === 'toilet') defaultBlockName = 'TOILET';
                    else if (obj.type === 'trial_room') defaultBlockName = 'TRIAL ROOM';
                    else if (obj.type === 'boh') defaultBlockName = 'BOH';
                    else if (obj.type === 'cash_till') defaultBlockName = 'CASH TILL';

                    console.log(`[3DViewerModifier] Assigning default variant to ${obj.type}: ${defaultBlockName}`);
                    return {
                      ...obj,
                      variant: defaultBlockName
                    };
                  }
                  return obj;
                });

                // Check if any single-point elements are missing GLB URLs
                const elementsNeedingGlb = elements.filter(obj => {
                  const isSinglePointElement = obj.type === 'entrance_door' ||
                                              obj.type === 'exit_door' ||
                                              obj.type === 'staircase' ||
                                              obj.type === 'toilet' ||
                                              obj.type === 'trial_room' ||
                                              obj.type === 'boh' ||
                                              obj.type === 'cash_till';
                  return isSinglePointElement && !obj.customProperties?.glbUrl && obj.variant;
                });

                if (elementsNeedingGlb.length > 0) {
                  console.log(`[3DViewerModifier] ${elementsNeedingGlb.length} single-point elements missing GLB URLs, fetching from backend...`);

                  // Get unique block names from single-point elements
                  const blockNames = [...new Set(elementsNeedingGlb.map(obj => obj.variant!))];

                  // Fetch GLB URLs
                  loadFixtureGLBs(blockNames).then(glbUrlMap => {
                    console.log(`[3DViewerModifier] Received GLB URLs for block names:`, Array.from(glbUrlMap.keys()));

                    // Update single-point elements with GLB URLs
                    const updatedElements = elements.map(obj => {
                      const isSinglePointElement = obj.type === 'entrance_door' ||
                                                  obj.type === 'exit_door' ||
                                                  obj.type === 'staircase' ||
                                                  obj.type === 'toilet' ||
                                                  obj.type === 'trial_room' ||
                                                  obj.type === 'boh' ||
                                                  obj.type === 'cash_till';

                      if (isSinglePointElement && obj.variant && !obj.customProperties?.glbUrl) {
                        const glbUrl = glbUrlMap.get(obj.variant);
                        if (glbUrl) {
                          console.log(`[3DViewerModifier] Adding GLB URL for ${obj.type} ${obj.id} (${obj.variant}): ${glbUrl}`);
                          return {
                            ...obj,
                            customProperties: {
                              ...obj.customProperties,
                              glbUrl: glbUrl
                            }
                          };
                        } else {
                          console.warn(`[3DViewerModifier] No GLB URL found for ${obj.type} variant: ${obj.variant}`);
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

          // Exclude deleted fixtures (keyed by _stableId)
          return !deletedFixtures.has(location._stableId);
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
              _stableId: '',  // Placeholder — ensureStableId fills this after load
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

          // First time loading: assign _stableId to every fixture and use CSV data (without doors)
          const newData = finalDataWithGLBs.map(loc => ensureStableId(loc));
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
          showFixtureArea={showFixtureArea}
          editMode={editMode}
          editFloorplatesMode={editFloorplatesMode}
          setSpawnPointMode={setSpawnPointMode}
          hierarchyDefMode={hierarchyDefMode}
          hierarchySequenceCount={hierarchySequence.length}
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
          clipboardState={clipboardState}
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
          onShowFixtureAreaChange={setShowFixtureArea}
          onEditModeChange={handleEditModeChange}
          onSetSpawnPointModeChange={setSetSpawnPointMode}
          onHierarchyDefModeChange={handleHierarchyDefModeChange}
          onAcceptHierarchySequence={handleAcceptHierarchySequence}
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
          onPaste={handlePaste}
          floorHeight={(() => {
            const f = selectedFloorFile || selectedFile;
            const m = f?.name.match(/floor[_-]?(\d+)/i) || f?.name.match(/(\d+)/i);
            return floorHeights.get(m ? parseInt(m[1]) : 0) ?? '9ft';
          })()}
          fixtureStyle={fixtureStyle}
          onFloorHeightChange={(v) => {
            const f = selectedFloorFile || selectedFile;
            const m = f?.name.match(/floor[_-]?(\d+)/i) || f?.name.match(/(\d+)/i);
            const idx = m ? parseInt(m[1]) : 0;
            setFloorHeights(prev => { const next = new Map(prev); next.set(idx, v); return next; });
          }}
          onFixtureStyleChange={setFixtureStyle}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
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
          showFixtureArea={showFixtureArea}
          selectedLocations={selectedLocations}
          architecturalObjects={architecturalObjects}
          isAddingObject={isAddingObject}
          currentObjectType={currentObjectType}
          objectPlacementPoint={objectPlacementPoint}
          selectedObject={selectedObject}
          selectedObjects={selectedObjects}
          onFloorClickForObjectPlacement={handleFloorClickForObjectPlacement}
          onObjectClick={handleObjectClick}
          onObjectPositionChange={handleObjectPositionChange}
          onMultiObjectPositionChange={handleMultiObjectPositionChange}
          onCancelAddObject={handleCancelAddObject}
          setSpawnPointMode={setSpawnPointMode}
          spawnPoints={spawnPoints}
          onFloorClickForSpawnPoint={handleFloorClickForSpawnPoint}
          hierarchyDefMode={hierarchyDefMode}
          hierarchySequence={hierarchySequence}
          hierarchySequenceMap={hierarchySequenceMap}
          onClearHierarchySequence={handleClearHierarchySequence}
          isMeasuring={isMeasuring}
          measurementPoints={measurementPoints}
          onFloorClickForMeasurement={handleFloorClickForMeasurement}
          onBoundsCalculated={handleBoundsCalculated}
          onGLBError={handleGLBError}
          onFixtureClick={handleFixtureClickWithObjectClear}
          isLocationSelected={isLocationSelected}
          onPositionChange={handlePositionChange}
          onRotationChange={handleGizmoRotationChange}
          onMultiPositionChange={handleMultiPositionChange}
          onFloorPlateClick={handleFloorPlateClick}
          onPointerMissed={handlePointerMissed}
          setIsTransforming={handleSetIsTransforming}
          onOrbitTargetUpdate={handleOrbitTargetUpdate}
          pipelineVersion={pipelineVersion}
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
            onCopyFixtures={(locations) => {
              const success = copyFixtures(locations, jobId || undefined);
              if (success) showNotification(`${locations.length} fixture${locations.length > 1 ? 's' : ''} copied`);
            }}
            onDeleteFixtures={handleDeleteFixtures}
            onMergeFixtures={handleMergeFixtures}
            canMergeFixtures={canMergeFixtures}
            onCountChange={handleFixtureCountChangeMulti}
            availableFloorIndices={availableFloorIndices}
            floorNames={floorNames}
            floorDisplayOrder={floorDisplayOrder}
            onAlignFixtures={handleAlignFixtures}
            onOpenTypeModal={() => {
              setIsMultiTypeEdit(true);
              setFixtureTypeModalOpen(true);
            }}
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

            }}
          />
        )}

        {/* Show MultiObjectInfoPanel when multiple architectural objects are selected */}
        {selectedObjects.length > 1 && !editFloorplatesMode && (
          <MultiObjectInfoPanel
            selectedObjects={selectedObjects}
            editMode={editMode}
            floorNames={floorNames}
            onClose={() => {
              setSelectedObjectIds([]);
              setSelectedObjectId(null);
            }}
            onCopyObjects={(objects) => {
              const success = copyArchObjects(objects, jobId || undefined);
              if (success) showNotification(`${objects.length} architectural object${objects.length > 1 ? 's' : ''} copied`);
            }}
            onDeleteObjects={(objects) => {
              // Delete multiple objects
              const objectIds = objects.map(obj => obj.id);
              setArchitecturalObjects(prev => prev.filter(obj => !objectIds.includes(obj.id)));
              setSelectedObjectIds([]);
              setSelectedObjectId(null);
            }}
          />
        )}

        {/* Show ObjectInfoPanel when a single architectural object is selected */}
        {selectedObject && selectedObjects.length <= 1 && (
          <ObjectInfoPanel
            selectedObject={selectedObject}
            editMode={editMode}
            onClose={() => setSelectedObjectId(null)}
            onRotate={handleObjectRotate}
            onHeightChange={handleObjectHeightChange}
            onPositionChange={handleObjectPointsChange}
            onSinglePointPositionChange={handleSinglePointPositionChange}
            onCopyObject={(object) => {
              const success = copyArchObjects([object], jobId || undefined);
              if (success) showNotification('1 architectural object copied');
            }}
            onVariantChange={handleObjectVariantChange}
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
            onCloseLocation={() => setSelectedLocationId(null)}
            onCloseFloorPlate={() => setSelectedFloorPlate(null)}
            onOpenFixtureTypeModal={() => setFixtureTypeModalOpen(true)}
            onOpenBrandModal={() => setBrandModalOpen(true)}
            onRotateFixture={handleRotateFixture}
            onResetLocation={handleResetPosition}
            onResetFloorPlate={handleResetFloorPlate}
            onCopyFixture={(location) => {
              const success = copyFixtures([location], jobId || undefined);
              if (success) showNotification('1 fixture copied');
            }}
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

            }}
            availableFloorIndices={availableFloorIndices}
            floorNames={floorNames}
            floorDisplayOrder={floorDisplayOrder}
            locationData={locationData}
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
        pipelineVersion={pipelineVersion}
      />
      
      {/* Fixture Type Selection Modal - used for changing and adding fixtures */}
      <FixtureTypeSelectionModal
        open={fixtureTypeModalOpen || addFixtureModalOpen}
        onOpenChange={(open) => {
          setFixtureTypeModalOpen(open);
          setAddFixtureModalOpen(open);
          if (!open) {
            setIsAddingFixture(false);
            setIsMultiTypeEdit(false);
          }
        }}
        currentType={isAddingFixture ? '' : isMultiTypeEdit
          ? (selectedLocations.every(loc => fixtureTypeMap.current.get(loc.blockName) === fixtureTypeMap.current.get(selectedLocations[0].blockName))
              ? (fixtureTypeMap.current.get(selectedLocations[0].blockName) || '')
              : '')
          : (selectedLocation ? (fixtureTypeMap.current.get(selectedLocation.blockName) || 'Unknown') : '')
        }
        availableTypes={fixtureTypes}
        onTypeSelect={(type) => {
          if (isAddingFixture) {
            handleAddFixture(type);
          } else if (isMultiTypeEdit) {
            handleMultiFixtureTypeChange(type);
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

      {/* Variant Selection Modal for Architectural Objects */}
      {pendingArchObjectType && (
        <VariantSelectionModal
          open={archObjectVariantModalOpen}
          onOpenChange={setArchObjectVariantModalOpen}
          fixtureType={getFixtureTypeForArchObject(pendingArchObjectType)}
          currentVariant=""
          onVariantSelect={handleArchObjectVariantSelect}
          pipelineVersion={pipelineVersion}
          onBack={() => {
            // Close variant modal and go back to object selection
            setArchObjectVariantModalOpen(false);
            setPendingArchObjectType(null);
            setAddObjectModalOpen(true);
          }}
        />
      )}

      {/* Variant Selection Modal for Regular Fixtures */}
      {pendingFixtureType && (
        <VariantSelectionModal
          open={fixtureVariantModalOpen}
          onOpenChange={setFixtureVariantModalOpen}
          fixtureType={pendingFixtureType}
          currentVariant=""
          onVariantSelect={handleFixtureVariantSelect}
          pipelineVersion={pipelineVersion}
          onBack={() => {
            // Close variant modal and go back to fixture type selection
            setFixtureVariantModalOpen(false);
            setPendingFixtureType(null);
            setAddFixtureModalOpen(true);
          }}
        />
      )}

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
                onChange={(e) => {
                  setSaveEntity(e.target.value);
                  // Reset store selection if current store doesn't match new entity
                  setSaveStoreId('');
                  setSaveStoreName('');
                  setStoreSearch('');
                }}
                className="w-full px-3 py-2 rounded border border-border bg-background"
              >
                <option value="" disabled>Select entity…</option>
                <option value="trends">Trends</option>
                <option value="tst">TST</option>
                <option value="trends-extension">Trends Extension</option>
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
                <div ref={storeDropdownRef} className="relative">
                  <input
                    type="text"
                    value={storeSearch}
                    onChange={(e) => {
                      setStoreSearch(e.target.value);
                      setSaveStoreId('');
                      setShowStoreDropdown(true);
                    }}
                    onFocus={() => setShowStoreDropdown(true)}
                    placeholder="Search store ID or name…"
                    className="w-full px-3 py-2 rounded border border-border bg-background"
                  />
                  {showStoreDropdown && filteredStores.length > 0 && (
                    <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded border border-border bg-background shadow-md text-sm">
                      {filteredStores.map((store) => {
                        const displayName = store.nocName || store.sapName || store.storeName || '';
                        return (
                          <li
                            key={store.storeCode}
                            onMouseDown={() => handleStoreSelection(store.storeCode)}
                            className="px-3 py-2 cursor-pointer hover:bg-accent"
                          >
                            <span className="font-mono">{store.storeCode}</span>
                            {displayName && <span className="ml-2 text-muted-foreground">{displayName}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {showStoreDropdown && storeSearch.trim() && filteredStores.length === 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded border border-border bg-background shadow-md px-3 py-2 text-sm text-muted-foreground">
                      No stores found
                    </div>
                  )}
                </div>
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

      {/* Paste Confirmation Dialog */}
      {pasteValidationResult && (
        <PasteConfirmationDialog
          open={showPasteConfirmDialog}
          onOpenChange={setShowPasteConfirmDialog}
          validationResult={pasteValidationResult}
          itemCount={clipboardState.itemCount}
          onConfirm={() => {
            const clipboardData = getClipboardData();
            if (clipboardData) {
              executePaste(clipboardData, { targetFloorIndex: currentFloor });
            }
          }}
        />
      )}

      {/* Validation Error Dialog */}
      <ValidationErrorDialog
        open={showValidationErrorDialog}
        onOpenChange={setShowValidationErrorDialog}
        errors={validationErrors}
      />

      {/* Clipboard Notification */}
      {notification && (
        <ClipboardNotification
          message={notification.message}
          type={notification.type}
        />
      )}
    </div>
  );
}


