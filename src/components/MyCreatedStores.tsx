import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/shadcn/components/ui/button';
import { DEFAULT_BUCKET, useSupabaseService } from '../services/supabaseService';
import type { StoreSaveRow } from '../services/supabaseService';
import { loadStoreMasterData, type StoreData } from '../utils/csvUtils';

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
  const [storeData, setStoreData] = useState<StoreData[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const navigate = useNavigate();
  const { listStoreRecords, removeZipAndRow, downloadZip, makeStoreLive } = useSupabaseService();

  const fetchRows = useCallback(
    async (query?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listStoreRecords(query);
        setRows(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load stores';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [listStoreRecords]
  );

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  // Load store master data for region filtering
  useEffect(() => {
    const loadStores = async () => {
      setIsLoadingStores(true);
      try {
        const stores = await loadStoreMasterData();
        setStoreData(stores);
      } catch (error) {
        console.error('Failed to load store master data:', error);
      } finally {
        setIsLoadingStores(false);
      }
    };

    loadStores();
  }, []);

  // Reset downstream filters when upstream filters change
  useEffect(() => {
    // Reset state and city when region changes
    setSelectedState('all');
    setSelectedCity('all');
  }, [selectedRegion]);

  useEffect(() => {
    // Reset city when state changes
    setSelectedCity('all');
  }, [selectedState]);

  // Get unique regions from store data (case-insensitive)
  const availableRegions = useMemo(() => {
    const regions = storeData.map(store => store.zone).filter(Boolean);
    // Create a map to track unique regions by lowercase version
    const uniqueRegions = new Map<string, string>();
    regions.forEach(region => {
      const lowerRegion = region.toLowerCase();
      if (!uniqueRegions.has(lowerRegion)) {
        // Store the first occurrence (preserving original case)
        uniqueRegions.set(lowerRegion, region);
      }
    });
    return Array.from(uniqueRegions.values()).sort();
  }, [storeData]);

  // Get unique states from store data (filtered by selected region)
  const availableStates = useMemo(() => {
    let filteredStores = storeData;

    // Filter stores by selected region first
    if (selectedRegion !== 'all') {
      filteredStores = storeData.filter(store =>
        store.zone?.toLowerCase() === selectedRegion.toLowerCase()
      );
    }

    const states = filteredStores.map(store => store.state).filter(Boolean);
    const uniqueStates = new Map<string, string>();
    states.forEach(state => {
      const lowerState = state.toLowerCase();
      if (!uniqueStates.has(lowerState)) {
        uniqueStates.set(lowerState, state);
      }
    });
    return Array.from(uniqueStates.values()).sort();
  }, [storeData, selectedRegion]);

  // Get unique cities from store data (filtered by selected region and state)
  const availableCities = useMemo(() => {
    let filteredStores = storeData;

    // Filter stores by selected region first
    if (selectedRegion !== 'all') {
      filteredStores = filteredStores.filter(store =>
        store.zone?.toLowerCase() === selectedRegion.toLowerCase()
      );
    }

    // Then filter by selected state
    if (selectedState !== 'all') {
      filteredStores = filteredStores.filter(store =>
        store.state?.toLowerCase() === selectedState.toLowerCase()
      );
    }

    const cities = filteredStores.map(store => store.city).filter(Boolean);
    const uniqueCities = new Map<string, string>();
    cities.forEach(city => {
      const lowerCity = city.toLowerCase();
      if (!uniqueCities.has(lowerCity)) {
        uniqueCities.set(lowerCity, city);
      }
    });
    return Array.from(uniqueCities.values()).sort();
  }, [storeData, selectedRegion, selectedState]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const storeInfo = storeData.find(store => store.storeCode === row.store_id);

      // Filter by region
      if (selectedRegion !== 'all') {
        if (storeInfo?.zone?.toLowerCase() !== selectedRegion.toLowerCase()) {
          return false;
        }
      }

      // Filter by state
      if (selectedState !== 'all') {
        if (storeInfo?.state?.toLowerCase() !== selectedState.toLowerCase()) {
          return false;
        }
      }

      // Filter by city
      if (selectedCity !== 'all') {
        if (storeInfo?.city?.toLowerCase() !== selectedCity.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [rows, selectedRegion, selectedState, selectedCity, storeData]);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Created Stores</h1>
        <div className="flex items-center gap-2">
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border border-border bg-background"
            disabled={isLoadingStores}
          >
            <option value="all">All Regions</option>
            {availableRegions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border border-border bg-background"
            disabled={isLoadingStores}
          >
            <option value="all">All States</option>
            {availableStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border border-border bg-background"
            disabled={isLoadingStores}
          >
            <option value="all">All Cities</option>
            {availableCities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
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
              setSelectedRegion('all');
              setSelectedState('all');
              setSelectedCity('all');
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
                  Loading.
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
                      {/* <Button
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
                      </Button> */}
                      <Button
                        variant="link"
                        className="px-0"
                        disabled={makingLiveId === r.id}
                        onClick={async () => {
                          const ok = confirm(
                            'Only one version can be live per Store ID. Make this live and override any existing live version?'
                          );
                          if (!ok) return;

                          try {
                            setMakingLiveId(r.id);

                            // Download the ZIP file first
                            const zipBlob = await downloadZip(r.zip_path, DEFAULT_BUCKET);

                            // Make the store live using the API
                            await makeStoreLive(r.store_id, r.store_name, zipBlob);

                            alert(`Store "${r.store_name}" is now live!`);
                          } catch (error) {
                            const message = error instanceof Error ? error.message : 'Failed to make store live';
                            alert(`Error: ${message}`);
                            setError(message);
                          } finally {
                            setMakingLiveId(null);
                          }
                        }}
                      >
                        {makingLiveId === r.id ? 'Making Live...' : 'Make Live'}
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
