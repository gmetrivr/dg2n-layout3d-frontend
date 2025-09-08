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

export interface BrandCategory {
  prefix: string;
  description: string;
  items: string[];
}

export interface BrandCategoriesResponse {
  brands: string[]; // Legacy flat list for backward compatibility
  categories: {
    brands: {
      private_label: BrandCategory;
      external: BrandCategory;
    };
    areas: {
      general: BrandCategory;
      architectural: BrandCategory;
      other: BrandCategory;
    };
    aliases?: Record<string, string>;
    summary: {
      total_private_labels: number;
      total_external_brands: number;
      total_general_areas: number;
      total_architectural_areas: number;
      total_other_areas: number;
    };
  };
}

export interface FixtureBlock {
  block_name: string;
  fixture_type: string;
  glb_url: string;
}

export interface FixtureTypeInfo {
  fixture_type: string;
  glb_url: string;
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
  },

  async getBrands(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/brands`);
    
    if (!response.ok) {
      throw new Error(`Failed to get brands: ${response.statusText}`);
    }

    const data = await response.json();
    return data.brands || [];
  },

  async getBrandCategories(): Promise<BrandCategoriesResponse> {
    const response = await fetch(`${API_BASE_URL}/api/brands`);
    
    if (!response.ok) {
      throw new Error(`Failed to get brand categories: ${response.statusText}`);
    }

    return response.json();
  },

  // Fixture API endpoints
  async getFixtureBlocks(blockNames: string[]): Promise<FixtureBlock[]> {
    const response = await fetch(`${API_BASE_URL}/api/fixtures/blocks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(blockNames),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get fixture blocks: ${response.statusText}`);
    }

    return response.json();
  },

  async getFixtureTypeUrl(fixtureType: string): Promise<FixtureTypeInfo> {
    const response = await fetch(`${API_BASE_URL}/api/fixtures/type/${encodeURIComponent(fixtureType)}/url`);
    
    if (!response.ok) {
      throw new Error(`Failed to get fixture type URL: ${response.statusText}`);
    }

    return response.json();
  },

  async getAllFixtureTypes(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/fixtures/types`);
    
    if (!response.ok) {
      throw new Error(`Failed to get all fixture types: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.fixture_types;
  }
};