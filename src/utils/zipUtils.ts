import JSZip from 'jszip';

export interface ExtractedFile {
  name: string;
  blob: Blob;
  url: string;
  type: string;
}

export async function extractZipFiles(zipBlob: Blob): Promise<ExtractedFile[]> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(zipBlob);
  const extractedFiles: ExtractedFile[] = [];

  for (const [fileName, file] of Object.entries(zipContent.files)) {
    if (!file.dir) {
      const blob = await file.async('blob');
      const url = URL.createObjectURL(blob);
      const type = getFileType(fileName);
      
      extractedFiles.push({
        name: fileName,
        blob,
        url,
        type
      });
    }
  }

  return extractedFiles;
}

export function getFileType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'glb':
      return '3d-model';
    case 'csv':
      return 'report';
    case 'txt':
    case 'log':
      return 'log';
    default:
      return 'unknown';
  }
}

export function isFloorFile(fileName: string): boolean {
  // Check if file is a GLB
  if (!fileName.toLowerCase().endsWith('.glb')) {
    return false;
  }

  // Check for default floor patterns
  if (fileName.includes('dg2n-3d-floor-')) {
    return true;
  }

  // Check for renamed floor patterns (e.g., custom-name-floor-0.glb, ground-floor-floor_1.glb)
  // Pattern: any prefix followed by -floor- or _floor_ or -floor_ followed by a number
  if (fileName.match(/[-_]floor[-_]?\d+\.glb$/i)) {
    return true;
  }

  return false;
}

export function isShatteredFloorPlateFile(fileName: string): boolean {
  return fileName.includes('dg2n-shattered-floor-plates-');
}

export function getGlbTitle(fileName: string): string {
  // Remove .glb extension
  const nameWithoutExt = fileName.replace('.glb', '');

  // Check if this is a default floor file (dg2n-3d-floor-N or dg2n-shattered-floor-plates-N)
  if (nameWithoutExt.match(/^dg2n-(3d-floor|shattered-floor-plates)[-_]?\d+$/i)) {
    const floorMatch = nameWithoutExt.match(/floor[-_]?(\d+)/i);
    return floorMatch ? `Floor ${floorMatch[1]}` : nameWithoutExt;
  }

  // Check if this has a custom name with floor number pattern
  if (fileName.includes('floor')) {
    // Try to extract custom name prefix before floor number
    // Patterns: custom-name-floor-0, custom-name-floor_0, etc.
    const customMatch = nameWithoutExt.match(/^(.+?)[-_]floor[-_]?(\d+)$/i);
    if (customMatch) {
      // Extract the custom name prefix
      const customName = customMatch[1];
      // Format: replace hyphens/underscores with spaces, capitalize words
      return customName
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .map(word => {
          // If word is all uppercase (2+ chars), keep it uppercase (e.g., FF, GF)
          if (word.length > 1 && word === word.toUpperCase()) {
            return word;
          }
          // Otherwise, apply title case
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
    }

    // Fallback: just extract floor number
    const floorMatch = nameWithoutExt.match(/floor[-_]?(\d+)/i);
    if (floorMatch) {
      return `Floor ${floorMatch[1]}`;
    }
  }

  return nameWithoutExt;
}

export function cleanupExtractedFiles(files: ExtractedFile[]): void {
  files.forEach(file => {
    URL.revokeObjectURL(file.url);
  });
}