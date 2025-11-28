import { useState, useEffect, Suspense, Component, useRef, useMemo, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Grid, Text, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { ExtractedFile } from '../utils/zipUtils';
import { type LocationData, generateFixtureUID } from '../hooks/useFixtureSelection';
import type { ArchitecturalObject, ArchitecturalObjectType } from './3DViewerModifier';

// Common bounding box component for all fixtures and architectural objects
interface BoundingBoxProps {
  size: [number, number, number] | THREE.Vector3;
  position: [number, number, number];
  color: string;
  renderOrder?: number;
}

function BoundingBox({ size, position, color, renderOrder = 999 }: BoundingBoxProps) {
  const sizeArray = Array.isArray(size) ? size : [size.x, size.y, size.z];

  return (
    <lineSegments position={position} renderOrder={renderOrder}>
      <edgesGeometry args={[new THREE.BoxGeometry(sizeArray[0], sizeArray[1], sizeArray[2])]} />
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

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
        <BoundingBox
          size={[0.5, 0.5, 0.5]}
          position={[0, 0, 0]}
          color="red"
          renderOrder={999}
        />
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
    }

    // Always delay clearing isTransforming flag to prevent onPointerMissed from clearing selection
    // This ensures the flag stays true until after the mouse up event is fully processed
    setTimeout(() => {
      onTransformEnd?.();
    }, 0);
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

        {/* Purple edge outline for modified fixtures - use stack bounding box */}
        {!isSelected && (location.wasMoved || location.wasRotated || location.wasBrandChanged || location.wasTypeChanged || location.wasCountChanged || location.wasHierarchyChanged || location.wasSplit || location.wasMerged) && (
          <BoundingBox
            size={stackBoundingBox.size as [number, number, number]}
            position={stackBoundingBox.center as [number, number, number]}
            color="purple"
            renderOrder={998}
          />
        )}

        {/* Red edge outline when selected - use stack bounding box */}
        {isSelected && (
          <BoundingBox
            size={stackBoundingBox.size as [number, number, number]}
            position={stackBoundingBox.center as [number, number, number]}
            color="red"
            renderOrder={999}
          />
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
  isSelected?: boolean;
  editMode?: boolean;
  transformSpace?: 'world' | 'local';
  onClick?: (object: ArchitecturalObject, event?: any) => void;
  onPositionChange?: (object: ArchitecturalObject, newPosition: [number, number, number]) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
}

// Door GLB component for rendering doors with their actual GLB models
interface DoorGLBProps {
  object: ArchitecturalObject;
  glbUrl: string;
  isSelected: boolean;
  editMode?: boolean;
  transformSpace?: 'world' | 'local';
  onClick?: (obj: ArchitecturalObject, event?: any) => void;
  onPositionChange?: (obj: ArchitecturalObject, newPosition: [number, number, number]) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
}

function DoorGLB({ object, glbUrl, isSelected, editMode, transformSpace, onClick, onPositionChange, onTransformStart, onTransformEnd }: DoorGLBProps) {
  const gltfResult = useGLTF(glbUrl);
  const scene = gltfResult?.scene;
  const groupRef = useRef<THREE.Group>(null);
  const [pendingPosition, setPendingPosition] = useState<[number, number, number] | null>(null);

  if (!scene) {
    return null;
  }

  // Calculate bounding box from the actual GLB model
  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);

  // Door uses posX, posY, posZ for position
  const position: [number, number, number] = pendingPosition || [
    object.posX || 0,
    object.posZ || 0,  // Y and Z are swapped
    -(object.posY || 0)
  ];

  // Convert rotations from degrees to radians
  const rotationX = ((object.rotationX || 0) * Math.PI) / 180;
  const rotationY = ((object.rotationY || 0) * Math.PI) / 180;
  const rotationZ = ((object.rotationZ || 0) * Math.PI) / 180;

  const handleTransformChange = () => {
    // Store position locally during transform to avoid global state updates
    if (groupRef.current) {
      const newPosition = groupRef.current.position;
      setPendingPosition([newPosition.x, newPosition.y, newPosition.z]);
    }
  };

  const handleTransformEnd = () => {
    if (pendingPosition && onPositionChange) {
      // Pass the Three.js position directly - let the parent handler convert it
      onPositionChange(object, pendingPosition);
      setPendingPosition(null);
    }

    // Always delay clearing isTransforming flag to prevent onPointerMissed from clearing selection
    setTimeout(() => {
      onTransformEnd?.();
    }, 0);
  };

  return (
    <>
      <group
        ref={groupRef}
        position={position}
        rotation={[rotationX, rotationZ, rotationY]}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(object, event);
        }}
      >
        <primitive object={scene.clone()} scale={[1, 1, 1]} />

        {/* Transparent bounding box for clicking */}
        <mesh position={[center.x, center.y, center.z]}>
          <boxGeometry args={[size.x, size.y, size.z]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* Purple edge outline for moved/rotated doors */}
        {!isSelected && (object.wasMoved || object.wasRotated) && (
          <BoundingBox
            size={[size.x, size.y, size.z]}
            position={[center.x, center.y, center.z]}
            color="purple"
            renderOrder={998}
          />
        )}

        {/* Red edge outline when selected */}
        {isSelected && (
          <BoundingBox
            size={[size.x, size.y, size.z]}
            position={[center.x, center.y, center.z]}
            color="red"
            renderOrder={999}
          />
        )}
      </group>

      {/* Transform controls for editing mode - only show for selected object */}
      {editMode && isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          space={transformSpace}
          showX={true}
          showY={false}
          showZ={true}
          onObjectChange={handleTransformChange}
          onMouseDown={onTransformStart}
          onMouseUp={handleTransformEnd}
        />
      )}
    </>
  );
}

