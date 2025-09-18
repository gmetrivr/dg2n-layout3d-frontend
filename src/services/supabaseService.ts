import { useMemo } from 'react';

import { useProxyClient } from './proxyClient';

export const DEFAULT_BUCKET = (import.meta as any).env?.VITE_SUPABASE_BUCKET || 'store-archives';

export interface StoreSaveRecord {
  store_id: string;
  store_name: string;
  zip_path: string;
  zip_size?: number;
  job_id?: string | null;
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
  const client = useProxyClient();

  return useMemo(
    () => ({
      client,
      async insertStoreRecord(record: StoreSaveRecord) {
        const rows = await client.db<StoreSaveRow[]>(
          {
            table: 'store_saves',
            action: 'insert',
            payload: {
              store_id: record.store_id,
              store_name: record.store_name,
              zip_path: record.zip_path,
              zip_size: record.zip_size ?? null,
              job_id: record.job_id ?? null,
            },
          }
        );

        return rows[0];
      },
      async uploadStoreZip(
        filePath: string,
        blob: Blob,
        { bucket = DEFAULT_BUCKET, contentType = 'application/zip' }: UploadOptions = {}
      ) {
        return client.storage.upload({
          bucket,
          path: filePath,
          body: blob,
          contentType,
          upsert: true,
        });
      },
      async getPublicZipUrl(path: string, bucket: string = DEFAULT_BUCKET) {
        return client.storage.publicUrl({ bucket, path });
      },
      async downloadZip(path: string, bucket: string = DEFAULT_BUCKET) {
        return client.storage.download({ bucket, path });
      },
      async removeZipAndRow(id: string, path: string, bucket: string = DEFAULT_BUCKET) {
        try {
          await client.storage.remove({ bucket, paths: [path] });
        } catch (error) {
          console.warn('Failed to remove object from storage, continuing to delete DB row', error);
        }

        await client.db({
          table: 'store_saves',
          action: 'delete',
          filters: [
            {
              column: 'id',
              operator: 'eq',
              value: id,
            },
          ],
        });
      },
    }),
    [client]
  );
};