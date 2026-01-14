import { useState, useCallback } from 'react';
import { Button } from "@/shadcn/components/ui/button";
import { Upload, FileText, AlertCircle, Settings, CheckCircle2, Clock, X, XCircle, Loader2 } from 'lucide-react';
import { apiService } from '../services/api';
import { ToleranceOverrideModal } from './ToleranceOverrideModal';
import type { ToleranceOverrides } from '../types/tolerance';

interface FileUploadProps {
  onUploadSuccess: (jobId: string) => void;
}

interface FileWithStatus {
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
  jobId?: string;
}

export function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileWithStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pipelineVersion, setPipelineVersion] = useState<string>('02');
  const [toleranceOverrides, setToleranceOverrides] = useState<ToleranceOverrides>({});
  const [showToleranceModal, setShowToleranceModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
    completed: 0,
    failed: 0
  });
  const [completedJobIds, setCompletedJobIds] = useState<string[]>([]);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!file.name.toLowerCase().endsWith('.dwg')) {
      return { valid: false, error: 'Must be a .dwg file' };
    }
    // Check for special characters that cause backend errors
    const specialCharsRegex = /[&,\s]/;
    if (specialCharsRegex.test(file.name)) {
      return { valid: false, error: 'Filename cannot contain &, comma, or spaces' };
    }
    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      return { valid: false, error: 'File size must be less than 100MB' };
    }
    return { valid: true };
  };

  const handleFilesSelect = (files: File[]) => {
    setError(null);
    const newFiles: FileWithStatus[] = files.map(file => {
      const validation = validateFile(file);
      return {
        file,
        status: validation.valid ? 'pending' : 'failed',
        error: validation.error
      } as FileWithStatus;
    });
    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFilesSelect(files);
    }
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setError(null);
    setUploadProgress({ current: 0, total: 0, completed: 0, failed: 0 });
    setCompletedJobIds([]);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleUpload = async () => {
    // Filter only valid files (status: 'pending')
    const validFiles = selectedFiles.filter(f => f.status === 'pending');
    if (validFiles.length === 0) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress({
      current: 0,
      total: validFiles.length,
      completed: 0,
      failed: 0
    });

    const jobIds: string[] = [];

    // Sequential upload
    for (let i = 0; i < validFiles.length; i++) {
      const fileIndex = selectedFiles.findIndex(f => f === validFiles[i]);

      // Update progress
      setUploadProgress(prev => ({ ...prev, current: i + 1 }));

      // Update file status to 'uploading'
      setSelectedFiles(prev => {
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], status: 'uploading' };
        return updated;
      });

      try {
        const response = await apiService.uploadDwgFile(
          validFiles[i].file,
          pipelineVersion,
          toleranceOverrides
        );

        // Mark as completed
        setSelectedFiles(prev => {
          const updated = [...prev];
          updated[fileIndex] = {
            ...updated[fileIndex],
            status: 'completed',
            jobId: response.job_id
          };
          return updated;
        });

        jobIds.push(response.job_id);
        setUploadProgress(prev => ({ ...prev, completed: prev.completed + 1 }));

      } catch (err) {
        // Mark as failed
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        setSelectedFiles(prev => {
          const updated = [...prev];
          updated[fileIndex] = {
            ...updated[fileIndex],
            status: 'failed',
            error: errorMsg
          };
          return updated;
        });

        setUploadProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
    }

    setCompletedJobIds(jobIds);
    setIsUploading(false);

    // Navigate to jobs page after 3 seconds if any succeeded
    if (jobIds.length > 0) {
      setTimeout(() => {
        onUploadSuccess(jobIds[0]);
      }, 3000);
    } else {
      setError('All uploads failed. Please check the errors and try again.');
    }
  };


  const validFilesCount = selectedFiles.filter(f => f.status === 'pending' || f.status === 'completed').length;
  const hasFiles = selectedFiles.length > 0;
  const allUploadsComplete = isUploading === false && selectedFiles.some(f => f.status === 'completed' || f.status === 'failed') && selectedFiles.every(f => f.status !== 'pending');

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Drag and Drop Area / File List */}
      <div
        className={`
          border-2 border-dashed rounded-lg transition-colors
          ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
          ${hasFiles ? 'p-4' : 'p-8 text-center'}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {!hasFiles ? (
          /* Empty State */
          <div className="space-y-4">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium text-foreground">Drop your DWG files here</p>
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
                input.multiple = true;
                input.onchange = (e) => {
                  const files = Array.from((e.target as HTMLInputElement).files || []);
                  if (files.length > 0) handleFilesSelect(files);
                };
                input.click();
              }}
            >
              Browse Files
            </Button>
          </div>
        ) : (
          /* File List */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground">
                Selected Files ({selectedFiles.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFiles}
                disabled={isUploading}
              >
                Clear All
              </Button>
            </div>

            {/* Upload Progress (if uploading) */}
            {isUploading && (
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    Uploading Files... ({uploadProgress.current} of {uploadProgress.total})
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-background rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Completed: {uploadProgress.completed}</span>
                  <span>Failed: {uploadProgress.failed}</span>
                </div>
              </div>
            )}

            {/* Completion Summary */}
            {allUploadsComplete && (
              <div className="bg-primary/10 border border-primary p-4 rounded-lg">
                <h3 className="font-medium text-foreground mb-2">Upload Complete!</h3>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    ✓ Successfully uploaded: {uploadProgress.completed} files
                  </span>
                  {uploadProgress.failed > 0 && (
                    <span className="text-destructive">
                      ✗ Failed: {uploadProgress.failed} files
                    </span>
                  )}
                </div>
                {completedJobIds.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Redirecting to Jobs page...
                  </p>
                )}
              </div>
            )}

            {/* File List */}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {selectedFiles.map((fileStatus, index) => {
                const statusIcon = {
                  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
                  uploading: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
                  completed: <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />,
                  failed: <XCircle className="h-4 w-4 text-destructive" />
                }[fileStatus.status];

                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-background border rounded-lg"
                  >
                    {statusIcon}
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {fileStatus.file.name}
                      </p>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>{(fileStatus.file.size / 1024 / 1024).toFixed(2)} MB</span>
                        {fileStatus.status === 'completed' && fileStatus.jobId && (
                          <span className="text-primary">Job #{fileStatus.jobId.slice(0, 8)}</span>
                        )}
                        {fileStatus.error && (
                          <span className="text-destructive">{fileStatus.error}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      disabled={isUploading || fileStatus.status === 'uploading'}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Add More Files Button */}
            {!isUploading && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.dwg';
                  input.multiple = true;
                  input.onchange = (e) => {
                    const files = Array.from((e.target as HTMLInputElement).files || []);
                    if (files.length > 0) handleFilesSelect(files);
                  };
                  input.click();
                }}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Add More Files
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Configuration Section */}
      {hasFiles && !allUploadsComplete && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Pipeline Version (applies to all files):
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

          <Button
            onClick={handleUpload}
            disabled={isUploading || validFilesCount === 0}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading {uploadProgress.current} of {uploadProgress.total}...
              </>
            ) : (
              `Process ${validFilesCount} File${validFilesCount !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      )}

      {/* Global Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Tolerance Override Modal */}
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