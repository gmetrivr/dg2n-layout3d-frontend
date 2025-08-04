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

export function getGlbTitle(fileName: string): string {
  if (fileName.includes('floor')) {
    const floorMatch = fileName.match(/floor-?(\d+)/i);
    return floorMatch ? `Floor ${floorMatch[1]}` : fileName.replace('.glb', '');
  }
  return fileName.replace('.glb', '');
}

export function cleanupExtractedFiles(files: ExtractedFile[]): void {
  files.forEach(file => {
    URL.revokeObjectURL(file.url);
  });
}