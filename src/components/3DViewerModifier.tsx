import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, Suspense, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Grid, Text } from '@react-three/drei';
import { Button } from "@/shadcn/components/ui/button";
import { Select } from "../components/ui/select";
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiService, type JobStatus } from '../services/api';
import { extractZipFiles, getGlbTitle, cleanupExtractedFiles, type ExtractedFile } from '../utils/zipUtils';

interface GLBModelProps {
  file: ExtractedFile;
}

function GLBModel({ file }: GLBModelProps) {
  const gltf = useGLTF(file.url);
  
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

  useEffect(() => {
    const fetchAndExtractFiles = async () => {
      if (!jobId) {
        setError('No job ID provided');
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

  if (error || !jobId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="p-6 border border-destructive/20 bg-destructive/5 rounded-lg">
          <p className="text-destructive mb-4">{error || 'No job ID provided'}</p>
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
      <header className="bg-background border-b border-border p-4">
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
          </div>
        </div>
      </header>

      {/* 3D Canvas */}
      <div className="flex-1">
        <Canvas
          camera={{ position: [10, 10, 10], fov: 50 }}
          shadows
          className="bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800"
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
                <GLBModel file={selectedFile} />
              )}
            </Suspense>
          </ModelErrorBoundary>
          
          <OrbitControls 
            enablePan={true} 
            enableZoom={true} 
            enableRotate={true} 
            dampingFactor={0.05}
            rotateSpeed={0.5}
            zoomSpeed={0.5}
          />
        </Canvas>
      </div>
    </div>
  );
}