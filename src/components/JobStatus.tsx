import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/shadcn/components/ui/button";
import { CheckCircle, Clock, AlertCircle, Loader2, Download, Eye } from 'lucide-react';
import { apiService, type JobStatus as JobStatusType } from '../services/api';

interface JobStatusProps {
  jobId: string;
  onReset: () => void;
}

export function JobStatus({ jobId, onReset }: JobStatusProps) {
  const navigate = useNavigate();
  const [job, setJob] = useState<JobStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingFiles, setDownloadingFiles] = useState<boolean>(false);
  const [filesDownloaded, setFilesDownloaded] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(150); // 2.5 minutes in seconds

  // Reset timer when jobId changes (new job)
  useEffect(() => {
    setTimeRemaining(150);
    setJob(null);
    setLoading(true);
  }, [jobId]);

  useEffect(() => {
    const fetchJobStatus = async () => {
      try {
        const jobData = await apiService.getJobStatus(jobId);
        
        // Reset timer when job status changes to pending/processing for the first time
        if (!job && (jobData.status === 'pending' || jobData.status === 'processing')) {
          setTimeRemaining(150); // Reset to 2.5 minutes
        }
        
        setJob(jobData);
        setError(null);
        setRetryCount(0);
        
      } catch (err) {
        const maxRetries = 3;
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, delay);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to fetch job status');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchJobStatus();
    
    // Progressive polling: 15s during processing, 2s otherwise
    const interval = setInterval(() => {
      if (job?.status === 'pending' || job?.status === 'processing') {
        fetchJobStatus();
      }
    }, job?.status === 'processing' ? 15000 : 2000);

    return () => clearInterval(interval);
  }, [jobId, job?.status, filesDownloaded, retryCount]);

  // Countdown timer - starts immediately and runs until job completes
  useEffect(() => {
    if (job?.status === 'completed' || job?.status === 'failed') {
      return; // Don't run timer for completed/failed jobs
    }

    const timer = setInterval(() => {
      setTimeRemaining(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [job?.status]);

  const handleManualDownload = async () => {
    if (!job?.job_id) return;
    
    try {
      setDownloadingFiles(true);
      await apiService.downloadJobZip(job.job_id);
      setFilesDownloaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download files');
    } finally {
      setDownloadingFiles(false);
    }
  };

  const handleVisualize = () => {
    navigate(`/3d-viewer-modifier?jobId=${jobId}`);
  };

  const getStatusIcon = () => {
    if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

    switch (job?.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const formatTime = (seconds: number) => {
    const isNegative = seconds < 0;
    const absSeconds = Math.abs(seconds);
    const mins = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    const formattedTime = `${mins}:${secs.toString().padStart(2, '0')}`;
    return isNegative ? `+${formattedTime}` : formattedTime;
  };

  const getTimeColor = (seconds: number) => {
    return seconds < 0 ? 'text-yellow-500' : 'text-muted-foreground';
  };

  const getStatusText = () => {
    if (loading || !job) return 'Processing...';
    
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
        return 'Processing...';
    }
  };

  const showTimer = loading || job?.status === 'pending' || job?.status === 'processing';


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
            {showTimer && (
              <p className={`text-sm ${getTimeColor(timeRemaining)}`}>
                Est. {formatTime(timeRemaining)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">Job ID: {jobId}</p>
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
            Results Ready
          </h4>
          <div className="text-center p-4 space-y-3">
            {filesDownloaded ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-500 mx-auto" />
                  <p className="text-sm text-foreground font-medium">
                    All files downloaded successfully!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Check your Downloads folder for the generated files
                  </p>
                </div>
                <Button 
                  onClick={handleVisualize} 
                  className="w-full"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Visualize 3D Models
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button 
                  onClick={handleManualDownload}
                  disabled={downloadingFiles}
                  className="w-full"
                >
                  {downloadingFiles ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download All Files
                </Button>
                <Button 
                  onClick={handleVisualize} 
                  className="w-full"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Visualize 3D Models
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {job?.status === 'completed' && (
        <Button onClick={onReset} variant="outline" className="w-full">
          Process Another File
        </Button>
      )}

    </div>
  );
}