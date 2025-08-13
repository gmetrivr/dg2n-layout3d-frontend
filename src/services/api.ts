import type { ToleranceOverrides } from '../types/tolerance';

const API_BASE_URL = import.meta.env.MODE==="production"?'https://ec2-prod-rhino.dg2n.com':"http://localhost:8081";

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  files_processed: number;
  total_files: number;
  output_dir?: string;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface UploadResponse {
  job_id: string;
  message: string;
  files_uploaded: string[];
  total_files: number;
}

export const apiService = {
  async uploadDwgFile(
    file: File, 
    pipelineVersion: string = '01', 
    toleranceOverrides: ToleranceOverrides = {}
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('pipeline_version', pipelineVersion);
    
    // Add tolerance overrides if any are provided
    if (Object.keys(toleranceOverrides).length > 0) {
      formData.append('tolerance_overrides', JSON.stringify(toleranceOverrides));
    }

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }

    return response.json();
  },

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000);
    
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
        signal: controller.signal
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get job status: ${response.statusText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async getAllJobs(): Promise<JobStatus[]> {
    const response = await fetch(`${API_BASE_URL}/jobs`);
    
    if (!response.ok) {
      throw new Error(`Failed to get jobs: ${response.statusText}`);
    }

    return response.json();
  },

  async downloadFile(jobId: string, fileName: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for downloads
    
    try {
      const response = await fetch(`${API_BASE_URL}/download/${jobId}/${fileName}`, {
        signal: controller.signal
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } finally {
      clearTimeout(timeoutId);
    }
  },
  
  async downloadJobZip(jobId: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for downloads
    
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/download-zip`, {
        signal: controller.signal
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download ZIP: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${jobId}_output.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async fetchJobFilesAsZip(jobId: string): Promise<Blob> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for downloads
    
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/download-zip`, {
        signal: controller.signal
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ZIP: ${response.statusText}`);
      }

      return response.blob();
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async getToleranceDefaults(pipelineVersion: string): Promise<{ pipeline_version: string; default_tolerances: Record<string, number> }> {
    const response = await fetch(`${API_BASE_URL}/config/tolerances/${pipelineVersion}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get tolerance defaults: ${response.statusText}`);
    }

    return response.json();
  }
};