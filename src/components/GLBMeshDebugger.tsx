import { useState, useEffect, Suspense, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from '@react-three/drei';
import { BoxHelper } from "three";
import { Button } from "@/shadcn/components/ui/button";
import { ArrowLeft } from 'lucide-react';
import { DoubleSide, Mesh, MeshBasicMaterial } from "three";
import { SkeletonUtils } from "three-stdlib";

interface MeshInfo {
  name: string | null;
  type: string;
  hasGeometry: boolean;
  vertexCount: number;
  materialCount: number;
  id: string;
  isClicked: boolean;
}

function GLBAnalyzer({ file }: { file: File }) {
  const [meshes, setMeshes] = useState<MeshInfo[]>([]);
  const [glbUrl, setGlbUrl] = useState<string>('');
  const [clickedMeshId, setClickedMeshId] = useState<string | null>(null);
  const [useBboxClickable, setUseBboxClickable] = useState(false);

  const handleMeshClick = (meshId: string) => {
    console.log(meshId,"check");
    setClickedMeshId(meshId);
    setMeshes(prevMeshes => 
      prevMeshes.map(mesh => ({
        ...mesh,
        isClicked: mesh.id === meshId
      }))
    );
  };

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setGlbUrl(url);
    
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <div className="h-screen flex">
      {/* Left side - 3D viewer */}
      <div className="flex-1">
        <Canvas camera={{ position: [10, 10, 10], fov: 50 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <OrbitControls />
          
          <Suspense fallback={null}>
            <GLBScene url={glbUrl} onMeshesFound={setMeshes} onMeshClick={handleMeshClick} clickedMeshId={clickedMeshId} useBboxClickable={useBboxClickable} />
          </Suspense>
        </Canvas>
      </div>
      
      {/* Right side - mesh list */}
      <div className="w-96 bg-background border-l border-border p-4 overflow-y-auto">
        <div className="mb-4">
          <h3 className="font-semibold mb-2">Mesh Names Found ({meshes.length})</h3>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="bbox-clickable"
              checked={useBboxClickable}
              onChange={(e) => setUseBboxClickable(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="bbox-clickable" className="text-muted-foreground">
              Use bbox clickable areas (vs exact geometry)
            </label>
          </div>
        </div>
        
        <div className="space-y-2">
          {meshes.map((mesh, index) => (
            <div 
              key={index} 
              className={`p-3 border rounded-lg cursor-pointer transition-all ${
                mesh.isClicked 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-border hover:border-blue-300'
              }`}
              onClick={() => handleMeshClick(mesh.id)}
            >
              <div className="font-mono text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">Name:</span>{' '}
                    <span className={mesh.name ? 'text-green-600' : 'text-red-600'}>
                      {mesh.name || 'NULL'}
                    </span>
                  </div>
                  {mesh.isClicked && (
                    <div className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
                      CLICKED
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>ID: {mesh.id}</div>
                  <div>Type: {mesh.type}</div>
                  <div>Vertices: {mesh.vertexCount}</div>
                  <div>Materials: {mesh.materialCount}</div>
                  <div>Has Geometry: {mesh.hasGeometry ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </div>
          ))}
          
          {meshes.length === 0 && (
            <div className="text-muted-foreground text-center py-8">
              No meshes found yet...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getRandomColor(): string {
  // Generate a random number between 0 and 0xFFFFFF (16777215)
  const randomNum = Math.floor(Math.random() * 0xffffff);

  // Convert to hexadecimal and pad with zeros if needed
  const hexColor = `#${randomNum.toString(16).padStart(6, "0")}`;

  return hexColor;
}

function getRandomNumber(min: number, max: number): number {
  // Ensure min is inclusive and max is exclusive
  return Math.random() * (max - min) + min;
}

function GLBScene({ 
  url, 
  onMeshesFound, 
  // onMeshClick,
  clickedMeshId,
}: { 
  url: string; 
  onMeshesFound: (meshes: MeshInfo[]) => void;
  onMeshClick: (meshId: string) => void;
  clickedMeshId: string | null;
  useBboxClickable: boolean;
}) {
  const gltf = useGLTF(url);

  const meshes = useMemo(() => {
    if (!gltf?.scene) return [];
    const cloned = SkeletonUtils.clone(gltf.scene);
    const foundMeshes: Mesh[] = [];

    cloned.traverse((child: any) => {
      if (child.isMesh) {
        child.material = new MeshBasicMaterial({ color: getRandomColor() });
        child.material.side = DoubleSide;
        child.position.y += getRandomNumber(0, 5);
        foundMeshes.push(child);
      }
    });

    return foundMeshes;
  }, [gltf]);

  const threeScene = useThree(s => s.scene)

  useEffect(() => {
    if(meshes.length === 0) {
      return
    }
    const boxHelpers: BoxHelper[] = [];
    for(const o of meshes) {
      o.geometry.computeBoundingBox();
      const box = new BoxHelper(o);
      threeScene.add(box);
    }

    return () => {
      for(const b of boxHelpers) {
        threeScene.remove(b);
      }
    };
  }, [meshes, threeScene]);

  // useEffect(() => {
  //   if (!gltf?.scene) return;
  //   const foundMeshes: MeshInfo[] = [];
  //
  //   gltf.scene.traverse((child: any) => {
  //     if (child.isMesh) {
  //       const meshId = child.userData.meshId ?? child.uuid;
  //       child.userData.meshId = meshId;
  //
  //       // Store original material once
  //       if (!child.userData.origMat && child.material) {
  //         child.userData.origMat = child.material.clone?.() ?? child.material;
  //       }
  //
  //       foundMeshes.push({
  //         name: child.name || null,
  //         type: child.type,
  //         hasGeometry: !!child.geometry,
  //         vertexCount: child.geometry?.attributes?.position?.count || 0,
  //         materialCount: Array.isArray(child.material) ? child.material.length : (child.material ? 1 : 0),
  //         id: meshId,
  //         isClicked: false,
  //       });
  //     }
  //   });
  //
  //   onMeshesFound(foundMeshes);
  // }, [gltf, onMeshesFound]);

  // Highlight clicked mesh by swapping material (restore others)
  // useEffect(() => {
  //   if (!gltf?.scene) return;
  //   gltf.scene.traverse((child: any) => {
  //     if (!child.isMesh) return;
  //     const isHit = child.userData.meshId === clickedMeshId;
  //     if (isHit) {
  //       // Use fresh material to avoid mutating shared ones
  //       child.material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  //     } else if (child.userData.origMat) {
  //       child.material = child.userData.origMat;
  //     }
  //   });
  // }, [gltf, clickedMeshId]);

  const handleClick = (e: any) => {
    e.stopPropagation();
    console.log('CLICK DETECTED! Hit object:', e.object, 'MeshId:', e.object.userData.meshId);
    // const hit = e.object; // This is the actual intersected mesh
    // const id = hit.userData.meshId ?? hit.uuid;
    // onMeshClick(id);
  };

  return (
    <group>
      {
        meshes.map((mesh, i) => (
          <primitive key={mesh.uuid + i} object={mesh} onClick={handleClick} renderOrder={i} />
        ))
      }
    </group>
    // Events on the root primitive will fire with the actual child in e.object
    // <primitive object={gltf.scene} onClick={handleClick} />
  );
}

export function GLBMeshDebugger() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-background border-b border-border p-4 flex items-center gap-4">
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">GLB Mesh Debugger</h1>
      </div>

      {/* Main content */}
      {!selectedFile ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="p-6 border border-muted rounded-lg text-center max-w-md">
            <h2 className="text-lg font-semibold mb-4">Upload GLB File</h2>
            <div className="border-2 border-dashed border-muted rounded-lg p-8 mb-4 hover:border-primary/50 transition-colors cursor-pointer">
              <input
                type="file"
                accept=".glb"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSelectedFile(file);
                }}
                className="hidden"
                id="glb-upload"
              />
              <label htmlFor="glb-upload" className="cursor-pointer flex flex-col items-center space-y-2">
                <div className="text-4xl text-muted-foreground">📁</div>
                <div className="text-sm font-medium">Click to upload GLB file</div>
                <div className="text-xs text-muted-foreground">Or drag and drop</div>
              </label>
            </div>
          </div>
        </div>
      ) : (
        <GLBAnalyzer file={selectedFile} />
      )}
    </div>
  );
}