function Glazing({ object, isSelected, editMode, transformSpace, onClick, onPositionChange, onTransformStart, onTransformEnd }: GlazingProps) {
  const { startPoint, endPoint, height, rotation: additionalRotation } = object;
  const groupRef = useRef<THREE.Group>(null);
  const [pendingPosition, setPendingPosition] = useState<[number, number, number] | null>(null);

  // Guard: Ensure required properties exist
  if (!startPoint || !endPoint || height === undefined) {
    return null;
  }

  // Calculate position, rotation, and dimensions
  const dx = endPoint[0] - startPoint[0];
  const dz = endPoint[2] - startPoint[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(-dz, dx);  // Negate dz to match coordinate system

  // Position at midpoint - origin at ground level (y=0)
  const position: [number, number, number] = pendingPosition || [
    (startPoint[0] + endPoint[0]) / 2,
    startPoint[1],  // Ground level, not height/2
    (startPoint[2] + endPoint[2]) / 2
  ];

  const totalRotation = angle + (additionalRotation || 0);

  const handleTransformChange = () => {
    // Store position locally during transform to avoid global state updates
    if (groupRef.current) {
      const newPosition = groupRef.current.position;
      setPendingPosition([newPosition.x, newPosition.y, newPosition.z]);
    }
  };

  const handleTransformEnd = () => {
    if (pendingPosition && onPositionChange) {
      onPositionChange(object, pendingPosition);
      setPendingPosition(null);
    }

    // Always delay clearing isTransforming flag to prevent onPointerMissed from clearing selection
    setTimeout(() => {
      onTransformEnd?.();
    }, 0);
  };

  const frameThickness = 0.05; // 50mm
  const frameDepth = 0.1; // 100mm

  return (
    <>
      <group ref={groupRef} position={position} rotation={[0, totalRotation, 0]}>
        {/* Glass plane */}
        <mesh
          position={[0, height / 2, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.(object, event);
          }}
        >
          <planeGeometry args={[length, height]} />
          <meshStandardMaterial
            color={isSelected ? "#66aaff" : "#88ccff"}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Metal frame around the glass */}
        {/* Top frame */}
        <mesh position={[0, height - frameThickness / 2, 0]}>
          <boxGeometry args={[length, frameThickness, frameDepth]} />
          <meshStandardMaterial
            color={isSelected ? "#333333" : "#444444"}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>

        {/* Bottom frame */}
        <mesh position={[0, frameThickness / 2, 0]}>
          <boxGeometry args={[length, frameThickness, frameDepth]} />
          <meshStandardMaterial
            color={isSelected ? "#333333" : "#444444"}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>

        {/* Left frame */}
        <mesh position={[-length / 2 + frameThickness / 2, height / 2, 0]}>
          <boxGeometry args={[frameThickness, height - 2 * frameThickness, frameDepth]} />
          <meshStandardMaterial
            color={isSelected ? "#333333" : "#444444"}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>

        {/* Right frame */}
        <mesh position={[length / 2 - frameThickness / 2, height / 2, 0]}>
          <boxGeometry args={[frameThickness, height - 2 * frameThickness, frameDepth]} />
          <meshStandardMaterial
            color={isSelected ? "#333333" : "#444444"}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>

        {/* Edge outline - red for selected, purple for modified, no default */}
        {(isSelected || object.wasMoved || object.wasRotated || object.wasHeightChanged) && (
          <BoundingBox
            size={[length, height, frameDepth]}
            position={[0, height / 2, 0]}
            color={isSelected ? "red" : "purple"}
            renderOrder={isSelected ? 999 : 998}
          />
        )}
      </group>

      {/* Transform controls for editing mode - only show for selected object */}
      {editMode && isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          space={transformSpace}
          showX={true}
          showY={false}
          showZ={true}
          onObjectChange={handleTransformChange}
          onMouseDown={onTransformStart}
          onMouseUp={handleTransformEnd}
        />
      )}
    </>
  );
}

