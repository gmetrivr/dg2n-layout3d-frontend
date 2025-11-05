import { useState, useEffect, Suspense, Component, useRef, useMemo, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Grid, Text, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { ExtractedFile } from '../utils/zipUtils';
import { type LocationData, generateFixtureUID } from '../hooks/useFixtureSelection';
import type { ArchitecturalObject } from './3DViewerModifier';

interface BillboardProps {
  children: React.ReactNode;
  position: [number, number, number];
}

function Billboard({ children, position }: BillboardProps) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (ref.current) {
      ref.current.lookAt(camera.position);
    }
  });

  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
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
  transformSpace?: 'world' | 'local';
  isSingleSelection?: boolean;
  onPositionChange?: (location: LocationData, newPosition: [number, number, number]) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
  isTransforming?: boolean;
  showFixtureLabels?: boolean;
}

const LocationGLB = memo(function LocationGLB({ location, onClick, isSelected, editMode = false, transformSpace = 'world', isSingleSelection = false, onPositionChange, onTransformStart, onTransformEnd, isTransforming = false, showFixtureLabels = true }: LocationGLBProps) {
  // This component should only be called when location.glbUrl exists
  // Calculate bounding box once when GLB loads
  const [boundingBox, setBoundingBox] = useState({ size: [1, 1, 1], center: [0, 0.5, 0] });
  const [stackBoundingBox, setStackBoundingBox] = useState({ size: [1, 1, 1], center: [0, 0.5, 0] });

  // Local state to store pending position during transform (prevents re-renders during drag)
  const [pendingPosition, setPendingPosition] = useState<[number, number, number] | null>(null);

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
    // Use embedded data directly from location object
    const currentPosition = [location.posX, location.posZ, -location.posY];

    const rotationX = (location.rotationX * Math.PI) / 180;
    const rotationY = (location.rotationY * Math.PI) / 180;
    const rotationZ = (location.rotationZ * Math.PI) / 180;

    return {
      currentPosition: currentPosition as [number, number, number],
      rotationX,
      rotationY,
      rotationZ
    };
  }, [location]);

  const { currentPosition, rotationX, rotationY, rotationZ } = memoizedData;

  // Use isTransforming parameter to satisfy TypeScript (it's used in memo comparison)
  void isTransforming;

  // Calculate bounding box from unrotated scene (since rotation is applied to the group, not the GLB)
  useEffect(() => {
    if (scene) {
      // Don't apply rotations to the scene - calculate bounding box from unrotated GLB
      // The rotation is applied to the containing group at render time
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      setBoundingBox({
        size: [size.x, size.y, size.z],
        center: [center.x, center.y, center.z]
      });

      // Calculate stack bounding box based on count
      const count = location.count || 1;
      if (count > 1) {
        // Stack side-by-side along X axis, centered around original point
        const stackWidth = size.x * count;
        setStackBoundingBox({
          size: [stackWidth, size.y, size.z],
          center: [center.x, center.y, center.z] // Keep center at original position
        });
      } else {
        setStackBoundingBox({
          size: [size.x, size.y, size.z],
          center: [center.x, center.y, center.z]
        });
      }
    }
  }, [scene, location.count]); // Depends on scene loading and count

  const handleTransformChange = () => {
    // Store position locally during transform to avoid global state updates (prevents re-renders)
    if (groupRef.current) {
      const newPosition = groupRef.current.position;
      setPendingPosition([newPosition.x, -newPosition.z, newPosition.y]);
    }
  };

  const handleTransformEnd = () => {
    // Apply pending position to global state after transform ends
    if (pendingPosition && onPositionChange) {
      onPositionChange(location, pendingPosition);
      setPendingPosition(null);

      // Clear isTransforming flag AFTER position update's render cycle completes
      // This ensures memo comparison blocks re-render before flag is cleared
      setTimeout(() => {
        onTransformEnd?.();
      }, 0);
    } else {
      // No position changes, clear flag immediately
      onTransformEnd?.();
    }
  };

  const count = location.count || 1;

  return (
    <>
      <group ref={groupRef} position={currentPosition as [number, number, number]} rotation={[rotationX, rotationZ, rotationY]}>
        {/* Render multiple GLBs side-by-side based on count, centered around original point */}
        {Array.from({ length: count }, (_, index) => {
          // Center the stack around the original point
          const totalWidth = boundingBox.size[0] * count;
          const startOffset = -totalWidth / 2 + boundingBox.size[0] / 2; // Start position for first GLB
          const xOffset = startOffset + index * boundingBox.size[0]; // Position for this GLB
          return (
            <group key={index} position={[xOffset, 0, 0]}>
              <primitive
                object={scene.clone()}
                scale={[1, 1, 1]}
              />
            </group>
          );
        })}

        {/* Transparent bounding box for clicking - covers entire stack */}
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onClick?.(location, {
              shiftKey: event.nativeEvent.shiftKey,
              metaKey: event.nativeEvent.metaKey,
              ctrlKey: event.nativeEvent.ctrlKey
            });
          }}
          position={stackBoundingBox.center as [number, number, number]}
        >
          <boxGeometry args={stackBoundingBox.size as [number, number, number]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* Yellow edge outline for brand-modified or fixture-type-modified fixtures - use stack bounding box */}
        {(location.wasBrandChanged || location.wasTypeChanged || location.wasCountChanged || location.wasHierarchyChanged || location.wasSplit || location.wasMerged) && !isSelected && !location.wasMoved && !location.wasRotated && (
          <lineSegments
            position={stackBoundingBox.center as [number, number, number]}
            renderOrder={997}
          >
            <edgesGeometry args={[new THREE.BoxGeometry(...stackBoundingBox.size)]} />
            <lineBasicMaterial color="purple" />
          </lineSegments>
        )}

        {/* Orange edge outline for moved/rotated fixtures - use stack bounding box */}
        {(location.wasMoved || location.wasRotated) && !isSelected && (
          <lineSegments
            position={stackBoundingBox.center as [number, number, number]}
            renderOrder={998}
          >
            <edgesGeometry args={[new THREE.BoxGeometry(...stackBoundingBox.size)]} />
            <lineBasicMaterial color="purple" />
          </lineSegments>
        )}

        {/* Red edge outline when selected - use stack bounding box */}
        {isSelected && (
          <lineSegments
            position={stackBoundingBox.center as [number, number, number]}
            renderOrder={999}
          >
            <edgesGeometry args={[new THREE.BoxGeometry(...stackBoundingBox.size)]} />
            <lineBasicMaterial color="red" />
          </lineSegments>
        )}

        {/* Fixture name label positioned 0.3m above bounding box */}
        {showFixtureLabels && (
          <Billboard position={[
            stackBoundingBox.center[0],
            stackBoundingBox.center[1] + stackBoundingBox.size[1] / 2 + 0.5,
            stackBoundingBox.center[2]
          ]}>
            {/* Black background box */}
            <mesh renderOrder={999}>
              <planeGeometry args={[1.2, Math.max(0.3, ((Math.ceil((location.blockName.length) / 12) * 0.15) + (Math.ceil((location.brand.length) / 12) * 0.15)+ 0.15))]} />
              <meshBasicMaterial color="black" transparent opacity={0.8} />
            </mesh>

            {/* Text with wrapping */}
            <Text
              position={[0, 0, 0.001]}
              fontSize={0.1}
              color="white"
              anchorX="center"
              anchorY="middle"
              maxWidth={1.1}
              textAlign="center"
              renderOrder={1000}
            >
              {`*${location.brand}*
${location.blockName}
${location.hierarchy}`}
            </Text>
          </Billboard>
        )}
      </group>

      {/* Transform controls for editing mode - only show for single selection */}
      {editMode && isSelected && groupRef.current && isSingleSelection && (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          space={transformSpace}
          showY={false}
          onObjectChange={handleTransformChange}
          onMouseDown={onTransformStart}
          onMouseUp={handleTransformEnd}
        />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function using embedded data
  const prevLocation = prevProps.location;
  const nextLocation = nextProps.location;

  // If we're currently transforming, ignore position changes to prevent re-renders
  // that would break the TransformControls attachment
  const shouldIgnorePositionChanges = prevProps.isTransforming || nextProps.isTransforming;

  const positionsEqual = shouldIgnorePositionChanges || (
    prevLocation.posX === nextLocation.posX &&
    prevLocation.posY === nextLocation.posY &&
    prevLocation.posZ === nextLocation.posZ
  );

  return (
    prevLocation.blockName === nextLocation.blockName &&
    positionsEqual &&
    prevLocation.rotationX === nextLocation.rotationX &&
    prevLocation.rotationY === nextLocation.rotationY &&
    prevLocation.rotationZ === nextLocation.rotationZ &&
    prevLocation.glbUrl === nextLocation.glbUrl &&
    prevLocation.brand === nextLocation.brand &&
    prevLocation.count === nextLocation.count &&
    prevLocation.hierarchy === nextLocation.hierarchy &&
    prevLocation._updateTimestamp === nextLocation._updateTimestamp &&
    prevLocation.wasMoved === nextLocation.wasMoved &&
    prevLocation.wasRotated === nextLocation.wasRotated &&
    prevLocation.wasTypeChanged === nextLocation.wasTypeChanged &&
    prevLocation.wasBrandChanged === nextLocation.wasBrandChanged &&
    prevLocation.wasCountChanged === nextLocation.wasCountChanged &&
    prevLocation.wasHierarchyChanged === nextLocation.wasHierarchyChanged &&
    prevLocation.wasSplit === nextLocation.wasSplit &&
    prevLocation.wasMerged === nextLocation.wasMerged &&
    prevProps.editMode === nextProps.editMode &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isSingleSelection === nextProps.isSingleSelection &&
    prevProps.isTransforming === nextProps.isTransforming &&
    prevProps.transformSpace === nextProps.transformSpace &&
    prevProps.showFixtureLabels === nextProps.showFixtureLabels
  );
});

