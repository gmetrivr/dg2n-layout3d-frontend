import { useMemo } from 'react';

import { supabase } from '../lib/supabaseClient';

export const DEFAULT_BUCKET = (import.meta as any).env?.VITE_SUPABASE_BUCKET || 'store-archives';

export interface StoreSaveRecord {
  store_id: string;
  store_name: string;
  zip_path: string;
  zip_size?: number;
  job_id?: string | null;
  entity?: string | null;
}

export interface StoreSaveRow extends StoreSaveRecord {
  id: string;
  created_at: string;
}

export interface StoreFixtureId {
  fixture_id: string;
  store_id: string;
  fixture_type: string;
  brand: string;
  floor_index: number;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  created_at: string; // First time fixture was created (preserved across updates)
}

export interface StoreFixtureIdRow extends StoreFixtureId {
  id: string;
  updated_at: string; // When this specific entry was created
}

export interface StoreDeployment {
  store_id: string;
  store_name: string;
  entity: string;
  status: 'deploying' | 'in_process' | 'live' | 'failed';
  deployed_at?: string;
  live_at?: string | null;
  version?: string | null;
  deployment_url?: string | null;
  metadata?: Record<string, any>;
  api_response?: any;
  error_message?: string | null;
}

export interface StoreDeploymentRow extends StoreDeployment {
  id: string;
  deployed_at: string; // Override to make required (always set by DB)
  created_at: string;
  updated_at: string;
}

type UploadOptions = {
  bucket?: string;
  contentType?: string;
};

