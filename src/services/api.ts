import type { ToleranceOverrides } from '../types/tolerance';

// Rhino server - Job management only (upload, jobs, downloads)
const RHINO_API_BASE_URL = import.meta.env.MODE === "production"
  ? 'https://ec2-prod-rhino.dg2n.com'
  : ""; // Empty string uses relative URLs (goes through Vite proxy)

// Fastify backend - Config, brands, fixtures
const FASTIFY_API_BASE_URL =
  import.meta.env.MODE === "production"
    ? 'https://dg2n-layout3d-backend.rc.dg2n.com'
    : import.meta.env.MODE === "rc" || import.meta.env.MODE === "staging"
      ? 'https://dg2n-layout3d-backend.rc.dg2n.com'
      : ""; // Empty string uses relative URLs (goes through Vite proxy)

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

export interface BrandMigrationsResponse {
  pipeline_version: string;
  migrations: Record<string, string>;
  total_migrations: number;
}

export interface BrandMigrationResult {
  old_name: string;
  new_name: string;
  changed: boolean;
}

export interface MigrateBrandsResponse {
  pipeline_version: string;
  migrations: BrandMigrationResult[];
  total_changed: number;
}

export interface DirectRenderTypesResponse {
  pipeline_version: string;
  direct_render_fixture_types: string[];
  count: number;
}

export interface FixtureTypesWithVariantsResponse {
  pipeline_version: string;
  fixture_types_with_variants: string[];
  count: number;
}

export interface FixtureVariant {
  id: string;              // Variant ID (e.g., "stair_straight")
  name: string;            // Display name (e.g., "Straight Staircase")
  description?: string;    // Variant description
  url: string;             // GLB file URL
  thumbnail?: string;      // Thumbnail image URL for preview
  // Deprecated fields (for backwards compatibility):
  block_name?: string;     // Deprecated: use 'name' instead
  glb_url?: string;        // Deprecated: use 'url' instead
}

export interface FixtureTypeVariantsResponse {
  fixture_type: string;
  variants: FixtureVariant[];
  count: number;
}

export interface BrandCategoryMappingResponse {
  brand_category_mapping: Record<string, string>;
  categories_grouped: Record<string, string[]>;
  unique_categories: string[];
  total_brands: number;
  total_categories: number;
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

    const response = await fetch(`${RHINO_API_BASE_URL}/upload`, {
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
      const response = await fetch(`${RHINO_API_BASE_URL}/jobs/${jobId}`, {
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
    const response = await fetch(`${RHINO_API_BASE_URL}/jobs`);
    
    if (!response.ok) {
      throw new Error(`Failed to get jobs: ${response.statusText}`);
    }

    return response.json();
  },

  async downloadFile(jobId: string, fileName: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for downloads
    
    try {
      const response = await fetch(`${RHINO_API_BASE_URL}/download/${jobId}/${fileName}`, {
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
      const response = await fetch(`${RHINO_API_BASE_URL}/jobs/${jobId}/download-zip`, {
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
      const response = await fetch(`${RHINO_API_BASE_URL}/jobs/${jobId}/download-zip`, {
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
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/config/tolerances/${pipelineVersion}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get tolerance defaults: ${response.statusText}`);
    }

    return response.json();
  },

  async getBrands(pipelineVersion: string = '02'): Promise<string[]> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/brands?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      throw new Error(`Failed to get brands: ${response.statusText}`);
    }

    const data = await response.json();
    return data.brands;
  },

  async getBrandCategories(pipelineVersion: string = '02'): Promise<BrandCategoriesResponse> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/brands?pipeline_version=${pipelineVersion}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get brand categories: ${response.statusText}`);
    }

    return response.json();
  },

  // Fixture API endpoints
  async getFixtureBlocks(blockNames: string[], pipelineVersion: string = '02'): Promise<FixtureBlock[]> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/blocks?pipeline_version=${pipelineVersion}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ block_names: blockNames }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get fixture blocks: ${response.statusText}`);
    }

    return response.json();
  },

  async getFixtureTypeUrl(fixtureType: string, pipelineVersion: string = '02'): Promise<FixtureTypeInfo> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/type/${encodeURIComponent(fixtureType)}/url?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      throw new Error(`Failed to get fixture type URL: ${response.statusText}`);
    }

    return response.json();
  },

  async getAllFixtureTypes(): Promise<string[]> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/types?pipeline_version=02`);

    if (!response.ok) {
      throw new Error(`Failed to get all fixture types: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.fixture_types;
  },

  async getBlockNameForFixtureType(fixtureType: string, pipelineVersion: string = '02'): Promise<string | null> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/type/${encodeURIComponent(fixtureType)}/block-name?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      // If endpoint doesn't exist or returns error, return null
      console.warn(`Failed to get block name for fixture type ${fixtureType}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    // Use block_name property (which is the first from all_block_names on backend)
    return data.block_name || null;
  },

  // Brand migration endpoints
  async getBrandMigrations(pipelineVersion: string = '02'): Promise<BrandMigrationsResponse> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/brands/migrations?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      throw new Error(`Failed to get brand migrations: ${response.statusText}`);
    }

    return response.json();
  },

  async migrateBrandNames(brandNames: string[], pipelineVersion: string = '02'): Promise<MigrateBrandsResponse> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/brands/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand_names: brandNames,
        pipeline_version: pipelineVersion
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to migrate brand names: ${response.statusText}`);
    }

    return response.json();
  },

  // Direct render fixture types endpoint
  async getDirectRenderTypes(pipelineVersion: string = '02'): Promise<DirectRenderTypesResponse> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/direct-render-types?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      throw new Error(`Failed to get direct render types: ${response.statusText}`);
    }

    return response.json();
  },

  // Get all fixture types that support multiple variants
  async getFixtureTypesWithVariants(pipelineVersion: string = '02'): Promise<FixtureTypesWithVariantsResponse> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/variants?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      throw new Error(`Failed to get fixture types with variants: ${response.statusText}`);
    }

    return response.json();
  },

  // Get all variants for a specific fixture type
  async getFixtureTypeVariants(fixtureType: string, pipelineVersion: string = '02'): Promise<FixtureTypeVariantsResponse> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/type/${encodeURIComponent(fixtureType)}/variants?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      throw new Error(`Failed to get variants for fixture type ${fixtureType}: ${response.statusText}`);
    }

    return response.json();
  },

  // Get brand category mapping
  async getBrandCategoryMapping(pipelineVersion: string = '02'): Promise<BrandCategoryMappingResponse> {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/brands/category-mapping?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      throw new Error(`Failed to get brand category mapping: ${response.statusText}`);
    }

    return response.json();
  }
};