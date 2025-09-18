import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/shadcn/components/ui/button';
import { DEFAULT_BUCKET, useSupabaseService } from '../services/supabaseService';
import type { StoreSaveRow } from '../services/supabaseService';

function formatBytes(bytes?: number | null) {
  if (bytes == null) return '-';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function MyCreatedStores() {
  const [rows, setRows] = useState<StoreSaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [makingLiveId, setMakingLiveId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { client, removeZipAndRow, downloadZip } = useSupabaseService();

  const fetchRows = useCallback(
    async (query?: string) => {
      setLoading(true);
      setError(null);
      try {
        const trimmed = query?.trim();
        const filters = trimmed
          ? [{
              column: 'store_id',
              operator: 'ilike' as const,
              value: `%${trimmed}%`,
            }]
          : undefined;

        const data = await client.db<StoreSaveRow[]>(
          {
            table: 'store_saves',
            action: 'select',
            columns: 'id, created_at, store_id, store_name, job_id, zip_path, zip_size',
            filters,
          }
        );

        const sorted = [...data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setRows(sorted);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load stores';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const filteredRows = useMemo(() => rows, [rows]);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Created Stores</h1>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void fetchRows(search);
            }}
            placeholder="Search by Store ID"
            className="px-3 py-1.5 text-sm rounded border border-border bg-background"
          />
          <Button size="sm" onClick={() => void fetchRows(search)}>Search</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch('');
              void fetchRows('');
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-destructive">{error}</div>}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Store ID</th>
              <th className="text-left px-3 py-2">Store Name</th>
              <th className="text-left px-3 py-2">Job ID</th>
              <th className="text-left px-3 py-2">ZIP Size</th>
              <th className="text-left px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4" colSpan={6}>
                  No rows
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 align-top">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 align-top font-mono">{r.store_id}</td>
                  <td className="px-3 py-2 align-top">{r.store_name}</td>
                  <td className="px-3 py-2 align-top font-mono">{r.job_id || '-'}</td>
                  <td className="px-3 py-2 align-top">{formatBytes(r.zip_size)}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="link"
                        className="px-0"
                        onClick={async () => {
                          try {
                            const blob = await downloadZip(r.zip_path, DEFAULT_BUCKET);
                            const url = URL.createObjectURL(blob);
                            const anchor = document.createElement('a');
                            anchor.href = url;
                            const name = r.zip_path.split('/').pop() || 'store.zip';
                            anchor.download = name;
                            document.body.appendChild(anchor);
                            anchor.click();
                            document.body.removeChild(anchor);
                            URL.revokeObjectURL(url);
                          } catch (e) {
                            const message = e instanceof Error ? e.message : 'Download failed';
                            alert(`Download failed: ${message}`);
                          }
                        }}
                      >
                        Download
                      </Button>
                      <Button
                        variant="link"
                        className="px-0"
                        onClick={() => {
                          const bucket = DEFAULT_BUCKET;
                          const path = encodeURIComponent(r.zip_path);
                          navigate(`/3d-viewer-modifier?bucket=${encodeURIComponent(bucket)}&zipPath=${path}`);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="link"
                        className="px-0 text-destructive"
                        disabled={deletingId === r.id}
                        onClick={async () => {
                          if (!confirm('Delete this record and its ZIP?')) return;
                          try {
                            setDeletingId(r.id);
                            await removeZipAndRow(r.id, r.zip_path, DEFAULT_BUCKET);
                            setRows((prev) => prev.filter((x) => x.id !== r.id));
                          } catch (e) {
                            const message = e instanceof Error ? e.message : 'Failed to delete record';
                            setError(message);
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                      >
                        Delete
                      </Button>
                      <Button
                        variant="link"
                        className="px-0"
                        disabled={makingLiveId === r.id}
                        onClick={() => {
                          const ok = confirm(
                            'Only one version can be live per Store ID. Make this live and override any existing live version?'
                          );
                          if (!ok) return;
                          setMakingLiveId(r.id);
                          setTimeout(() => setMakingLiveId(null), 600);
                          alert('Make Live is not implemented yet. We will wire this next.');
                        }}
                      >
                        Make Live
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MyCreatedStores;