export const useSupabaseService = () => {
  return useMemo(
    () => ({
      async listStoreRecords(search?: string) {
        const trimmed = search?.trim();
        let query = supabase
          .from('store_saves')
          .select('id, created_at, store_id, store_name, job_id, zip_path, zip_size, entity');

        if (trimmed) {
          query = query.ilike('store_id', `%${trimmed}%`);
        }

        const { data, error } = await query;
        if (error) {
          throw new Error(error.message || 'Failed to load stores');
        }

        return (data ?? []).sort(
          (a: StoreSaveRow, b: StoreSaveRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      },
      async insertStoreRecord(record: StoreSaveRecord) {
        const { data, error } = await supabase
          .from('store_saves')
          .insert({
            store_id: record.store_id,
            store_name: record.store_name,
            zip_path: record.zip_path,
            zip_size: record.zip_size ?? null,
            job_id: record.job_id ?? null,
            entity: record.entity ?? null,
          })
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to save store record');
        }

        return data as StoreSaveRow;
      },
      async uploadStoreZip(
        filePath: string,
        blob: Blob,
        { bucket = DEFAULT_BUCKET, contentType = 'application/zip' }: UploadOptions = {}
      ) {
        const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
          contentType,
          upsert: true,
        });

        if (error) {
          throw new Error(error.message || 'Failed to upload ZIP');
        }
      },
      async getPublicZipUrl(path: string, bucket: string = DEFAULT_BUCKET) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        if (!data?.publicUrl) {
          throw new Error('Failed to get public URL');
        }

        return data.publicUrl;
      },
      async downloadZip(path: string, bucket: string = DEFAULT_BUCKET) {
        const { data, error } = await supabase.storage.from(bucket).download(path);
        if (error) {
          throw new Error(error.message || 'Failed to download ZIP');
        }

        return data;
      },
      async removeZipAndRow(id: string, path: string, bucket: string = DEFAULT_BUCKET) {
        const { error: storageError } = await supabase.storage.from(bucket).remove([path]);
        if (storageError) {
          console.warn('Failed to remove object from storage, continuing to delete DB row', storageError);
        }

        const { error } = await supabase.from('store_saves').delete().eq('id', id);
        if (error) {
          throw new Error(error.message || 'Failed to delete record');
        }
      },
      async makeStoreLive(
        storeId: string,
        storeName: string,
        zipBlob: Blob,
        entity: string = 'trends',
        spawnPoint: string = '0,0,0',
        options?: {
          nocName?: string;
          sapName?: string;
          zone?: string;
          state?: string;
          city?: string;
          format?: string;
          formatType?: string;
        }
      ) {
        const formData = new FormData();
        formData.append('entity', entity);
        formData.append('store', storeId);
        formData.append('store3dZip', zipBlob, `${storeName}.zip`);
        formData.append('spawnPoint', spawnPoint);
        formData.append('storeName', storeName);

        // Append optional fields if provided
        if (options?.nocName) formData.append('nocName', options.nocName);
        if (options?.sapName) formData.append('sapName', options.sapName);
        if (options?.zone) formData.append('zone', options.zone);
        if (options?.state) formData.append('state', options.state);
        if (options?.city) formData.append('city', options.city);
        if (options?.format) formData.append('formate', options.format);
        if (options?.formatType) formData.append('formatType', options.formatType);

        const apiUrl = (import.meta as any).env?.VITE_API_URL || '';
        const response = await fetch(`${apiUrl}/api/tooling/processStore3DZip`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to make store live: ${response.status} ${errorText}`);
        }

        return await response.json();
      },

      // Store Fixture ID (SFI) CRUD operations
      async getStoreFixtures(storeId: string) {
        // Get latest entry for each fixture using DISTINCT ON
        const { data, error } = await supabase
          .from('store_fixture_ids')
          .select('*')
          .eq('store_id', storeId)
          .order('fixture_id', { ascending: true })
          .order('updated_at', { ascending: false });

        if (error) {
          throw new Error(error.message || 'Failed to get store fixtures');
        }

        // Filter to get only latest entry per fixture_id (client-side dedup)
        const latestByFixture = new Map<string, StoreFixtureIdRow>();
        for (const row of (data ?? [])) {
          const existing = latestByFixture.get(row.fixture_id);
          if (!existing || new Date(row.updated_at) > new Date(existing.updated_at)) {
            latestByFixture.set(row.fixture_id, row as StoreFixtureIdRow);
          }
        }

        return Array.from(latestByFixture.values());
      },

      async insertFixtures(fixtures: StoreFixtureId[]) {
        // Always INSERT new rows (history tracking)
        const { data, error } = await supabase
          .from('store_fixture_ids')
          .insert(
            fixtures.map((f) => ({
              fixture_id: f.fixture_id,
              store_id: f.store_id,
              fixture_type: f.fixture_type,
              brand: f.brand,
              floor_index: f.floor_index,
              pos_x: f.pos_x,
              pos_y: f.pos_y,
              pos_z: f.pos_z,
              created_at: f.created_at, // Preserved from existing or new timestamp
              updated_at: new Date().toISOString(), // New timestamp for this entry
            }))
          )
          .select();

        if (error) {
          throw new Error(error.message || 'Failed to insert fixtures');
        }

        return (data ?? []) as StoreFixtureIdRow[];
      },

      async getFixturesByBrand(storeId: string, brand: string) {
        // Get all fixtures with brand, then filter to latest
        const { data, error } = await supabase
          .from('store_fixture_ids')
          .select('*')
          .eq('store_id', storeId)
          .eq('brand', brand)
          .order('fixture_id', { ascending: true })
          .order('updated_at', { ascending: false });

        if (error) {
          throw new Error(error.message || 'Failed to get fixtures by brand');
        }

        // Filter to get only latest entry per fixture_id
        const latestByFixture = new Map<string, StoreFixtureIdRow>();
        for (const row of (data ?? [])) {
          if (!latestByFixture.has(row.fixture_id)) {
            latestByFixture.set(row.fixture_id, row as StoreFixtureIdRow);
          }
        }

        return Array.from(latestByFixture.values());
      },

      async getFixtureHistory(storeId: string, fixtureId: string) {
        // Get full history for a specific fixture
        const { data, error } = await supabase
          .from('store_fixture_ids')
          .select('*')
          .eq('store_id', storeId)
          .eq('fixture_id', fixtureId)
          .order('updated_at', { ascending: false });

        if (error) {
          throw new Error(error.message || 'Failed to get fixture history');
        }

        return (data ?? []) as StoreFixtureIdRow[];
      },

      async getFixturesByFloor(storeId: string, floorIndex: number) {
        // Get all fixtures on a specific floor
        const { data, error } = await supabase
          .from('store_fixture_ids')
          .select('*')
          .eq('store_id', storeId)
          .eq('floor_index', floorIndex)
          .order('fixture_id', { ascending: true })
          .order('updated_at', { ascending: false });

        if (error) {
          throw new Error(error.message || 'Failed to get fixtures by floor');
        }

        // Filter to get only latest entry per fixture_id
        const latestByFixture = new Map<string, StoreFixtureIdRow>();
        for (const row of (data ?? [])) {
          if (!latestByFixture.has(row.fixture_id)) {
            latestByFixture.set(row.fixture_id, row as StoreFixtureIdRow);
          }
        }

        return Array.from(latestByFixture.values());
      },

      async deleteStoreFixtures(storeId: string) {
        // Delete all history for a store
        const { error } = await supabase
          .from('store_fixture_ids')
          .delete()
          .eq('store_id', storeId);

        if (error) {
          throw new Error(error.message || 'Failed to delete store fixtures');
        }
      },

      // Store Deployment tracking operations
      async createDeployment(deployment: StoreDeployment) {
        const { data, error } = await supabase
          .from('store_deployments')
          .insert({
            store_id: deployment.store_id,
            store_name: deployment.store_name,
            entity: deployment.entity,
            status: deployment.status,
            deployed_at: deployment.deployed_at || new Date().toISOString(),
            live_at: deployment.live_at || null,
            version: deployment.version || null,
            deployment_url: deployment.deployment_url || null,
            metadata: deployment.metadata || {},
            api_response: deployment.api_response || null,
            error_message: deployment.error_message || null,
          })
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to create deployment record');
        }

        return data as StoreDeploymentRow;
      },

      async listDeployments(storeId?: string, limit: number = 50) {
        let query = supabase
          .from('store_deployments')
          .select('*')
          .order('deployed_at', { ascending: false })
          .limit(limit);

        if (storeId) {
          query = query.eq('store_id', storeId);
        }

        const { data, error } = await query;
        if (error) {
          throw new Error(error.message || 'Failed to list deployments');
        }

        return (data ?? []) as StoreDeploymentRow[];
      },

      async getLatestDeployment(storeId: string) {
        const { data, error } = await supabase
          .from('store_deployments')
          .select('*')
          .eq('store_id', storeId)
          .order('deployed_at', { ascending: false })
          .limit(1)
          .single();

        if (error) {
          // Return null if no deployment found (not an error)
          if (error.code === 'PGRST116') {
            return null;
          }
          throw new Error(error.message || 'Failed to get latest deployment');
        }

        return data as StoreDeploymentRow;
      },

      async updateDeploymentStatus(
        id: string,
        status: 'deploying' | 'in_process' | 'live' | 'failed',
        additionalFields?: Partial<StoreDeployment>
      ) {
        const updateData: any = {
          status,
          ...additionalFields,
        };

        // Automatically set live_at when transitioning to 'live'
        if (status === 'live' && !updateData.live_at) {
          updateData.live_at = new Date().toISOString();
        }

        const { data, error } = await supabase
          .from('store_deployments')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Failed to update deployment status');
        }

        return data as StoreDeploymentRow;
      },

      async getActiveDeployments() {
        const { data, error } = await supabase
          .from('store_deployments')
          .select('*')
          .in('status', ['deploying', 'in_process'])
          .order('deployed_at', { ascending: false });

        if (error) {
          throw new Error(error.message || 'Failed to get active deployments');
        }

        return (data ?? []) as StoreDeploymentRow[];
      },

      async getDeploymentHistory(storeId: string, limit: number = 10) {
        const { data, error } = await supabase
          .from('store_deployments')
          .select('*')
          .eq('store_id', storeId)
          .order('deployed_at', { ascending: false })
          .limit(limit);

        if (error) {
          throw new Error(error.message || 'Failed to get deployment history');
        }

        return (data ?? []) as StoreDeploymentRow[];
      },
    }),
    []
  );
};
