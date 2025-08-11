import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, Suspense, Component, useRef, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Grid, Text, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from "@/shadcn/components/ui/button";
import { Select } from "../components/ui/select";
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiService, type JobStatus } from '../services/api';
import { extractZipFiles, getGlbTitle, cleanupExtractedFiles, type ExtractedFile } from '../utils/zipUtils';

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
  glbUrl?: string;
}

interface LocationSphereProps {
  location: LocationData;
  color?: string;
  onClick?: (location: LocationData) => void;
  selectedLocation?: LocationData | null;
}

function LocationSphere({ location, color = "#ff6b6b", onClick, selectedLocation }: LocationSphereProps) {
  return (
    <group position={[location.posX, location.posZ, -location.posY]}>
      <mesh onClick={() => onClick?.(location)}>
        <sphereGeometry args={[0.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
      
      {/* Red bounding box when selected */}
      {selectedLocation && 
       selectedLocation.blockName === location.blockName &&
       Math.abs(selectedLocation.posX - location.posX) < 0.001 &&
       Math.abs(selectedLocation.posY - location.posY) < 0.001 &&
       Math.abs(selectedLocation.posZ - location.posZ) < 0.001 && (
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
  onClick?: (location: LocationData) => void;
  selectedLocation?: LocationData | null;
  editMode?: boolean;
  onPositionChange?: (location: LocationData, newPosition: [number, number, number]) => void;
  movedFixtures?: Map<string, { originalPosition: [number, number, number], newPosition: [number, number, number] }>;
  rotatedFixtures?: Map<string, { originalRotation: [number, number, number], rotationOffset: number }>;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
}

function LocationGLB({ location, onError, onClick, selectedLocation, editMode = false, onPositionChange, movedFixtures, rotatedFixtures, onTransformStart, onTransformEnd }: LocationGLBProps) {
  // This component should only be called when location.glbUrl exists
  // Calculate bounding box once when GLB loads
  const [boundingBox, setBoundingBox] = useState({ size: [1, 1, 1], center: [0, 0.5, 0] });
  const isSelected = selectedLocation && 
    selectedLocation.blockName === location.blockName &&
    Math.abs(selectedLocation.posX - location.posX) < 0.001 &&
    Math.abs(selectedLocation.posY - location.posY) < 0.001 &&
    Math.abs(selectedLocation.posZ - location.posZ) < 0.001;
  
  const gltfResult = useGLTF(location.glbUrl!);
  const scene = gltfResult?.scene;
  
  // If no scene loaded yet, return null (let Suspense handle loading)
  if (!scene) {
    return null;
  }
    
    // Calculate bounding box once when scene loads
    useEffect(() => {
      if (scene) {
        const clonedScene = scene.clone();
        clonedScene.rotation.set(
          (location.rotationX * Math.PI) / 180,
          (location.rotationZ * Math.PI) / 180,
          (location.rotationY * Math.PI) / 180
        );
        clonedScene.updateMatrixWorld(true);
        
        const box = new THREE.Box3().setFromObject(clonedScene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        setBoundingBox({ 
          size: [size.x, size.y, size.z], 
          center: [center.x, center.y, center.z] 
        });
      }
    }, [scene]); // Only depends on scene, not selection state
    
    const groupRef = useRef<THREE.Group>(null);
    
    // Memoize expensive calculations and lookups
    const memoizedData = useMemo(() => {
      const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      const movedData = movedFixtures?.get(key);
      const rotatedData = rotatedFixtures?.get(key);
      
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
        currentPosition: currentPosition as [number, number, number],
        rotationX,
        rotationY,
        rotationZ,
        additionalYRotation
      };
    }, [location, movedFixtures, rotatedFixtures]);
    
    const { movedData, rotatedData, currentPosition, rotationX, rotationY, rotationZ, additionalYRotation } = memoizedData;
    
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
            onClick={() => onClick?.(location)}
            position={boundingBox.center as [number,number,number]}
          >
            <boxGeometry args={boundingBox.size as [number,number,number]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          
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
        
        {/* Transform controls for editing mode */}
        {editMode && isSelected && groupRef.current && (
          <TransformControls
            object={groupRef.current}
            mode="translate"
            space="world"
            onObjectChange={handleTransformChange}
            onMouseDown={onTransformStart}
            onMouseUp={onTransformEnd}
          />
        )}
      </>
    );
}

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

// Generate consistent colors for brands
function getBrandColor(brand: string): number {
  // Special cases first
  if (!brand || brand === 'unknown' || brand === 'unassigned') {
    return 0xff0000; // Red for unassigned
  }
  
  if (brand.toLowerCase() === 'arch') {
    return 0x808080; // Gray for arch
  }
  
  // For other brands, use a better color variety
  const predefinedColors = [
    0x00ff00, // Green
    0x0000ff, // Blue  
    0xff00ff, // Magenta
    0xffff00, // Yellow
    0x00ffff, // Cyan
    0xffa500, // Orange
    0x800080, // Purple
    0xffc0cb, // Pink
    0xa52a2a, // Brown
    0x90ee90, // Light Green
    0x87ceeb, // Sky Blue
    0xdda0dd, // Plum
  ];
  
  // Better hash function to reduce collisions
  let hash = 5381; // djb2 hash initial value
  for (let i = 0; i < brand.length; i++) {
    hash = ((hash << 5) + hash) + brand.charCodeAt(i); // hash * 33 + c
  }
  
  // Use a larger color palette to reduce collisions
  const expandedColors = [
    0x00ff00, // Green
    0x0000ff, // Blue  
    0xff00ff, // Magenta
    0xffff00, // Yellow
    0x00ffff, // Cyan
    0xffa500, // Orange
    0x800080, // Purple
    0xffc0cb, // Pink
    0xa52a2a, // Brown
    0x90ee90, // Light Green
    0x87ceeb, // Sky Blue
    0xdda0dd, // Plum
    0x32cd32, // Lime Green
    0xff6347, // Tomato
    0x4169e1, // Royal Blue
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
  
  return expandedColors[Math.abs(hash) % expandedColors.length];
}

interface ShatteredFloorModelProps {
  file: ExtractedFile;
  floorPlatesData: Record<string, any[]>;
  onBoundsCalculated?: (center: [number, number, number], size: [number, number, number]) => void;
  onFloorPlateClick?: (plateData: any) => void;
  showWireframe?: boolean;
}

function ShatteredFloorModel({ file, floorPlatesData, onBoundsCalculated, onFloorPlateClick, showWireframe = false }: ShatteredFloorModelProps) {
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
  }, [gltf, floorPlatesData, onBoundsCalculated]);
  
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
    
    // Force re-render by clearing and re-setting selection
    setSelectedLocation(null);
    setTimeout(() => setSelectedLocation(location), 10);
  }, []);

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
        // First verify job is completed
        const jobData = await apiService.getJobStatus(jobId);
        if (jobData.status !== 'completed') {
          setError('Job is not completed yet');
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
        setError(err instanceof Error ? err.message : 'Failed to load job files');
      } finally {
        setLoading(false);
        setExtracting(false);
      }
    };

    fetchAndExtractFiles();
    
    // Cleanup on unmount
    return () => {
      cleanupExtractedFiles(extractedFiles);
    };
  }, [jobId]);

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
          return;
        }
        
        const response = await fetch(csvFile.url);
        const csvText = await response.text();
        const lines = csvText.split('\n').filter(line => line.trim());
        
        const data: LocationData[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          
          if (values.length >= 12) {
            const rawUrl = values[1]?.trim();
            const glbUrl = rawUrl && rawUrl !== 'NA' ? rawUrl : undefined;
            const locationItem = {
              blockName: values[0],
              floorIndex: parseInt(values[2]),
              posX: parseFloat(values[6]) || 0,
              posY: parseFloat(values[7]) || 0,
              posZ: parseFloat(values[8]) || 0,
              rotationX: parseFloat(values[9]) || 0,
              rotationY: parseFloat(values[10]) || 0,
              rotationZ: parseFloat(values[11]) || 0,
              brand: values[12] || 'unknown',
              glbUrl: glbUrl
            };
            data.push(locationItem);
          }
        }
        setLocationData(data);
        
      } catch (err) {
        console.error('Failed to load location data:', err);
      }
    };

    const loadFloorPlatesData = async () => {
      if (extractedFiles.length === 0) return;
      
      try {
        // Find the floor-plates-all.csv file in extracted files
        const csvFile = extractedFiles.find(file => 
          file.name.toLowerCase().includes('floor-plates-all.csv') ||
          file.name.toLowerCase().includes('floor_plates_all.csv')
        );
        
        if (!csvFile) {
          console.warn('floor-plates-all.csv not found in extracted files');
          return;
        }
        
        const response = await fetch(csvFile.url);
        const csvText = await response.text();
        const lines = csvText.split('\n').slice(1).filter(line => line.trim()); // Skip header
        
        const floorData: Record<string, Record<string, any[]>> = {};
        
        lines.forEach(line => {
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
      }
    };

    loadLocationData();
    loadFloorPlatesData();
  }, [extractedFiles]);

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
        <div className="p-6 border border-destructive/20 bg-destructive/5 rounded-lg">
          <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
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
        {/* Left Side Controls Panel */}
        <div className="absolute top-4 left-4 z-50">
          <div className="flex flex-col gap-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg">
            
            {/* Model Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Floor:</label>
              <Select 
                value={selectedFloorFile?.name || selectedFile?.name || ''} 
                onChange={(e) => {
                  const file = glbFiles.find(f => f.name === e.target.value);
                  setSelectedFloorFile(file || null);
                  
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
            
            {/* Show Locations Checkbox */}
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="showSpheres" 
                checked={showSpheres}
                onChange={(e) => setShowSpheres(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="showSpheres" className="text-sm font-medium">Show Fixtures</label>
            </div>
            
            {/* Horizontal Separator */}
            <div className="border-t border-border"></div>
            
            {/* Edit Mode Dropdown */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Edit:</label>
              <Select 
                value={editFloorplatesMode ? "floorplates" : editMode ? "fixtures" : "off"} 
                onChange={(e) => {
                  const newValue = e.target.value;
                  
                  if (newValue === "off") {
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
                  } else if (newValue === "fixtures") {
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
                  } else if (newValue === "floorplates") {
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
                }}
                className="w-48"
              >
                <option value="off">Off</option>
                <option value="fixtures">Fixtures</option>
                <option value="floorplates">Floor Plates</option>
              </Select>
            </div>
            
            {/* Edit Controls */}
            {editMode && (
              <div className="flex flex-col gap-2">
                {selectedLocation && selectedLocation.glbUrl && (
                  <div className="flex gap-1 w-full">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRotateFixture(-90)}
                      className="text-xs px-2 py-1 h-auto flex-1"
                    >
                      Rotate -90°
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRotateFixture(90)}
                      className="text-xs px-2 py-1 h-auto flex-1"
                    >
                      Rotate +90°
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {/* Floor Plates Controls */}
            {editFloorplatesMode && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="showWireframe" 
                    checked={showWireframe}
                    onChange={(e) => setShowWireframe(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="showWireframe" className="text-sm font-medium">Wireframe</label>
                </div>
                
                <div className="border-t border-border pt-2">
                  <label className="text-sm font-medium">Colors:</label>
                  <div className="flex flex-col gap-1 text-xs mt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ff0000' }}></div>
                      <span>Unassigned</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: '#808080' }}></div>
                      <span>Arch</span>
                    </div>
                    <div className="text-muted-foreground">
                      Other brands get unique colors
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Warning for any edit mode */}
            {(editMode || editFloorplatesMode) && (
              <div className="text-yellow-400 text-xs max-w-[200px]">
                This is a feature preview. Edit changes are not saved.
              </div>
            )}
            
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
        <Canvas
          camera={{ position: cameraPosition, fov: 50 }}
          shadows
          className="bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800"
          onPointerMissed={() => {
            if (editFloorplatesMode) {
              setSelectedFloorPlate(null);
            } else {
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
            const floorMatch = fileForFloorExtraction.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction.name.match(/(\d+)/i);
            const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;
            
            return locationData
              .filter(location => location.floorIndex === currentFloor)
              .map((location, index) => (
                location.glbUrl ? (
                  <LocationGLB 
                    key={`${location.blockName}-${index}`} 
                    location={location}
                    onClick={editFloorplatesMode ? undefined : setSelectedLocation}
                    selectedLocation={editFloorplatesMode ? null : selectedLocation}
                    onError={handleGLBError}
                    editMode={editMode}
                    onPositionChange={editMode ? handlePositionChange : undefined}
                    movedFixtures={movedFixtures}
                    rotatedFixtures={rotatedFixtures}
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
                    onClick={editFloorplatesMode ? undefined : setSelectedLocation}
                    selectedLocation={editFloorplatesMode ? null : selectedLocation}
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
        
        {/* Location/Floor Plate Info Overlay */}
        {(selectedLocation && !editFloorplatesMode) && (() => {
          const key = `${selectedLocation.blockName}-${selectedLocation.posX}-${selectedLocation.posY}-${selectedLocation.posZ}`;
          const movedData = movedFixtures.get(key);
          const rotatedData = rotatedFixtures.get(key);
          const hasMoved = movedData !== undefined;
          const hasRotated = rotatedData !== undefined;
          const hasChanges = hasMoved || hasRotated;
          
          return (
            <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg max-w-xs">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">Location Info</h3>
                <button 
                  onClick={() => setSelectedLocation(null)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1 text-xs">
                <div><span className="font-medium">Block:</span> {selectedLocation.blockName}</div>
                <div><span className="font-medium">Brand:</span> {selectedLocation.brand}</div>
                <div><span className="font-medium">Floor:</span> {selectedLocation.floorIndex}</div>
                <div style={{ color: hasMoved ? '#ef4444' : 'inherit' }}>
                  <span className="font-medium">Position:</span> ({selectedLocation.posX.toFixed(2)}, {selectedLocation.posY.toFixed(2)}, {selectedLocation.posZ.toFixed(2)})
                </div>
                {hasMoved && movedData && (
                  <div style={{ color: '#22c55e' }}>
                    <span className="font-medium">New Position:</span> ({movedData.newPosition[0].toFixed(2)}, {movedData.newPosition[1].toFixed(2)}, {movedData.newPosition[2].toFixed(2)})
                  </div>
                )}
                <div style={{ color: hasRotated ? '#ef4444' : 'inherit' }}>
                  <span className="font-medium">Rotation:</span> ({selectedLocation.rotationX.toFixed(2)}°, {selectedLocation.rotationY.toFixed(2)}°, {selectedLocation.rotationZ.toFixed(2)}°)
                </div>
                {hasRotated && rotatedData && (
                  <div style={{ color: '#22c55e' }}>
                    <span className="font-medium">New Rotation:</span> ({selectedLocation.rotationX.toFixed(2)}°, {((selectedLocation.rotationY + rotatedData.rotationOffset) % 360).toFixed(2)}°, {selectedLocation.rotationZ.toFixed(2)}°)
                  </div>
                )}
              </div>
              {hasChanges && (
                <div className="mt-3 pt-2 border-t border-border">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleResetPosition(selectedLocation)}
                    className="w-full text-xs"
                  >
                    Reset
                  </Button>
                </div>
              )}
            </div>
          );
        })()}
        
        {/* Floor Plate Info Overlay */}
        {selectedFloorPlate && editFloorplatesMode && (
          <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg max-w-xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Floor Plate Info</h3>
              <button 
                onClick={() => setSelectedFloorPlate(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1 text-xs">
              <div><span className="font-medium">Brand:</span> {selectedFloorPlate.brand || 'Unknown'}</div>
              <div><span className="font-medium">Surface ID:</span> {selectedFloorPlate.surfaceId || 'Unknown'}</div>
              <div><span className="font-medium">Area:</span> {selectedFloorPlate.area ? `${selectedFloorPlate.area.toFixed(2)} sqm` : 'Unknown'}</div>
              {selectedFloorPlate.centroid && (
                <div><span className="font-medium">Centroid:</span> ({selectedFloorPlate.centroid[0]?.toFixed(2)}, {selectedFloorPlate.centroid[1]?.toFixed(2)}, {selectedFloorPlate.centroid[2]?.toFixed(2)})</div>
              )}
              {selectedFloorPlate.bbox && (
                <>
                  <div><span className="font-medium">Bbox Min:</span> ({selectedFloorPlate.bbox.min[0]?.toFixed(2)}, {selectedFloorPlate.bbox.min[1]?.toFixed(2)})</div>
                  <div><span className="font-medium">Bbox Max:</span> ({selectedFloorPlate.bbox.max[0]?.toFixed(2)}, {selectedFloorPlate.bbox.max[1]?.toFixed(2)})</div>
                </>
              )}
              <div><span className="font-medium">Mesh:</span> {selectedFloorPlate.meshName || 'Unknown'}</div>
              {selectedFloorPlate.layerSource && (
                <div><span className="font-medium">Layer:</span> {selectedFloorPlate.layerSource}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}