import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, Suspense, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Grid, Text } from '@react-three/drei';
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
       selectedLocation.posX === location.posX &&
       selectedLocation.posY === location.posY &&
       selectedLocation.posZ === location.posZ && (
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
}

function LocationGLB({ location, onError, onClick, selectedLocation }: LocationGLBProps) {
  // Calculate bounding box once when GLB loads
  const [boundingBox, setBoundingBox] = useState({ size: [1, 1, 1], center: [0, 0.5, 0] });
  const isSelected = selectedLocation && 
    selectedLocation.blockName === location.blockName &&
    selectedLocation.posX === location.posX &&
    selectedLocation.posY === location.posY &&
    selectedLocation.posZ === location.posZ;
  
  try {
    const { scene } = useGLTF(location.glbUrl!);
    
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
    
    // Convert degrees to radians for Three.js rotation
    const rotationX = (location.rotationX * Math.PI) / 180;
    const rotationY = (location.rotationY * Math.PI) / 180;
    const rotationZ = (location.rotationZ * Math.PI) / 180;
    
    return (
      <group position={[location.posX, location.posZ, -location.posY]}>
        <primitive 
          object={scene.clone()} 
          rotation={[rotationX, rotationZ, rotationY]}
          scale={[1, 1, 1]}
        />
        {/* Transparent bounding box for clicking */}
        <mesh
          onClick={() => onClick?.(location)}
          position={boundingBox.center as [number,number,number]}
        >
          <boxGeometry args={boundingBox.size as [number,number,number]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
        
        {/* Red edge outline when selected - use calculated bounding box */}
        {isSelected && (
          <lineSegments position={boundingBox.center as [number,number,number]} renderOrder={999}>
            <edgesGeometry args={[new THREE.BoxGeometry(...boundingBox.size)]} />
            <lineBasicMaterial color="red" />
          </lineSegments>
        )}
      </group>
    );
  } catch (error) {
    onError?.(location.blockName, location.glbUrl || 'unknown');
    return (
      <mesh 
        position={[location.posX, location.posZ, -location.posY]}
        onClick={() => onClick?.(location)}
      >
        <sphereGeometry args={[0.2]} />
        <meshStandardMaterial color="#ff6b6b" />
      </mesh>
    );
  }
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
  
  if (!gltf?.scene) {
    return null;
  }
  
  return <primitive object={gltf.scene} />;
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

      const glbFiles = files.filter(file => file.name.toLowerCase().endsWith('.glb'));
      setGlbFiles(glbFiles);
      
      if (glbFiles.length > 0) {
        setSelectedFile(glbFiles[0]);
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
        
        // Filter GLB files
        const glbFiles = extracted.filter(file => file.type === '3d-model');
        setGlbFiles(glbFiles);
        
        // Select first GLB file by default
        if (glbFiles.length > 0) {
          setSelectedFile(glbFiles[0]);
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

    loadLocationData();
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
      {/* Top Bar */}
      <header className="bg-background border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <span className="text-sm text-muted-foreground">
              Job: {jobId?.slice(0, 8)}... | {extractedFiles.length} files extracted
            </span>
            {selectedFile && (
              <span className="text-xs text-muted-foreground max-w-xs truncate">
                Current: {selectedFile.name}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Model:</label>
              <Select 
                value={selectedFile?.name || ''} 
                onChange={(e) => {
                  const file = glbFiles.find(f => f.name === e.target.value);
                  setSelectedFile(file || null);
                }}
                className="w-48"
              >
                {glbFiles.map((file) => (
                  <option key={file.name} value={file.name}>
                    {getGlbTitle(file.name)}
                  </option>
                ))}
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="showSpheres" 
                checked={showSpheres}
                onChange={(e) => setShowSpheres(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="showSpheres" className="text-sm font-medium">Show Locations</label>
            </div>
          </div>
        </div>
      </header>

      {/* 3D Canvas */}
      <div className="flex-1 relative">
        <Canvas
          camera={{ position: cameraPosition, fov: 50 }}
          shadows
          className="bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800"
          onPointerMissed={() => setSelectedLocation(null)}
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
              {selectedFile && (
                <GLBModel file={selectedFile} onBoundsCalculated={handleBoundsCalculated} />
              )}
            </Suspense>
          </ModelErrorBoundary>
          
          {/* Render location objects (GLBs or spheres) for currently selected floor */}
          {showSpheres && selectedFile && locationData.length > 0 && (() => {
            // Extract floor index from selected GLB file name
            const floorMatch = selectedFile.name.match(/floor[_-]?(\d+)/i) || selectedFile.name.match(/(\d+)/i);
            const currentFloor = floorMatch ? parseInt(floorMatch[1]) : 0;
            
            return locationData
              .filter(location => location.floorIndex === currentFloor)
              .map((location, index) => (
                location.glbUrl ? (
                  <LocationGLB 
                    key={`${location.blockName}-${index}`} 
                    location={location}
                    onClick={setSelectedLocation}
                    selectedLocation={selectedLocation}
                    onError={handleGLBError}
                  />
                ) : (
                  <LocationSphere 
                    key={`${location.blockName}-${index}`} 
                    location={location}
                    color={`hsl(${(index * 137.5) % 360}, 70%, 50%)`}
                    onClick={setSelectedLocation}
                    selectedLocation={selectedLocation}
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
          />
        </Canvas>
        
        {/* Location Info Overlay */}
        {selectedLocation && (
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
              <div><span className="font-medium">Position:</span> ({selectedLocation.posX.toFixed(2)}, {selectedLocation.posY.toFixed(2)}, {selectedLocation.posZ.toFixed(2)})</div>
              <div><span className="font-medium">Rotation:</span> ({selectedLocation.rotationX.toFixed(2)}°, {selectedLocation.rotationY.toFixed(2)}°, {selectedLocation.rotationZ.toFixed(2)}°)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}