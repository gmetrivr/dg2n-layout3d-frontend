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
        spawnPoint: string = '0,0,0'
      ) {
        const formData = new FormData();
        formData.append('entity', entity);
        formData.append('store', storeId);
        formData.append('store3dZip', zipBlob, `${storeName}.zip`);
        formData.append('spawnPoint', spawnPoint);

        const response = await fetch('https://stockflow-core.dg2n.com/api/tooling/processStore3DZip', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to make store live: ${response.status} ${errorText}`);
        }

        return await response.json();
      },
    }),
    []
  );
};
