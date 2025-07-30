const API_BASE_URL = 'https://ec2-prod-rhino.dg2n.com';

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
  async uploadDwgFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('files', file);

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response.json();
  },

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    return response.json();
  },

  async getAllJobs(): Promise<JobStatus[]> {
    const response = await fetch(`${API_BASE_URL}/jobs`);
    
    if (!response.ok) {
      throw new Error(`Failed to get jobs: ${response.statusText}`);
    }

    return response.json();
  }
};