import { useState, useCallback } from 'react';
import { Button } from "@/shadcn/components/ui/button";
import { Upload, FileText, AlertCircle, Settings } from 'lucide-react';
import { apiService } from '../services/api';
import { ToleranceOverrideModal } from './ToleranceOverrideModal';
import type { ToleranceOverrides } from '../types/tolerance';

interface FileUploadProps {
  onUploadSuccess: (jobId: string) => void;
}

export function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pipelineVersion, setPipelineVersion] = useState<string>('02');
  const [toleranceOverrides, setToleranceOverrides] = useState<ToleranceOverrides>({});
  const [showToleranceModal, setShowToleranceModal] = useState(false);

  const validateFile = (file: File): boolean => {
    if (!file.name.toLowerCase().endsWith('.dwg')) {
      setError('Please select a .dwg file');
      return false;
    }
    // Check for special characters that cause backend errors
    const specialCharsRegex = /[&,\s]/;
    if (specialCharsRegex.test(file.name)) {
      setError('Filename cannot contain special characters like &, comma, or spaces');
      return false;
    }
    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      setError('File size must be less than 100MB');
      return false;
    }
    return true;
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    if (validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const response = await apiService.uploadDwgFile(selectedFile, pipelineVersion, toleranceOverrides);
      onUploadSuccess(response.job_id);
      setSelectedFile(null);
      setToleranceOverrides({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };


  return (
    <div className="w-full max-w-md mx-auto">
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
          ${selectedFile ? 'border-primary bg-primary/5' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {selectedFile ? (
          <div className="space-y-4">
            <FileText className="mx-auto h-12 w-12 text-primary" />
            <div>
              <p className="font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Pick a Pipeline:
                </label>
                <select
                  value={pipelineVersion}
                  onChange={(e) => setPipelineVersion(e.target.value)}
                  className="w-full p-2 border rounded bg-background text-foreground"
                  disabled={isUploading}
                >
                  <option value="02">02 High Precision</option>
                  <option value="01">01-Default</option>
                </select>
              </div>
              
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setShowToleranceModal(true)}
                  disabled={isUploading}
                  className="flex items-center gap-2 text-xs"
                >
                  <Settings className="h-3 w-3" />
                  Advanced Settings
                  {Object.keys(toleranceOverrides).length > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full ml-1">
                      {Object.keys(toleranceOverrides).length}
                    </span>
                  )}
                </Button>
              </div>

              <div className="flex gap-2 justify-center">
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="px-6"
                >
                  {isUploading ? 'Uploading...' : 'Process File'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null);
                    setToleranceOverrides({});
                  }}
                  disabled={isUploading}
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium text-foreground">Drop your DWG file here</p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse files
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.dwg';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileSelect(file);
                };
                input.click();
              }}
            >
              Browse Files
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <ToleranceOverrideModal
        open={showToleranceModal}
        onOpenChange={setShowToleranceModal}
        pipelineVersion={pipelineVersion}
        currentOverrides={toleranceOverrides}
        onApply={setToleranceOverrides}
      />
    </div>
  );
}