import { GLTFLoader, DRACOLoader } from 'three-stdlib';
import * as THREE from 'three';

export interface ColumnRect {
  /** Center position in XZ plane */
  cx: number;
  cy: number;
  /** Width and depth in XZ plane */
  width: number;
  depth: number;
}

export interface FloorOutline {
  /** Boundary edge segments: each is [[x1,y1],[x2,y2]] */
  edges: [[number, number], [number, number]][];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Column rectangles extracted from the GLB */
  columns: ColumnRect[];
}

/**
 * Extract 2D floor outline from a GLB blob or URL.
 * For each mesh, projects triangles onto the XZ plane and finds boundary edges
 * (edges belonging to only one triangle within that mesh).
 */
const COLUMN_NAME_PATTERNS = ['column', 'pillar'];

function isColumnMesh(name: string): boolean {
  const lower = name.toLowerCase();
  return COLUMN_NAME_PATTERNS.some((p) => lower.includes(p));
}

export async function extractFloorOutline(glbBlobOrUrl: string | Blob): Promise<FloorOutline> {
  const gltf = await loadGLB(glbBlobOrUrl);
  const allEdges: [[number, number], [number, number]][] = [];
  const columns: ColumnRect[] = [];

  gltf.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;

    const name = child.name || '';

    if (isColumnMesh(name)) {
      // Extract column as a bounding rect in XZ
      const col = extractColumnRect(child);
      if (col) columns.push(col);
      return;
    }

    const meshEdges = extractMeshBoundaryEdges(child);
    allEdges.push(...meshEdges);
  });

  console.log(`[floorOutline] Collected ${allEdges.length} boundary edges, ${columns.length} columns`);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [[x1, y1], [x2, y2]] of allEdges) {
    if (x1 < minX) minX = x1;
    if (x1 > maxX) maxX = x1;
    if (y1 < minY) minY = y1;
    if (y1 > maxY) maxY = y1;
    if (x2 < minX) minX = x2;
    if (x2 > maxX) maxX = x2;
    if (y2 < minY) minY = y2;
    if (y2 > maxY) maxY = y2;
  }

  const bounds = allEdges.length > 0
    ? { minX, maxX, minY, maxY }
    : { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  console.log(`[floorOutline] Bounds:`, bounds);
  return { edges: allEdges, bounds, columns };
}

async function loadGLB(blobOrUrl: string | Blob): Promise<{ scene: THREE.Group }> {
  let arrayBuffer: ArrayBuffer;
  if (blobOrUrl instanceof Blob) {
    arrayBuffer = await blobOrUrl.arrayBuffer();
  } else {
    const response = await fetch(blobOrUrl);
    arrayBuffer = await response.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);

    loader.parse(
      arrayBuffer,
      '',
      (gltf) => {
        dracoLoader.dispose();
        resolve(gltf);
      },
      (error) => {
        dracoLoader.dispose();
        reject(error);
      }
    );
  });
}

const PRECISION = 4;

function ptKey(x: number, y: number): string {
  return `${x.toFixed(PRECISION)},${y.toFixed(PRECISION)}`;
}

function edgeSortedKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * For a single mesh, project its triangles to XZ and return boundary edges.
 */
function extractMeshBoundaryEdges(mesh: THREE.Mesh): [[number, number], [number, number]][] {
  const geo = mesh.geometry;
  mesh.updateMatrixWorld(true);
  const posAttr = geo.attributes.position;
  if (!posAttr) return [];

  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  // Collect projected triangles for this mesh
  const triangles: [number, number][][] = [];
  const index = geo.index;

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      for (let j = 0; j < 3; j++) {
        const idx = index.getX(i + j);
        v[j].set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
        v[j].applyMatrix4(mesh.matrixWorld);
      }
      triangles.push([[v[0].x, v[0].z], [v[1].x, v[1].z], [v[2].x, v[2].z]]);
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      for (let j = 0; j < 3; j++) {
        v[j].set(posAttr.getX(i + j), posAttr.getY(i + j), posAttr.getZ(i + j));
        v[j].applyMatrix4(mesh.matrixWorld);
      }
      triangles.push([[v[0].x, v[0].z], [v[1].x, v[1].z], [v[2].x, v[2].z]]);
    }
  }

  // Count edge occurrences
  const edgeCount = new Map<string, number>();
  const edgeCoords = new Map<string, [[number, number], [number, number]]>();

  for (const tri of triangles) {
    const keys = tri.map(([x, y]) => ptKey(x, y));
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const ek = edgeSortedKey(keys[i], keys[j]);
      edgeCount.set(ek, (edgeCount.get(ek) || 0) + 1);
      if (!edgeCoords.has(ek)) {
        edgeCoords.set(ek, [tri[i], tri[j]]);
      }
    }
  }

  // Return edges that appear only once (boundary)
  const boundary: [[number, number], [number, number]][] = [];
  for (const [ek, count] of edgeCount.entries()) {
    if (count === 1) {
      boundary.push(edgeCoords.get(ek)!);
    }
  }

  return boundary;
}

/**
 * Extract a column mesh's bounding box projected to XZ as a rectangle.
 */
function extractColumnRect(mesh: THREE.Mesh): ColumnRect | null {
  const geo = mesh.geometry;
  mesh.updateMatrixWorld(true);
  const posAttr = geo.attributes.position;
  if (!posAttr || posAttr.count === 0) return null;

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  const v = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    v.applyMatrix4(mesh.matrixWorld);
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }

  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (width <= 0 || depth <= 0) return null;

  return {
    cx: (minX + maxX) / 2,
    cy: (minZ + maxZ) / 2,
    width,
    depth,
  };
}
