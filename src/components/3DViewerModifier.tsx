import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, Suspense, Component, useRef, useMemo, useCallback, memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Grid, Text, TransformControls } from '@react-three/drei';
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

interface LocationData {
  blockName: string;
  floorIndex: number;
  posX: number;
  posY: number;
  posZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  brand: string;
  glbUrl?: string; // Will be populated from API
  _updateTimestamp?: number; // Used to force re-renders when GLB URL changes
}

interface LocationSphereProps {
  location: LocationData;
  color?: string;
  onClick?: (location: LocationData, event?: any) => void;
  isSelected?: boolean;
}

function LocationSphere({ location, color = "#ff6b6b", onClick, isSelected }: LocationSphereProps) {
  return (
    <group position={[location.posX, location.posZ, -location.posY]}>
      <mesh onClick={(event) => {
        event.stopPropagation();
        onClick?.(location, {
          shiftKey: event.nativeEvent.shiftKey,
          metaKey: event.nativeEvent.metaKey,
          ctrlKey: event.nativeEvent.ctrlKey
        });
      }}>
        <sphereGeometry args={[0.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
      
      {/* Red bounding box when selected */}
      {isSelected && (
        <lineSegments renderOrder={999}>
          <edgesGeometry args={[new THREE.BoxGeometry(0.5, 0.5, 0.5)]} />
          <lineBasicMaterial color="red" />
        </lineSegments>
      )}
    </group>
  );
}

interface LocationGLBProps {
  location: LocationData;
  onError?: (blockName: string, url: string) => void;
  onClick?: (location: LocationData, event?: any) => void;
  isSelected?: boolean;
  editMode?: boolean;
  isSingleSelection?: boolean;
  onPositionChange?: (location: LocationData, newPosition: [number, number, number]) => void;
  movedFixtures?: Map<string, { originalPosition: [number, number, number], newPosition: [number, number, number] }>;
  rotatedFixtures?: Map<string, { originalRotation: [number, number, number], rotationOffset: number }>;
  modifiedFixtureBrands?: Map<string, { originalBrand: string, newBrand: string }>;
  modifiedFixtures?: Map<string, { originalType: string, newType: string, newGlbUrl: string }>;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
}

const LocationGLB = memo(function LocationGLB({ location, onClick, isSelected, editMode = false, isSingleSelection = false, onPositionChange, movedFixtures, rotatedFixtures, modifiedFixtureBrands, modifiedFixtures, onTransformStart, onTransformEnd }: LocationGLBProps) {
  // This component should only be called when location.glbUrl exists
  // Calculate bounding box once when GLB loads
  const [boundingBox, setBoundingBox] = useState({ size: [1, 1, 1], center: [0, 0.5, 0] });
  
  // Handle GLB URL changes (for fixture type changes) - force reload
  const [currentGlbUrl, setCurrentGlbUrl] = useState<string | undefined>(location.glbUrl);
  const prevGlbUrl = useRef(location.glbUrl);
  
  useEffect(() => {
    if (prevGlbUrl.current !== location.glbUrl && prevGlbUrl.current) {
      // Clear old cache and force reload
      useGLTF.clear(prevGlbUrl.current);
      setCurrentGlbUrl(undefined); // Force unmount
      setTimeout(() => setCurrentGlbUrl(location.glbUrl), 10); // Remount with new URL
    } else if (!currentGlbUrl) {
      setCurrentGlbUrl(location.glbUrl);
    }
    prevGlbUrl.current = location.glbUrl;
  }, [location.glbUrl, currentGlbUrl]);
  
  if (!currentGlbUrl) return null; // Don't render during URL transition
  
  const gltfResult = useGLTF(currentGlbUrl);
  const scene = gltfResult?.scene;
  
  // If no scene loaded yet, return null (let Suspense handle loading)
  if (!scene) {
    return null;
  }
    
    const groupRef = useRef<THREE.Group>(null);
    
    // Memoize expensive calculations and lookups
    const memoizedData = useMemo(() => {
      const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      const movedData = movedFixtures?.get(key);
      const rotatedData = rotatedFixtures?.get(key);
      const brandData = modifiedFixtureBrands?.get(key);
      const fixtureTypeData = modifiedFixtures?.get(key);
      
      const currentPosition = movedData 
        ? [movedData.newPosition[0], movedData.newPosition[2], -movedData.newPosition[1]] 
        : [location.posX, location.posZ, -location.posY];
      
      const rotationX = (location.rotationX * Math.PI) / 180;
      const rotationY = (location.rotationY * Math.PI) / 180;
      const rotationZ = (location.rotationZ * Math.PI) / 180;
      
      const additionalYRotation = rotatedData ? (rotatedData.rotationOffset * Math.PI) / 180 : 0;
      
      return {
        key,
        movedData,
        rotatedData,
        brandData,
        fixtureTypeData,
        currentPosition: currentPosition as [number, number, number],
        rotationX,
        rotationY,
        rotationZ,
        additionalYRotation
      };
    }, [location, movedFixtures, rotatedFixtures, modifiedFixtureBrands, modifiedFixtures]);
    
    const { movedData, rotatedData, brandData, fixtureTypeData, currentPosition, rotationX, rotationY, rotationZ, additionalYRotation } = memoizedData;
    
    // Calculate bounding box when scene loads or rotation changes
    useEffect(() => {
      if (scene) {
        const clonedScene = scene.clone();
        
        // Apply base rotation
        clonedScene.rotation.set(
          (location.rotationX * Math.PI) / 180,
          (location.rotationZ * Math.PI) / 180,
          (location.rotationY * Math.PI) / 180
        );
        
        // Apply additional Y rotation if present
        if (additionalYRotation !== 0) {
          clonedScene.rotateY(additionalYRotation);
        }
        
        clonedScene.updateMatrixWorld(true);
        
        const box = new THREE.Box3().setFromObject(clonedScene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        setBoundingBox({ 
          size: [size.x, size.y, size.z], 
          center: [center.x, center.y, center.z] 
        });
      }
    }, [scene, additionalYRotation]); // Now depends on both scene and rotation changes
    
    const handleTransformChange = () => {
      if (groupRef.current && onPositionChange) {
        const newPosition = groupRef.current.position;
        onPositionChange(location, [newPosition.x, -newPosition.z, newPosition.y]);
      }
    };
    
    return (
      <>
        <group ref={groupRef} position={currentPosition as [number, number, number]}>
          {additionalYRotation !== 0 ? (
            <group rotation={[0, additionalYRotation, 0]}>
              <primitive 
                object={scene.clone()} 
                rotation={[rotationX, rotationZ, rotationY]}
                scale={[1, 1, 1]}
              />
            </group>
          ) : (
            <primitive 
              object={scene.clone()} 
              rotation={[rotationX, rotationZ, rotationY]}
              scale={[1, 1, 1]}
            />
          )}
          {/* Transparent bounding box for clicking */}
          <mesh
            onClick={(event) => {
              event.stopPropagation();
              onClick?.(location, {
                shiftKey: event.nativeEvent.shiftKey,
                metaKey: event.nativeEvent.metaKey,
                ctrlKey: event.nativeEvent.ctrlKey
              });
            }}
            position={boundingBox.center as [number,number,number]}
          >
            <boxGeometry args={boundingBox.size as [number,number,number]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          
          {/* Yellow edge outline for brand-modified or fixture-type-modified fixtures - use calculated bounding box */}
          {(brandData || fixtureTypeData) && !isSelected && !movedData && !rotatedData && (
            <lineSegments position={boundingBox.center as [number,number,number]} renderOrder={997}>
              <edgesGeometry args={[new THREE.BoxGeometry(...boundingBox.size)]} />
              <lineBasicMaterial color="yellow" />
            </lineSegments>
          )}
          
          {/* Orange edge outline for moved/rotated fixtures - use calculated bounding box */}
          {(movedData || rotatedData) && !isSelected && (
            <lineSegments position={boundingBox.center as [number,number,number]} renderOrder={998}>
              <edgesGeometry args={[new THREE.BoxGeometry(...boundingBox.size)]} />
              <lineBasicMaterial color="orange" />
            </lineSegments>
          )}
          
          {/* Red edge outline when selected - use calculated bounding box */}
          {isSelected && (
            <lineSegments position={boundingBox.center as [number,number,number]} renderOrder={999}>
              <edgesGeometry args={[new THREE.BoxGeometry(...boundingBox.size)]} />
              <lineBasicMaterial color="red" />
            </lineSegments>
          )}
        </group>
        
        {/* Transform controls for editing mode - only show for single selection */}
        {editMode && isSelected && groupRef.current && isSingleSelection && (
          <TransformControls
            object={groupRef.current}
            mode="translate"
            space="world"
            showY={false}
            onObjectChange={handleTransformChange}
            onMouseDown={onTransformStart}
            onMouseUp={onTransformEnd}
          />
        )}
      </>
    );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  const prevKey = `${prevProps.location.blockName}-${prevProps.location.posX}-${prevProps.location.posY}-${prevProps.location.posZ}`;
  const nextKey = `${nextProps.location.blockName}-${nextProps.location.posX}-${nextProps.location.posY}-${nextProps.location.posZ}`;
  
  // Check if the specific fixture data changed
  const prevMovedData = prevProps.movedFixtures?.get(prevKey);
  const nextMovedData = nextProps.movedFixtures?.get(nextKey);
  const prevRotatedData = prevProps.rotatedFixtures?.get(prevKey);
  const nextRotatedData = nextProps.rotatedFixtures?.get(nextKey);
  const prevBrandData = prevProps.modifiedFixtureBrands?.get(prevKey);
  const nextBrandData = nextProps.modifiedFixtureBrands?.get(nextKey);
  
  return (
    prevProps.location.blockName === nextProps.location.blockName &&
    prevProps.location.posX === nextProps.location.posX &&
    prevProps.location.posY === nextProps.location.posY &&
    prevProps.location.posZ === nextProps.location.posZ &&
    prevProps.location.rotationX === nextProps.location.rotationX &&
    prevProps.location.rotationY === nextProps.location.rotationY &&
    prevProps.location.rotationZ === nextProps.location.rotationZ &&
    prevProps.location.glbUrl === nextProps.location.glbUrl &&
    prevProps.location._updateTimestamp === nextProps.location._updateTimestamp &&
    prevProps.editMode === nextProps.editMode &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isSingleSelection === nextProps.isSingleSelection &&
    JSON.stringify(prevMovedData) === JSON.stringify(nextMovedData) &&
    JSON.stringify(prevRotatedData) === JSON.stringify(nextRotatedData) &&
    JSON.stringify(prevBrandData) === JSON.stringify(nextBrandData) &&
    JSON.stringify(prevProps.modifiedFixtures?.get(prevKey)) === JSON.stringify(nextProps.modifiedFixtures?.get(nextKey))
  );
});

interface GLBModelProps {
  file: ExtractedFile;
  onBoundsCalculated?: (center: [number, number, number], size: [number, number, number]) => void;
}

function GLBModel({ file, onBoundsCalculated }: GLBModelProps) {
  const gltf = useGLTF(file.url);
  
  useEffect(() => {
    if (gltf?.scene) {
      // Make all meshes in the floor GLB non-interactive
      gltf.scene.traverse((child: any) => {
        if (child.isMesh) {
          child.userData.interactive = false;
        }
      });
      
      // Calculate bounding box once for camera positioning
      if (onBoundsCalculated) {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        onBoundsCalculated([center.x, center.y, center.z], [size.x, size.y, size.z]);
      }
    }
  }, [gltf, onBoundsCalculated]);
  
  // Cleanup function to clear cache when component unmounts
  useEffect(() => {
    return () => {
      useGLTF.clear(file.url);
    };
  }, [file.url]);
  
  if (!gltf?.scene) {
    return null;
  }
  
  return <primitive object={gltf.scene.clone()} />;
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

// Helper functions for backward compatibility (kept for potential future use)
// function isUnassignedBrand(brand: string): boolean {
//   return getBrandCategory(brand) === 'oth';
// }

// function isArchBrand(brand: string): boolean {
//   return getBrandCategory(brand) === 'arx';
// }

// Generate consistent colors for brands
function getBrandColor(brand: string): number {
  const category = getBrandCategory(brand);
  
  switch (category) {
    case 'oth': return 0xff0000; // Red for unassigned/OTH-
    case 'arx': return 0x808080; // Gray for arch/ARX-
    case 'pvl': return 0x4169e1; // Royal Blue for Private Label
    case 'ext': return 0x32cd32; // Lime Green for External brands
    case 'gen': return 0xffa500; // Orange for General retail
    case 'legacy':
    default:
      // For legacy brands without prefixes, use hash-based colors
      let hash = 5381; // djb2 hash initial value
      for (let i = 0; i < brand.length; i++) {
        hash = ((hash << 5) + hash) + brand.charCodeAt(i); // hash * 33 + c
      }
      
      // Use a diverse color palette for legacy brands
      const legacyColors = [
        0x00ff00, // Green
        0x0000ff, // Blue  
        0xff00ff, // Magenta
        0xffff00, // Yellow
        0x00ffff, // Cyan
        0x800080, // Purple
        0xffc0cb, // Pink
        0xa52a2a, // Brown
        0x90ee90, // Light Green
        0x87ceeb, // Sky Blue
        0xdda0dd, // Plum
        0xff6347, // Tomato
        0xda70d6, // Orchid
        0xff1493, // Deep Pink
        0x00ced1, // Dark Turquoise
        0xffd700, // Gold
        0x9370db, // Medium Purple
        0x20b2aa, // Light Sea Green
        0xff4500, // Orange Red
        0x7b68ee, // Medium Slate Blue
        0x48d1cc, // Medium Turquoise
      ];
      
      return legacyColors[Math.abs(hash) % legacyColors.length];
  }
}

interface ShatteredFloorModelProps {
  file: ExtractedFile;
  floorPlatesData: Record<string, any[]>;
  onBoundsCalculated?: (center: [number, number, number], size: [number, number, number]) => void;
  onFloorPlateClick?: (plateData: any) => void;
  showWireframe?: boolean;
  modifiedFloorPlates?: Map<string, any>;
}

function ShatteredFloorModel({ file, floorPlatesData, onBoundsCalculated, onFloorPlateClick, showWireframe = false, modifiedFloorPlates }: ShatteredFloorModelProps) {
  const gltf = useGLTF(file.url);
  const [floorPlateMeshes, setFloorPlateMeshes] = useState<any[]>([]);
  
  useEffect(() => {
    if (gltf?.scene) {
      const meshes: any[] = [];
      const brandColorMap = new Map<string, number>();
      
      // Collect all unique brands from CSV data first  
      Object.keys(floorPlatesData).forEach(brand => {
        if (brand && !brandColorMap.has(brand)) {
          const color = getBrandColor(brand);
          brandColorMap.set(brand, color);
        }
      });
      
      // Process floor plate meshes
      gltf.scene.traverse((child: any) => {
        if (child.isMesh && child.name.startsWith('floorplate_')) {
          child.userData.interactive = true;
          
          // Recompute bounding box for this mesh after loading
          child.geometry.computeBoundingBox();
          child.geometry.computeBoundingSphere();
          
          // Find the CSV data for this mesh
          let surfaceData = null;
          let brand = 'unknown';
          
          // Search through brand data to find this mesh
          for (const [brandName, surfaces] of Object.entries(floorPlatesData)) {
            const found = surfaces.find((surface: any) => surface.meshName === child.name);
            if (found) {
              surfaceData = found;
              brand = brandName;
              break;
            }
          }
          
          // Set user data
          if (surfaceData) {
            child.userData = { 
              ...child.userData, 
              ...surfaceData,
              brand: brand,
              meshName: child.name
            };
          } else {
            // Fallback - extract from mesh name
            const parts = child.name.split('_');
            brand = parts[1] || 'unknown';
            child.userData = {
              ...child.userData,
              brand: brand,
              meshName: child.name,
              surfaceId: parts[2] || 'unknown',
              area: 0,
              centroid: [0, 0, 0]
            };
          }
          
          // Check for modified brand
          const modifiedData = modifiedFloorPlates?.get(child.name);
          if (modifiedData) {
            child.userData = { ...child.userData, ...modifiedData };
          }
          
          // Apply brand color
          const brandColor = brandColorMap.get(child.userData.brand) || getBrandColor(child.userData.brand);
          
          if (child.material) {
            // Create new material with color and wireframe support
            const newMat = new THREE.MeshStandardMaterial({ 
              color: brandColor,
              wireframe: showWireframe
            });
            child.material = newMat;
          }
          
          // Store mesh for clickable overlays
          meshes.push(child);
        }
      });
      
      setFloorPlateMeshes(meshes);
      
      // Calculate bounding box once for camera positioning
      if (onBoundsCalculated) {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        onBoundsCalculated([center.x, center.y, center.z], [size.x, size.y, size.z]);
      }
    }
  }, [gltf, floorPlatesData, onBoundsCalculated, modifiedFloorPlates]);
  
  // Cleanup function to clear cache when component unmounts
  useEffect(() => {
    return () => {
        useGLTF.clear(file.url);
    };
  }, [file.url]);
  
  if (!gltf?.scene) {
    return null;
  }
  
  return (
    <>
      <primitive object={gltf.scene} />
      
      {/* Add clickable overlays - use floorPlateMeshes (meshes that had CSV matches) */}
      {floorPlateMeshes.map((mesh, index) => (
        <mesh
          key={`${mesh.name || `mesh-${index}`}-clickable`}
          geometry={mesh.geometry}
          position={[mesh.position.x, mesh.position.y + 0.01, mesh.position.z]}
          rotation={[mesh.rotation.x, mesh.rotation.y, mesh.rotation.z]}
          scale={[mesh.scale.x, mesh.scale.y, mesh.scale.z]}
          onClick={(event) => {
            if (event.face && onFloorPlateClick) {
              event.stopPropagation();
              onFloorPlateClick(mesh.userData);
            }
          }}
        >
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[2, 0.1, 2]} />
      <meshStandardMaterial color="gray" />
    </mesh>
  );
}

function ErrorFallback() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[4, 0.2, 4]} />
        <meshStandardMaterial color="red" />
      </mesh>
      <Text
        position={[0, 1, 0]}
        fontSize={0.5}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        Failed to load 3D model
      </Text>
    </group>
  );
}

class ModelErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('GLB Model Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
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
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<LocationData[]>([]);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([10, 10, 10]);
  const [orbitTarget, setOrbitTarget] = useState<[number, number, number]>([0, 0, 0]);
  const [failedGLBs, setFailedGLBs] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editFloorplatesMode, setEditFloorplatesMode] = useState(false);
  const [movedFixtures, setMovedFixtures] = useState<Map<string, { originalPosition: [number, number, number], newPosition: [number, number, number] }>>(new Map());
  const [rotatedFixtures, setRotatedFixtures] = useState<Map<string, { originalRotation: [number, number, number], rotationOffset: number }>>(new Map());
  const [isTransforming, setIsTransforming] = useState(false);
  const [floorPlatesData, setFloorPlatesData] = useState<Record<string, Record<string, any[]>>>({});
  const [selectedFloorFile, setSelectedFloorFile] = useState<ExtractedFile | null>(null); // The floor selected in dropdown
  const [selectedFloorPlate, setSelectedFloorPlate] = useState<any | null>(null); // Selected floor plate data
  const [showWireframe, setShowWireframe] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [modifiedFloorPlates, setModifiedFloorPlates] = useState<Map<string, any>>(new Map());
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [fixtureTypeModalOpen, setFixtureTypeModalOpen] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [modifiedFixtures, setModifiedFixtures] = useState<Map<string, { originalType: string, newType: string, newGlbUrl: string }>>(new Map());
  const [modifiedFixtureBrands, setModifiedFixtureBrands] = useState<Map<string, { originalBrand: string, newBrand: string }>>(new Map());
  const [, setBrandCategories] = useState<BrandCategoriesResponse | null>(null);
  const [fixtureCache, setFixtureCache] = useState<Map<string, string>>(new Map());
  const [fixtureTypes, setFixtureTypes] = useState<string[]>([]);
  const [selectedFixtureType, setSelectedFixtureType] = useState<string>('all');
  const [fixtureTypeMap, setFixtureTypeMap] = useState<Map<string, string>>(new Map());
  const [deletedFixtures, setDeletedFixtures] = useState<Set<string>>(new Set());
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [fixturesToDelete, setFixturesToDelete] = useState<LocationData[]>([]);

  // Handle multi-select functionality
  const handleFixtureClick = useCallback((clickedLocation: LocationData, event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
    if (editFloorplatesMode) return;
    
    const isMultiSelect = event?.shiftKey || event?.metaKey || event?.ctrlKey;
    
    if (isMultiSelect) {
      setSelectedLocations(prev => {
        // Include current single selection if we're transitioning from single to multi
        const currentSelections = prev.length === 0 && selectedLocation ? [selectedLocation] : prev;
        
        const isAlreadySelected = currentSelections.some(loc => 
          loc.blockName === clickedLocation.blockName &&
          Math.abs(loc.posX - clickedLocation.posX) < 0.001 &&
          Math.abs(loc.posY - clickedLocation.posY) < 0.001 &&
          Math.abs(loc.posZ - clickedLocation.posZ) < 0.001
        );
        
        if (isAlreadySelected) {
          // Remove from selection
          const newSelection = currentSelections.filter(loc => !(loc.blockName === clickedLocation.blockName &&
            Math.abs(loc.posX - clickedLocation.posX) < 0.001 &&
            Math.abs(loc.posY - clickedLocation.posY) < 0.001 &&
            Math.abs(loc.posZ - clickedLocation.posZ) < 0.001));
          
          return newSelection;
        } else {
          // Add to selection
          const newSelection = [...currentSelections, clickedLocation];
          return newSelection;
        }
      });
      
      // Update selectedLocation based on new selection state
      setSelectedLocation(null); // Will be updated by useEffect
    } else {
      // Single select
      setSelectedLocations([clickedLocation]);
      setSelectedLocation(clickedLocation);
    }
  }, [editFloorplatesMode, selectedLocation]);

  // Check if a location is selected (check selectedLocations array as single source of truth)
  const isLocationSelected = useCallback((location: LocationData) => {
    return selectedLocations.some(loc => 
      loc.blockName === location.blockName &&
      Math.abs(loc.posX - location.posX) < 0.001 &&
      Math.abs(loc.posY - location.posY) < 0.001 &&
      Math.abs(loc.posZ - location.posZ) < 0.001
    );
  }, [selectedLocations]);

  // Clear all selections
  const clearSelections = useCallback(() => {
    setSelectedLocation(null);
    setSelectedLocations([]);
  }, []);
  
  // Sync selectedLocation with selectedLocations array
  useEffect(() => {
    if (selectedLocations.length === 1) {
      setSelectedLocation(selectedLocations[0]);
    } else if (selectedLocations.length > 1) {
      setSelectedLocation(null);
    } else {
      setSelectedLocation(null);
    }
  }, [selectedLocations]);


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

  const handlePositionChange = useCallback((location: LocationData, newPosition: [number, number, number]) => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    setMovedFixtures(prev => {
      // Only create new Map if the value actually changed
      const existing = prev.get(key);
      const newValue = {
        originalPosition: [location.posX, location.posY, location.posZ] as [number, number, number],
        newPosition: newPosition
      };
      
      // Check if position actually changed to avoid unnecessary updates
      if (existing && 
          existing.newPosition[0] === newPosition[0] &&
          existing.newPosition[1] === newPosition[1] &&
          existing.newPosition[2] === newPosition[2]) {
        return prev; // Return same reference to prevent re-renders
      }
      
      const newMap = new Map(prev);
      newMap.set(key, newValue);
      return newMap;
    });
  }, []);

  const handleRotateFixture = useCallback((degrees: number) => {
    if (!selectedLocation) return;
    
    const key = `${selectedLocation.blockName}-${selectedLocation.posX}-${selectedLocation.posY}-${selectedLocation.posZ}`;
    setRotatedFixtures(prev => {
      const existing = prev.get(key);
      const currentOffset = existing?.rotationOffset || 0;
      let newOffset = currentOffset + degrees;
      
      // Normalize rotation to 0-359 range
      newOffset = ((newOffset % 360) + 360) % 360;
      
      // If rotation is back to 0 (or effectively 0), remove the entry entirely
      if (newOffset === 0 || Math.abs(newOffset - 360) < 0.001) {
        if (!prev.has(key)) return prev; // Already doesn't exist
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      }
      
      // Only create new Map if the value actually changed
      if (existing && existing.rotationOffset === newOffset) {
        return prev; // Return same reference to prevent re-renders
      }
      
      const newMap = new Map(prev);
      newMap.set(key, {
        originalRotation: [selectedLocation.rotationX, selectedLocation.rotationY, selectedLocation.rotationZ],
        rotationOffset: newOffset
      });
      return newMap;
    });
  }, [selectedLocation]);

  const handleMultiRotateFixture = useCallback((degrees: number) => {
    selectedLocations.forEach(location => {
      const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      setRotatedFixtures(prev => {
        const existing = prev.get(key);
        const currentOffset = existing?.rotationOffset || 0;
        let newOffset = currentOffset + degrees;
        
        // Normalize rotation to 0-359 range
        newOffset = ((newOffset % 360) + 360) % 360;
        
        // If rotation is back to 0 (or effectively 0), remove the entry entirely
        if (newOffset === 0 || Math.abs(newOffset - 360) < 0.001) {
          if (!prev.has(key)) return prev; // Already doesn't exist
          const newMap = new Map(prev);
          newMap.delete(key);
          return newMap;
        }
        
        const newMap = new Map(prev);
        newMap.set(key, {
          originalRotation: [location.rotationX, location.rotationY, location.rotationZ],
          rotationOffset: newOffset
        });
        return newMap;
      });
    });
  }, [selectedLocations]);

  const handleResetPosition = useCallback((location: LocationData) => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    
    setMovedFixtures(prev => {
      if (!prev.has(key)) return prev; // No change needed
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
    
    setRotatedFixtures(prev => {
      if (!prev.has(key)) return prev; // No change needed
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
    
    // Reset brand changes
    setModifiedFixtureBrands(prev => {
      if (!prev.has(key)) return prev; // No change needed
      const newMap = new Map(prev);
      const originalBrand = newMap.get(key)?.originalBrand;
      newMap.delete(key);
      // Reset selected location brand to original
      if (originalBrand) {
        setSelectedLocation((prev: any) => prev ? { ...prev, brand: originalBrand } : null);
      }
      return newMap;
    });
    
    // Force re-render by clearing and re-setting selection
    setSelectedLocation(null);
    setTimeout(() => setSelectedLocation(location), 10);
  }, []);

  const handleBrandChange = useCallback((newBrand: string) => {
    if (!selectedFloorPlate) return;
    
    const key = selectedFloorPlate.meshName || `${selectedFloorPlate.surfaceId}-${selectedFloorPlate.brand}`;
    setModifiedFloorPlates(prev => {
      const newMap = new Map(prev);
      newMap.set(key, {
        ...selectedFloorPlate,
        brand: newBrand,
        originalBrand: selectedFloorPlate.originalBrand || selectedFloorPlate.brand
      });
      return newMap;
    });
    
    // Update selected floor plate immediately
    setSelectedFloorPlate((prev: any) => prev ? { ...prev, brand: newBrand } : null);
  }, [selectedFloorPlate]);

  const handleFixtureBrandChange = useCallback((newBrand: string) => {
    // Handle multi-selection
    if (selectedLocations.length > 1) {
      selectedLocations.forEach(location => {
        const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
        setModifiedFixtureBrands(prev => {
          const newMap = new Map(prev);
          newMap.set(key, {
            originalBrand: location.brand,
            newBrand: newBrand
          });
          return newMap;
        });
      });
      
      // Update selected locations immediately
      setSelectedLocations(prev => prev.map(loc => ({ ...loc, brand: newBrand })));
    } else if (selectedLocation) {
      // Handle single selection
      const key = `${selectedLocation.blockName}-${selectedLocation.posX}-${selectedLocation.posY}-${selectedLocation.posZ}`;
      setModifiedFixtureBrands(prev => {
        const newMap = new Map(prev);
        newMap.set(key, {
          originalBrand: selectedLocation.brand,
          newBrand: newBrand
        });
        return newMap;
      });
      
      // Update selected location immediately
      setSelectedLocation((prev: any) => prev ? { ...prev, brand: newBrand } : null);
    }
  }, [selectedLocation, selectedLocations]);

  const handleDuplicateFixture = useCallback((location: LocationData) => {
    // Create a duplicate fixture at a slightly offset position (1 unit in X direction)
    const duplicatedFixture: LocationData = {
      ...location,
      posX: location.posX + 1.0, // Offset by 1 unit in X direction
      blockName: location.blockName, // Keep the same block name initially
      _updateTimestamp: Date.now() // Force re-render
    };
    
    // Add the duplicated fixture to the location data
    setLocationData(prev => [...prev, duplicatedFixture]);
    
    // Clear current selection and select the new duplicated fixture
    setSelectedLocation(duplicatedFixture);
    setSelectedLocations([duplicatedFixture]);
  }, []);

  const handleDeleteFixture = useCallback((location: LocationData) => {
    setFixturesToDelete([location]);
    setDeleteConfirmationOpen(true);
  }, []);

  const handleDeleteFixtures = useCallback((locations: LocationData[]) => {
    setFixturesToDelete(locations);
    setDeleteConfirmationOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    const keysToDelete = new Set<string>();
    
    fixturesToDelete.forEach(location => {
      const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      keysToDelete.add(key);
    });
    
    // Add to deleted fixtures set
    setDeletedFixtures(prev => new Set([...prev, ...keysToDelete]));
    
    // Clear selections
    setSelectedLocation(null);
    setSelectedLocations([]);
    
    // Clear any modifications for deleted fixtures
    setMovedFixtures(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setRotatedFixtures(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setModifiedFixtureBrands(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setModifiedFixtures(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    // Reset state
    setFixturesToDelete([]);
  }, [fixturesToDelete]);

  const handleFixtureTypeChange = useCallback(async (newType: string) => {
    // For now, only support single selection for fixture type changes
    // Multi-selection fixture type changes could be complex due to different GLB URLs
    if (!selectedLocation || selectedLocations.length > 1) return;
    
    try {
      // Get new GLB URL for the fixture type
      const fixtureTypeInfo = await apiService.getFixtureTypeUrl(newType);
      const newGlbUrl = fixtureTypeInfo.glb_url;
      
      // Clear the old GLB from Three.js cache to ensure fresh loading
      const { useGLTF } = await import('@react-three/drei');
      if (selectedLocation.glbUrl) {
        // Clear old GLB from cache
        useGLTF.clear(selectedLocation.glbUrl);
      }
      // Preload new GLB
      useGLTF.preload(newGlbUrl);
      
      // Small delay to ensure cache clearing takes effect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const originalType = fixtureTypeMap.get(selectedLocation.blockName) || 'Unknown';
      const key = `${selectedLocation.blockName}-${selectedLocation.posX}-${selectedLocation.posY}-${selectedLocation.posZ}`;
      
      // Store the modification using both original key and new key (dg2n)
      setModifiedFixtures(prev => {
        const newMap = new Map(prev);
        const newKey = `dg2n-${selectedLocation.posX}-${selectedLocation.posY}-${selectedLocation.posZ}`;
        
        // Store with original key for backwards compatibility
        newMap.set(key, { 
          originalType, 
          newType, 
          newGlbUrl 
        });
        
        // Also store with new key (dg2n blockName) for lookup after blockName change
        newMap.set(newKey, { 
          originalType, 
          newType, 
          newGlbUrl 
        });
        
        return newMap;
      });
      
      // Update the fixture cache with new GLB URL
      setFixtureCache(prev => {
        const newCache = new Map(prev);
        // Use "dg2n" as block name for modified fixtures
        newCache.set("dg2n", newGlbUrl);
        return newCache;
      });
      
      // Update the fixture type map
      setFixtureTypeMap(prev => {
        const newMap = new Map(prev);
        newMap.set("dg2n", newType);
        return newMap;
      });
      
      // Update location data with new GLB URL and dg2n block name
      setLocationData(prev => 
        prev.map(loc => {
          if (loc.blockName === selectedLocation.blockName &&
              Math.abs(loc.posX - selectedLocation.posX) < 0.001 &&
              Math.abs(loc.posY - selectedLocation.posY) < 0.001 &&
              Math.abs(loc.posZ - selectedLocation.posZ) < 0.001) {
            // Create a completely new object to force re-render
            return { 
              ...loc, 
              blockName: "dg2n", 
              glbUrl: newGlbUrl,
              _updateTimestamp: Date.now() // Force React to see this as a new object
            };
          }
          return loc;
        })
      );
      
      // Update selected location
      setSelectedLocation(prev => prev ? { ...prev, blockName: "dg2n", glbUrl: newGlbUrl } : null);
      
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
        const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
        return !deletedFixtures.has(key);
      });
      
      for (const location of currentFloorLocations) {
        try {
          const fixtureGLTF = await new Promise<GLTF>((resolve, reject) => {
            loader.load(location.glbUrl!, resolve, undefined, reject);
          });
          const fixtureModel = fixtureGLTF.scene.clone();
          
          // Apply positioning and rotation
          const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
          const movedData = movedFixtures.get(key);
          const rotatedData = rotatedFixtures.get(key);
          
          // Position
          if (movedData) {
            fixtureModel.position.set(
              movedData.newPosition[0],
              movedData.newPosition[2], 
              -movedData.newPosition[1]
            );
          } else {
            fixtureModel.position.set(location.posX, location.posZ, -location.posY);
          }
          
          // Rotation
          fixtureModel.rotation.set(
            (location.rotationX * Math.PI) / 180,
            (location.rotationZ * Math.PI) / 180,
            (location.rotationY * Math.PI) / 180
          );
          
          if (rotatedData) {
            fixtureModel.rotateY((rotatedData.rotationOffset * Math.PI) / 180);
          }
          
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
  }, [selectedFile, selectedFloorFile, locationData, movedFixtures, rotatedFixtures, deletedFixtures, isExporting]);

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
      await createModifiedLocationMasterCSV(zip);
      
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
  }, [extractedFiles, movedFixtures, rotatedFixtures, modifiedFloorPlates, modifiedFixtures, modifiedFixtureBrands, locationData, deletedFixtures, isExportingZip, jobId]);

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

  const createModifiedLocationMasterCSV = async (zip: JSZip) => {
    
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
      let blockName, posX, posY, posZ, rotationZ;
      try {
        blockName = values[0];
        posX = parseFloat(values[5]) || 0;  // Pos X at index 5
        posY = parseFloat(values[6]) || 0;  // Pos Y at index 6  
        posZ = parseFloat(values[7]) || 0;  // Pos Z at index 7
        rotationZ = parseFloat(values[10]) || 0; // Rotation Z at index 10
      } catch (error) {
        // If parsing fails, keep the original line
        modifiedLines.push(line);
        continue;
      }
      
      // Track original fixtures
      const originalKey = `${blockName}-${posX}-${posY}-${posZ}`;
      originalFixtures.add(originalKey);
      
      // Check if this fixture has been deleted - skip if so
      const key = `${blockName}-${posX}-${posY}-${posZ}`;
      if (deletedFixtures.has(key)) {
        continue; // Skip deleted fixtures
      }
      
      // Check if this location has been moved or rotated
      
      // Try exact match first
      let movedData = movedFixtures.get(key);
      let rotatedData = rotatedFixtures.get(key);
      let brandData = modifiedFixtureBrands.get(key);
      
      // If no exact match, try finding by approximate position match
      if (!movedData && !rotatedData && !brandData) {
        for (const [mapKey, data] of movedFixtures.entries()) {
          const [mapBlockName, mapPosX, mapPosY, mapPosZ] = mapKey.split('-');
          if (mapBlockName === blockName &&
              Math.abs(parseFloat(mapPosX) - posX) < 0.0001 &&
              Math.abs(parseFloat(mapPosY) - posY) < 0.0001 &&
              Math.abs(parseFloat(mapPosZ) - posZ) < 0.0001) {
            movedData = data;
            break;
          }
        }
        
        for (const [mapKey, data] of rotatedFixtures.entries()) {
          const [mapBlockName, mapPosX, mapPosY, mapPosZ] = mapKey.split('-');
          if (mapBlockName === blockName &&
              Math.abs(parseFloat(mapPosX) - posX) < 0.0001 &&
              Math.abs(parseFloat(mapPosY) - posY) < 0.0001 &&
              Math.abs(parseFloat(mapPosZ) - posZ) < 0.0001) {
            rotatedData = data;
            break;
          }
        }
        
        for (const [mapKey, data] of modifiedFixtureBrands.entries()) {
          const [mapBlockName, mapPosX, mapPosY, mapPosZ] = mapKey.split('-');
          if (mapBlockName === blockName &&
              Math.abs(parseFloat(mapPosX) - posX) < 0.0001 &&
              Math.abs(parseFloat(mapPosY) - posY) < 0.0001 &&
              Math.abs(parseFloat(mapPosZ) - posZ) < 0.0001) {
            brandData = data;
            break;
          }
        }
      }
      
      // Update position if moved
      if (movedData) {
        values[5] = movedData.newPosition[0].toFixed(12);  // Pos X (m)
        values[6] = movedData.newPosition[1].toFixed(12);  // Pos Y (m)
        values[7] = movedData.newPosition[2].toFixed(1);   // Pos Z (m)
      }
      
      // Update rotation if rotated
      if (rotatedData) {
        const newRotationZ = rotationZ + rotatedData.rotationOffset;
        values[10] = newRotationZ.toFixed(1); // Rotation Z at index 10
      }
      
      // Update block name if fixture type was changed
      const modifiedFixtureData = modifiedFixtures.get(key);
      if (modifiedFixtureData) {
        values[0] = "dg2n"; // Use dg2n as block name for modified fixtures
        // Note: Fixture Type column doesn't exist in this CSV structure
      }
      
      // Update brand if fixture brand was changed
      if (brandData) {
        // Brand is at index 11 in the CSV structure
        if (values.length > 11) {
          values[11] = brandData.newBrand;
        }
      }
      
      modifiedLines.push(values.join(','));
    }
    
    // Add any duplicated fixtures that weren't in the original CSV
    locationData.forEach(location => {
      const locationKey = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      
      // If this fixture wasn't in the original CSV, it's a duplicate
      if (!originalFixtures.has(locationKey)) {
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
          '1',                          // 12: Count - default to 1
          ''                            // 13: Hierarchy - empty
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
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          
          if (values.length >= 14) {
            const locationItem = {
              blockName: values[0].trim(),
              floorIndex: parseInt(values[1]) || 0,
              posX: parseFloat(values[5]) || 0,   // Pos X (m)
              posY: parseFloat(values[6]) || 0,   // Pos Y (m) 
              posZ: parseFloat(values[7]) || 0,   // Pos Z (m)
              rotationX: parseFloat(values[8]) || 0, // Rotation X (deg)
              rotationY: parseFloat(values[9]) || 0, // Rotation Y (deg)
              rotationZ: parseFloat(values[10]) || 0, // Rotation Z (deg)
              brand: values[11]?.trim() || 'unknown', // Brand is at index 11
              glbUrl: undefined // Will be loaded via API
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
          
          // Find and preserve modified fixtures (those with _updateTimestamp)
          prev.forEach(prevLocation => {
            if (prevLocation._updateTimestamp) {
              const index = newData.findIndex(loc => 
                Math.abs(loc.posX - prevLocation.posX) < 0.001 &&
                Math.abs(loc.posY - prevLocation.posY) < 0.001 &&
                Math.abs(loc.posZ - prevLocation.posZ) < 0.001
              );
              if (index !== -1) {
                newData[index] = prevLocation; // Keep the modified version
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
          fixtureTypes={fixtureTypes}
          selectedFixtureType={selectedFixtureType}
          floorPlatesData={floorPlatesData}
          modifiedFloorPlates={modifiedFloorPlates}
          getBrandCategory={getBrandCategory}
          isExporting={isExporting}
          isExportingZip={isExportingZip}
          movedFixtures={movedFixtures}
          rotatedFixtures={rotatedFixtures}
          modifiedFixtures={modifiedFixtures}
          modifiedFixtureBrands={modifiedFixtureBrands}
          deletedFixtures={deletedFixtures}
          locationData={locationData}
          jobId={jobId}
          onFloorFileChange={handleFloorFileChange}
          onShowSpheresChange={setShowSpheres}
          onFixtureTypeChange={setSelectedFixtureType}
          onShowWireframeChange={setShowWireframe}
          onEditModeChange={handleEditModeChange}
          onDownloadGLB={handleDownloadGLB}
          onDownloadModifiedZip={handleDownloadModifiedZip}
        />
        <Canvas
          camera={{ position: cameraPosition, fov: 50 }}
          shadows
          className="bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800"
          onPointerMissed={() => {
            if (editFloorplatesMode) {
              setSelectedFloorPlate(null);
            } else {
              setSelectedLocations([]);
              setSelectedLocation(null);
            }
          }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[10, 10, 5]} 
            intensity={1} 
            castShadow 
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-10, -10, -10]} intensity={0.3} />
          
          <Environment preset="city" />
          
          <Grid 
            position={[0, -0.01, 0]} 
            args={[50, 50]} 
            cellSize={1} 
            cellThickness={0.5} 
            sectionSize={5} 
            sectionThickness={1} 
            fadeDistance={30} 
            fadeStrength={1} 
          />
          
          <ModelErrorBoundary fallback={<ErrorFallback />}>
            <Suspense fallback={<LoadingFallback />}>
              {selectedFile && (() => {
                // Check if this is a shattered floor file
                const isShatteredFloor = selectedFile.name.includes('dg2n-shattered-floor-plates-');
                
                if (isShatteredFloor && editFloorplatesMode) {
                  // Extract floor number for floor plates data
                  const floorMatch = selectedFile.name.match(/floor[_-]plates[_-](\d+)/i) || selectedFile.name.match(/(\d+)/i);
                  const currentFloor = floorMatch ? floorMatch[1] : '0';
                  const currentFloorPlatesData = floorPlatesData[currentFloor] || {};
                  
                  return (
                    <ShatteredFloorModel 
                      key={selectedFile.url} 
                      file={selectedFile} 
                      floorPlatesData={currentFloorPlatesData}
                      onBoundsCalculated={handleBoundsCalculated}
                      onFloorPlateClick={(plateData) => setSelectedFloorPlate(plateData)}
                      showWireframe={showWireframe}
                      modifiedFloorPlates={modifiedFloorPlates}
                    />
                  );
                }
                
                // Default to regular GLB model
                return (
                  <GLBModel 
                    key={selectedFile.url} 
                    file={selectedFile} 
                    onBoundsCalculated={handleBoundsCalculated} 
                  />
                );
              })()}
            </Suspense>
          </ModelErrorBoundary>
          
          {/* Render location objects (GLBs or spheres) for currently selected floor */}
          {showSpheres && (selectedFloorFile || selectedFile) && locationData.length > 0 && (() => {
            // Extract floor index from the logical floor selection (not the actual GLB being rendered)
            const fileForFloorExtraction = selectedFloorFile || selectedFile;
            const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
            const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;
            
            return locationData
              .filter(location => location.floorIndex === currentFloor)
              .filter(location => {
                // Exclude deleted fixtures
                const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
                return !deletedFixtures.has(key);
              })
              .filter(location => {
                // Apply fixture type filter if not "all"
                if (selectedFixtureType === 'all') return true;
                
                // Use actual fixture type from API response
                const fixtureType = fixtureTypeMap.get(location.blockName);
                return fixtureType === selectedFixtureType;
              })
              .map((location, index) => (
                location.glbUrl ? (
                  <LocationGLB 
                    key={`${location.blockName}-${location.posX.toFixed(6)}-${location.posY.toFixed(6)}-${location.posZ.toFixed(6)}-${location._updateTimestamp || index}`} 
                    location={location}
                    onClick={editFloorplatesMode ? undefined : handleFixtureClick}
                    isSelected={editFloorplatesMode ? false : isLocationSelected(location)}
                    isSingleSelection={selectedLocations.length === 1}
                    onError={handleGLBError}
                    editMode={editMode}
                    onPositionChange={editMode ? handlePositionChange : undefined}
                    movedFixtures={movedFixtures}
                    rotatedFixtures={rotatedFixtures}
                    modifiedFixtureBrands={modifiedFixtureBrands}
                    modifiedFixtures={modifiedFixtures}
                    {...(editMode && {
                      onTransformStart: () => setIsTransforming(true),
                      onTransformEnd: () => setIsTransforming(false)
                    })}
                  />
                ) : (
                  <LocationSphere 
                    key={`${location.blockName}-${index}`} 
                    location={location}
                    color={`hsl(${(index * 137.5) % 360}, 70%, 50%)`}
                    onClick={editFloorplatesMode ? undefined : handleFixtureClick}
                    isSelected={editFloorplatesMode ? false : isLocationSelected(location)}
                  />
                )
              ));
          })()}
          
          <OrbitControls 
            target={orbitTarget}
            enablePan={true} 
            enableZoom={true} 
            enableRotate={true} 
            dampingFactor={0.05}
            rotateSpeed={0.5}
            zoomSpeed={0.5}
            enabled={!isTransforming}
          />
        </Canvas>
        
        {/* Show MultiRightInfoPanel when multiple fixtures are selected */}
        {selectedLocations.length > 1 && !editFloorplatesMode && (
          <MultiRightInfoPanel
            selectedLocations={selectedLocations}
            editMode={editMode}
            movedFixtures={movedFixtures}
            rotatedFixtures={rotatedFixtures}
            modifiedFixtureBrands={modifiedFixtureBrands}
            fixtureTypeMap={fixtureTypeMap}
            onClose={clearSelections}
            onOpenBrandModal={() => setBrandModalOpen(true)}
            onRotateFixture={handleMultiRotateFixture}
            onResetLocation={handleResetPosition}
            onDeleteFixtures={handleDeleteFixtures}
          />
        )}
        
        {/* Show RightInfoPanel for single selection or floor plates */}
        {selectedLocations.length <= 1 && (
          <RightInfoPanel
            selectedLocation={selectedLocation}
            selectedFloorPlate={selectedFloorPlate}
            editMode={editMode}
            editFloorplatesMode={editFloorplatesMode}
            movedFixtures={movedFixtures}
            rotatedFixtures={rotatedFixtures}
            modifiedFixtureBrands={modifiedFixtureBrands}
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