// Partition component - box with 60mm width
interface PartitionProps {
  object: ArchitecturalObject;
  isSelected?: boolean;
  editMode?: boolean;
  transformSpace?: 'world' | 'local';
  onClick?: (object: ArchitecturalObject, event?: any) => void;
  onPositionChange?: (object: ArchitecturalObject, newPosition: [number, number, number]) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
}

function Partition({ object, isSelected, editMode, transformSpace, onClick, onPositionChange, onTransformStart, onTransformEnd }: PartitionProps) {
  const { startPoint, endPoint, height, rotation: additionalRotation } = object;
  const groupRef = useRef<THREE.Group>(null);
  const [pendingPosition, setPendingPosition] = useState<[number, number, number] | null>(null);

  // Guard: Ensure required properties exist
  if (!startPoint || !endPoint || height === undefined) {
    return null;
  }

  // Calculate position, rotation, and dimensions
  const dx = endPoint[0] - startPoint[0];
  const dz = endPoint[2] - startPoint[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(-dz, dx);  // Negate dz to match coordinate system
  const width = 0.06; // 60mm in meters

  // Position at midpoint - origin at ground level (y=0)
  const position: [number, number, number] = pendingPosition || [
    (startPoint[0] + endPoint[0]) / 2,
    startPoint[1],  // Ground level, not height/2
    (startPoint[2] + endPoint[2]) / 2
  ];

  const totalRotation = angle + (additionalRotation || 0);

  const handleTransformChange = () => {
    // Store position locally during transform to avoid global state updates
    if (groupRef.current) {
      const newPosition = groupRef.current.position;
      setPendingPosition([newPosition.x, newPosition.y, newPosition.z]);
    }
  };

  const handleTransformEnd = () => {
    if (pendingPosition && onPositionChange) {
      onPositionChange(object, pendingPosition);
      setPendingPosition(null);
    }

    // Always delay clearing isTransforming flag to prevent onPointerMissed from clearing selection
    setTimeout(() => {
      onTransformEnd?.();
    }, 0);
  };

  return (
    <>
      <group ref={groupRef} position={position} rotation={[0, totalRotation, 0]}>
        <mesh
          position={[0, height / 2, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.(object, event);
          }}
        >
          <boxGeometry args={[length, height, width]} />
          <meshStandardMaterial color={isSelected ? "#aaaaaa" : "#cccccc"} />
        </mesh>
        {/* Edge outline - red for selected, purple for modified, no default */}
        {(isSelected || object.wasMoved || object.wasRotated || object.wasHeightChanged) && (
          <BoundingBox
            size={[length, height, width]}
            position={[0, height / 2, 0]}
            color={isSelected ? "red" : "purple"}
            renderOrder={isSelected ? 999 : 998}
          />
        )}
      </group>

      {/* Transform controls for editing mode - only show for selected object */}
      {editMode && isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          space={transformSpace}
          showX={true}
          showY={false}
          showZ={true}
          onObjectChange={handleTransformChange}
          onMouseDown={onTransformStart}
          onMouseUp={handleTransformEnd}
        />
      )}
    </>
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

    let mouseDownPosition: { x: number; y: number } | null = null;
    let isDragging = false;
    const dragThreshold = 5; // pixels

    const handleMouseDown = (event: MouseEvent) => {
      mouseDownPosition = { x: event.clientX, y: event.clientY };
      isDragging = false;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (mouseDownPosition) {
        const dx = event.clientX - mouseDownPosition.x;
        const dy = event.clientY - mouseDownPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > dragThreshold) {
          isDragging = true;
        }
      }
    };

    const handleClick = (event: MouseEvent) => {
      // Only process click if it wasn't a drag operation
      if (isDragging) {
        isDragging = false;
        mouseDownPosition = null;
        return;
      }

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
      let foundFloorMesh = false;
      for (const intersect of intersects) {
        const mesh = intersect.object as THREE.Mesh;

        // Check if this is a floor mesh (not a fixture or other object)
        // Floor meshes have interactive === false (explicitly set)
        // Fixtures and other objects have interactive === undefined or true
        if (mesh.isMesh && mesh.userData.interactive === false) {
          const point = intersect.point;
          onFloorClick([point.x, point.y, point.z]);
          foundFloorMesh = true;
          break;
        }
      }

      // If no floor mesh was hit, intersect with ground plane at y=0
      if (!foundFloorMesh) {
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Plane at y=0
        const planeIntersect = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, planeIntersect);

        if (planeIntersect) {
          onFloorClick([planeIntersect.x, planeIntersect.y, planeIntersect.z]);
        }
      }

      // Reset tracking
      mouseDownPosition = null;
      isDragging = false;
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('click', handleClick);
      // Change cursor to crosshair when adding objects
      canvas.style.cursor = 'crosshair';

      return () => {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
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
  currentObjectType?: ArchitecturalObjectType | null;
  objectPlacementPoint?: [number, number, number] | null;
  selectedObject?: ArchitecturalObject | null;
  onFloorClickForObjectPlacement?: (point: [number, number, number]) => void;
  onObjectClick?: (object: ArchitecturalObject) => void;
  onObjectPositionChange?: (object: ArchitecturalObject, newPosition: [number, number, number]) => void;
  // Spawn point props
  setSpawnPointMode?: boolean;
  spawnPoints?: Map<number, [number, number, number]>;
  onFloorClickForSpawnPoint?: (point: [number, number, number]) => void;
  // Measurement tool props
  isMeasuring?: boolean;
  measurementPoints?: [number, number, number][];
  onFloorClickForMeasurement?: (point: [number, number, number]) => void;
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
  currentObjectType: _currentObjectType = null,
  objectPlacementPoint = null,
  selectedObject = null,
  onFloorClickForObjectPlacement,
  onObjectClick,
  onObjectPositionChange,
  setSpawnPointMode = false,
  spawnPoints = new Map(),
  onFloorClickForSpawnPoint,
  isMeasuring = false,
  measurementPoints = [],
  onFloorClickForMeasurement,
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
      <axesHelper args={[2]} />
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
                onClick={(editFloorplatesMode || setSpawnPointMode || isAddingObject) ? undefined : onFixtureClick}
                isSelected={(editFloorplatesMode || setSpawnPointMode || isAddingObject) ? false : isLocationSelected(location)}
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
                onClick={(editFloorplatesMode || setSpawnPointMode || isAddingObject) ? undefined : onFixtureClick}
                isSelected={(editFloorplatesMode || setSpawnPointMode || isAddingObject) ? false : isLocationSelected(location)}
              />
            )
          ));
      })()}

      {/* Render architectural objects */}
      {architecturalObjects.map(obj => {
        const fileForFloorExtraction = selectedFloorFile || selectedFile;
        const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
        const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

        // Only render objects for current floor
        if (obj.floorIndex !== currentFloor) return null;

        const isSelected = selectedObject?.id === obj.id;

        // Render based on object type
        if (obj.type === 'glazing') {
          return (
            <Glazing
              key={obj.id}
              object={obj}
              isSelected={isSelected}
              editMode={editMode}
              transformSpace={transformSpace}
              onClick={onObjectClick}
              onPositionChange={onObjectPositionChange}
              onTransformStart={() => setIsTransforming(true)}
              onTransformEnd={() => setIsTransforming(false)}
            />
          );
        } else if (obj.type === 'partition') {
          return (
            <Partition
              key={obj.id}
              object={obj}
              isSelected={isSelected}
              editMode={editMode}
              transformSpace={transformSpace}
              onClick={onObjectClick}
              onPositionChange={onObjectPositionChange}
              onTransformStart={() => setIsTransforming(true)}
              onTransformEnd={() => setIsTransforming(false)}
            />
          );
        } else if (obj.type === 'entrance_door' || obj.type === 'exit_door') {
          // Check if door has GLB URL
          const glbUrl = obj.customProperties?.glbUrl;

          if (glbUrl) {
            // Render door using GLB file
            return (
              <DoorGLB
                key={obj.id}
                object={obj}
                glbUrl={glbUrl}
                isSelected={isSelected}
                editMode={editMode}
                transformSpace={transformSpace}
                onClick={onObjectClick}
                onPositionChange={onObjectPositionChange}
                onTransformStart={() => setIsTransforming(true)}
                onTransformEnd={() => setIsTransforming(false)}
              />
            );
          } else {
            // Fallback: render as simple box if no GLB
            console.warn(`[Canvas3D] Door ${obj.id} (${obj.variant || 'unknown'}) has no GLB URL, using fallback box rendering`);
            const width = obj.width || 1.5;
            const height = obj.height || 3.0;
            const depth = obj.depth || 0.1;
            const doorColor = obj.type === 'entrance_door' ? '#8B4513' : '#DC143C';

            return (
              <group
                key={obj.id}
                position={[obj.posX || 0, (obj.posY || 0) + height / 2, obj.posZ || 0]}
                rotation={[obj.rotationX || 0, obj.rotationY || 0, obj.rotationZ || 0]}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onObjectClick) {
                    onObjectClick(obj);
                  }
                }}
              >
                <mesh>
                  <boxGeometry args={[width, height, depth]} />
                  <meshStandardMaterial color={doorColor} roughness={0.7} metalness={0.1} />
                </mesh>
                <mesh position={[width * 0.35, 0, depth / 2 + 0.05]}>
                  <cylinderGeometry args={[0.02, 0.02, 0.15, 8]} />
                  <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
                </mesh>
                {isSelected && (
                  <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(width * 1.1, height * 1.1, depth * 1.1)]} />
                    <lineBasicMaterial color="#ff0000" linewidth={2} />
                  </lineSegments>
                )}
              </group>
            );
          }
        }

        return null;
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

      {/* Spawn point markers */}
      {Array.from(spawnPoints.entries()).map(([floorIndex, spawnPoint]) => {
        // Get current floor
        const fileForFloorExtraction = selectedFloorFile || selectedFile;
        const floorMatch = fileForFloorExtraction?.name.match(/floor[_-]?(\d+)/i) || fileForFloorExtraction?.name.match(/(\d+)/i);
        const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;

        // Only show spawn point for current floor
        if (floorIndex !== currentFloor) return null;

        return (
          <group key={`spawn-${floorIndex}`} position={spawnPoint}>
            {/* Spawn point sphere */}
            <mesh position={[0, 0.1, 0]}>
              <sphereGeometry args={[0.2]} />
              <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.5} />
            </mesh>
            {/* Spawn point cylinder (marker pole) */}
            <mesh position={[0, 1, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 2, 8]} />
              <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
            </mesh>
            {/* Spawn point label */}
            <mesh position={[0, 2.2, 0]}>
              <sphereGeometry args={[0.1]} />
              <meshStandardMaterial color="#00ff00" />
            </mesh>
          </group>
        );
      })}

      {/* Floor click handler for object placement */}
      {isAddingObject && onFloorClickForObjectPlacement && (
        <FloorClickHandler
          isAddingObject={isAddingObject}
          onFloorClick={onFloorClickForObjectPlacement}
        />
      )}

      {/* Floor click handler for spawn point setting */}
      {setSpawnPointMode && onFloorClickForSpawnPoint && (
        <FloorClickHandler
          isAddingObject={setSpawnPointMode}
          onFloorClick={onFloorClickForSpawnPoint}
        />
      )}

      {/* Floor click handler for measurement */}
      {isMeasuring && onFloorClickForMeasurement && (
        <FloorClickHandler
          isAddingObject={isMeasuring}
          onFloorClick={onFloorClickForMeasurement}
        />
      )}

      {/* Measurement visualization */}
      {isMeasuring && measurementPoints.length > 0 && (() => {
        const [point1, point2] = measurementPoints;

        // Calculate distance if we have 2 points
        const distance = point2
          ? Math.sqrt(
              Math.pow(point2[0] - point1[0], 2) +
              Math.pow(point2[1] - point1[1], 2) +
              Math.pow(point2[2] - point1[2], 2)
            )
          : 0;

        // Calculate midpoint for label
        const midpoint: [number, number, number] = point2
          ? [
              (point1[0] + point2[0]) / 2,
              (point1[1] + point2[1]) / 2 + 0.5, // Offset upward for visibility
              (point1[2] + point2[2]) / 2,
            ]
          : point1;

        return (
          <group>
            {/* First point marker */}
            <mesh position={point1}>
              <sphereGeometry args={[0.075]} />
              <meshStandardMaterial color="#0088ff" emissive="#0088ff" emissiveIntensity={0.5} />
            </mesh>

            {/* Second point marker (if exists) */}
            {point2 && (
              <>
                <mesh position={point2}>
                  <sphereGeometry args={[0.075]} />
                  <meshStandardMaterial color="#0088ff" emissive="#0088ff" emissiveIntensity={0.5} />
                </mesh>

                {/* Line connecting points */}
                <line>
                  <bufferGeometry
                    attach="geometry"
                    onUpdate={(self) => {
                      const positions = new Float32Array([
                        point1[0], point1[1], point1[2],
                        point2[0], point2[1], point2[2],
                      ]);
                      self.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    }}
                  />
                  <lineBasicMaterial attach="material" color="#0088ff" linewidth={2} />
                </line>

                {/* Distance label */}
                <Billboard position={midpoint}>
                  <Text
                    fontSize={0.3}
                    color="#0088ff"
                    anchorX="center"
                    anchorY="middle"
                  >
                    {distance.toFixed(2)}m
                  </Text>
                </Billboard>
              </>
            )}
          </group>
        );
      })()}

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