interface GLBModelProps {
  file: ExtractedFile;
  onBoundsCalculated?: (center: [number, number, number], size: [number, number, number]) => void;
  showWalls?: boolean;
}

function GLBModel({ file, onBoundsCalculated, showWalls = true }: GLBModelProps) {
  const gltf = useGLTF(file.url);

  useEffect(() => {
    if (gltf?.scene) {
      // Make all meshes in the floor GLB non-interactive and conditionally hide walls
      gltf.scene.traverse((child: any) => {
        if (child.isMesh) {
          child.userData.interactive = false;
          
          // Hide wall and column meshes if showWalls is disabled
          if (!showWalls && child.name) {
            const meshName = child.name.toLowerCase();
            // Common patterns for wall and column mesh names
            const isWallOrColumn = meshName.includes('wall') || 
                                  meshName.includes('column') || 
                                  meshName.includes('pillar') || 
                                  meshName.includes('structural') ||
                                  meshName.includes('beam') ||
                                  meshName.includes('ceiling') ||
                                  meshName.includes('roof');
            
            // Hide the mesh by setting visible to false
            if (isWallOrColumn) {
              child.visible = false;
            } else {
              child.visible = true; // Ensure other meshes are visible
            }
          } else {
            // If showWalls is true, make sure all meshes are visible
            child.visible = true;
          }
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
  }, [gltf, onBoundsCalculated, showWalls]);

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

// Glazing component - single plane
interface GlazingProps {
  object: ArchitecturalObject;
}

function Glazing({ object }: GlazingProps) {
  const { startPoint, endPoint, height } = object;

  // Calculate position, rotation, and dimensions
  const dx = endPoint[0] - startPoint[0];
  const dz = endPoint[2] - startPoint[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  // Position at midpoint
  const position: [number, number, number] = [
    (startPoint[0] + endPoint[0]) / 2,
    startPoint[1] + height / 2,
    (startPoint[2] + endPoint[2]) / 2
  ];

  return (
    <group position={position} rotation={[0, angle, 0]}>
      <mesh>
        <planeGeometry args={[length, height]} />
        <meshStandardMaterial
          color="#88ccff"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Edge outline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(length, height)]} />
        <lineBasicMaterial color="#0066cc" linewidth={2} />
      </lineSegments>
    </group>
  );
}

// Partition component - box with 115mm width
interface PartitionProps {
  object: ArchitecturalObject;
}

function Partition({ object }: PartitionProps) {
  const { startPoint, endPoint, height } = object;

  // Calculate position, rotation, and dimensions
  const dx = endPoint[0] - startPoint[0];
  const dz = endPoint[2] - startPoint[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const width = 0.115; // 115mm in meters

  // Position at midpoint
  const position: [number, number, number] = [
    (startPoint[0] + endPoint[0]) / 2,
    startPoint[1] + height / 2,
    (startPoint[2] + endPoint[2]) / 2
  ];

  return (
    <group position={position} rotation={[0, angle, 0]}>
      <mesh>
        <boxGeometry args={[length, height, width]} />
        <meshStandardMaterial color="#cccccc" />
      </mesh>
      {/* Edge outline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(length, height, width)]} />
        <lineBasicMaterial color="#666666" linewidth={2} />
      </lineSegments>
    </group>
  );
}

// Floor click handler using raycasting
interface FloorClickHandlerProps {
  isAddingObject: boolean;
  onFloorClick: (point: [number, number, number]) => void;
}

function FloorClickHandler({ isAddingObject, onFloorClick }: FloorClickHandlerProps) {
  const { scene, camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    if (!isAddingObject) return;

    const handleClick = (event: MouseEvent) => {
      // Calculate mouse position in normalized device coordinates
      const canvas = event.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);

      // Intersect with all meshes in the scene
      const intersects = raycaster.intersectObjects(scene.children, true);

      // Find first floor mesh intersection
      for (const intersect of intersects) {
        const mesh = intersect.object as THREE.Mesh;

        // Check if this is a floor mesh (not a fixture or other object)
        // Floor meshes typically don't have interactive userData
        if (mesh.isMesh && !mesh.userData.interactive) {
          const point = intersect.point;
          onFloorClick([point.x, point.y, point.z]);
          break;
        }
      }
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('click', handleClick);
      // Change cursor to crosshair when adding objects
      canvas.style.cursor = 'crosshair';

      return () => {
        canvas.removeEventListener('click', handleClick);
        canvas.style.cursor = 'default';
      };
    }
  }, [isAddingObject, onFloorClick, raycaster, scene, camera]);

  return null;
}

interface Canvas3DProps {
  cameraPosition: [number, number, number];
  orbitTarget: [number, number, number];
  selectedFile: ExtractedFile | null;
  selectedFloorFile: ExtractedFile | null;
  locationData: LocationData[];
  showSpheres: boolean;
  editFloorplatesMode: boolean;
  selectedFixtureType: string;
  selectedBrand: string;
  fixtureTypeMap: Map<string, string>;
  deletedFixtures: Set<string>;
  editMode: boolean;
  transformSpace: 'world' | 'local';
  isTransforming: boolean;
  floorPlatesData: Record<string, Record<string, any[]>>;
  modifiedFloorPlates: Map<string, any>;
  showWireframe: boolean;
  showFixtureLabels: boolean;
  showWalls: boolean;
  selectedLocations: LocationData[];
  // Architectural objects props
  architecturalObjects?: ArchitecturalObject[];
  isAddingObject?: boolean;
  currentObjectType?: 'glazing' | 'partition' | null;
  objectPlacementPoint?: [number, number, number] | null;
  onFloorClickForObjectPlacement?: (point: [number, number, number]) => void;
  // Existing callbacks
  onBoundsCalculated: (center: [number, number, number], size: [number, number, number]) => void;
  onGLBError: (blockName: string, url: string) => void;
  onFixtureClick: (location: LocationData, event?: any) => void;
  isLocationSelected: (location: LocationData) => boolean;
  onPositionChange: (location: LocationData, newPosition: [number, number, number]) => void;
  onFloorPlateClick: (plateData: any) => void;
  onPointerMissed: () => void;
  setIsTransforming: (transforming: boolean) => void;
  onOrbitTargetUpdate?: (target: [number, number, number]) => void;
}

export function Canvas3D({
  cameraPosition,
  orbitTarget,
  selectedFile,
  selectedFloorFile,
  locationData,
  showSpheres,
  editFloorplatesMode,
  selectedFixtureType,
  selectedBrand,
  fixtureTypeMap,
  deletedFixtures,
  editMode,
  transformSpace,
  isTransforming,
  floorPlatesData,
  modifiedFloorPlates,
  showWireframe,
  showFixtureLabels,
  showWalls,
  selectedLocations,
  architecturalObjects = [],
  isAddingObject = false,
  currentObjectType = null,
  objectPlacementPoint = null,
  onFloorClickForObjectPlacement,
  onBoundsCalculated,
  onGLBError,
  onFixtureClick,
  isLocationSelected,
  onPositionChange,
  onFloorPlateClick,
  onPointerMissed,
  setIsTransforming,
  onOrbitTargetUpdate
}: Canvas3DProps) {
  const orbitControlsRef = useRef<any>(null);
  const lastTargetRef = useRef<[number, number, number]>(orbitTarget);
  return (
    <Canvas
      camera={{ position: cameraPosition, fov: 50 }}
      shadows
      className="bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800"
      onPointerMissed={onPointerMissed}
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
                  onBoundsCalculated={onBoundsCalculated}
                  onFloorPlateClick={onFloorPlateClick}
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
                onBoundsCalculated={onBoundsCalculated}
                showWalls={showWalls}
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
            // Exclude forDelete fixtures (marked when split or type-changed)
            if (location.forDelete) return false;

            // Exclude deleted fixtures
            const key = generateFixtureUID(location);
            return !deletedFixtures.has(key);
          })
          .filter(location => {
            // Apply fixture type filter if not "all"
            if (selectedFixtureType === 'all') return true;

            // Use actual fixture type from API response
            const fixtureType = fixtureTypeMap.get(location.blockName);
            return fixtureType === selectedFixtureType;
          })
          .filter(location => {
            // Apply brand filter if not "all"
            if (selectedBrand === 'all') return true;
            return location.brand === selectedBrand;
          })
          .map((location, index) => (
            location.glbUrl ? (
              <LocationGLB
                key={generateFixtureUID(location)}
                location={location}
                onClick={editFloorplatesMode ? undefined : onFixtureClick}
                isSelected={editFloorplatesMode ? false : isLocationSelected(location)}
                isSingleSelection={selectedLocations.length === 1}
                onError={onGLBError}
                editMode={editMode}
                transformSpace={transformSpace}
                isTransforming={isTransforming}
                showFixtureLabels={showFixtureLabels}
                onPositionChange={editMode ? onPositionChange : undefined}
                {...(editMode && {
                  onTransformStart: () => {
                    setIsTransforming(true);
                  },
                  onTransformEnd: () => {
                    setIsTransforming(false);
                  }
                })}
              />
            ) : (
              <LocationSphere
                key={`${location.blockName}-${index}`}
                location={location}
                color={`hsl(${(index * 137.5) % 360}, 70%, 50%)`}
                onClick={editFloorplatesMode ? undefined : onFixtureClick}
                isSelected={editFloorplatesMode ? false : isLocationSelected(location)}
              />
            )
          ));
      })()}

      {/* Render architectural objects (glazing and partitions) */}
      {architecturalObjects.map(obj => {
        const fileForFloorExtraction = selectedFloorFile || selectedFile;
        const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
        const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

        // Only render objects for current floor
        if (obj.floorIndex !== currentFloor) return null;

        return obj.type === 'glazing' ? (
          <Glazing key={obj.id} object={obj} />
        ) : (
          <Partition key={obj.id} object={obj} />
        );
      })}

      {/* Preview line during object placement */}
      {isAddingObject && objectPlacementPoint && (() => {
        // We need to show a line from the first point to the cursor
        // But we can't easily track cursor in 3D, so we just show the start point sphere
        return (
          <mesh position={objectPlacementPoint}>
            <sphereGeometry args={[0.15]} />
            <meshStandardMaterial color="#ff00ff" />
          </mesh>
        );
      })()}

      {/* Floor click handler for object placement */}
      {isAddingObject && onFloorClickForObjectPlacement && (
        <FloorClickHandler
          isAddingObject={isAddingObject}
          onFloorClick={onFloorClickForObjectPlacement}
        />
      )}

      <OrbitControls
        ref={orbitControlsRef}
        target={orbitTarget}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        dampingFactor={0.05}
        rotateSpeed={0.5}
        zoomSpeed={0.5}
        enabled={!isTransforming}
        onEnd={() => {
          if (orbitControlsRef.current && onOrbitTargetUpdate) {
            const target = orbitControlsRef.current.target;
            const newTarget: [number, number, number] = [target.x, target.y, target.z];

            // Update on both pan and rotate - always track where camera is looking
            lastTargetRef.current = newTarget;
            onOrbitTargetUpdate(newTarget);
          }
        }}
      />
    </Canvas>
  );
}