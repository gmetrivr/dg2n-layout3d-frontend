import { useState, useEffect } from 'react';
import { Button } from "@/shadcn/components/ui/button";
import { CheckCircle, Clock, AlertCircle, Loader2, Download } from 'lucide-react';
import { apiService, type JobStatus as JobStatusType } from '../services/api';

interface JobStatusProps {
  jobId: string;
  onReset: () => void;
}

export function JobStatus({ jobId, onReset }: JobStatusProps) {
  const [job, setJob] = useState<JobStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  useEffect(() => {
    const fetchJobStatus = async () => {
      try {
        const jobData = await apiService.getJobStatus(jobId);
        setJob(jobData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch job status');
      } finally {
        setLoading(false);
      }
    };

    fetchJobStatus();
    
    // Poll every 2 seconds if job is still processing
    const interval = setInterval(() => {
      if (job?.status === 'pending' || job?.status === 'processing') {
        fetchJobStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const handleDownload = async (fileName: string) => {
    try {
      setDownloadingFile(fileName);
      await apiService.downloadFile(jobId, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download file');
    } finally {
      setDownloadingFile(null);
    }
  };

  const getStatusIcon = () => {
    if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;
    
    switch (job?.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    if (loading) return 'Loading...';
    
    switch (job?.status) {
      case 'pending':
        return 'Queued for processing';
      case 'processing':
        return 'Processing your file...';
      case 'completed':
        return 'Processing completed successfully!';
      case 'failed':
        return 'Processing failed';
      default:
        return 'Unknown status';
    }
  };

  const getOutputFiles = () => {
    if (!job?.output_dir) return [];
    
    // Based on backend output structure
    return [
      { name: 'dg2n-3d-floor-0.glb', type: '3D Model (Floor 0)' },
      { name: 'dg2n-3d-floor-1.glb', type: '3D Model (Floor 1)' },
      { name: 'dg2n-3d-floor-2.glb', type: '3D Model (Floor 2)' },
      { name: 'dg2n-3d-floor-3.glb', type: '3D Model (Floor 3)' },
      { name: 'location-master.csv', type: 'Location Report' },
      { name: 'brand-fixture-report.csv', type: 'Brand Fixture Report' },
      { name: 'detailed-dg2n-log.txt', type: 'Processing Log' }
    ];
  };

  if (error) {
    return (
      <div className="w-full max-w-md mx-auto p-6 border rounded-lg border-destructive/20 bg-destructive/5">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <h3 className="font-medium text-destructive">Error</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button onClick={onReset} variant="outline" className="w-full">
          Upload Another File
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="p-6 border rounded-lg">
        <div className="flex items-center gap-3 mb-4">
          {getStatusIcon()}
          <div>
            <h3 className="font-medium text-foreground">{getStatusText()}</h3>
            <p className="text-sm text-muted-foreground">Job ID: {jobId.slice(0, 8)}...</p>
          </div>
        </div>

        {job && (job.status === 'processing' || job.status === 'pending') && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{job.progress}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>
        )}

        {job?.error_message && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-sm text-destructive">{job.error_message}</p>
          </div>
        )}
      </div>

      {job?.status === 'completed' && (
        <div className="p-6 border rounded-lg border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <Download className="h-4 w-4" />
            Generated Files
          </h4>
          <div className="space-y-2">
            {getOutputFiles().map((file) => (
              <div key={file.name} className="flex items-center justify-between p-2 bg-background rounded border">
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.type}</p>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleDownload(file.name)}
                  disabled={downloadingFile !== null}
                >
                  {downloadingFile === file.name ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Download'
                  )}
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Files are saved in: {job.output_dir}
          </p>
        </div>
      )}

      <Button onClick={onReset} variant="outline" className="w-full">
        Process Another File
      </Button>
    </div>
  );
}