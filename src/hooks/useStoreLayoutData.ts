import { useState, useEffect, useCallback } from 'react';
import { useSupabaseService, type StoreSaveRow } from '../services/supabaseService';
import { extractZipFiles, isFloorFile, type ExtractedFile } from '../utils/zipUtils';
import { migrateBrandsInZip } from '../utils/brandMigration';
import { apiService } from '../services/api';
import { fetchBlockTypeMapping } from '../services/fixtureTypeMapping';
import type { LocationData } from './useFixtureSelection';

export interface StoreLayoutData {
  locationData: LocationData[];
  setLocationData: React.Dispatch<React.SetStateAction<LocationData[]>>;
  extractedFiles: ExtractedFile[];
  floorFiles: ExtractedFile[];
  fixtureTypeMap: Map<string, string>;
  brandCategoryMapping: Record<string, string>;
  storeRecord: StoreSaveRow | null;
  zipBlob: Blob | null;
  fixtureTypes: string[];
  brands: string[];
  floorIndices: number[];
  loading: boolean;
  error: string | null;
}

export function useStoreLayoutData(storeId: string | undefined): StoreLayoutData {
  const [locationData, setLocationData] = useState<LocationData[]>([]);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [floorFiles, setFloorFiles] = useState<ExtractedFile[]>([]);
  const [fixtureTypeMap, setFixtureTypeMap] = useState<Map<string, string>>(new Map());
  const [brandCategoryMapping, setBrandCategoryMapping] = useState<Record<string, string>>({});
  const [storeRecord, setStoreRecord] = useState<StoreSaveRow | null>(null);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [fixtureTypes, setFixtureTypes] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [floorIndices, setFloorIndices] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useSupabaseService();

  const loadData = useCallback(async () => {
    if (!storeId) {
      setError('No store ID provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Find most recent live record for this store
      const allRecords = await supabase.listStoreRecords(storeId);
      const liveRecords = allRecords
        .filter((r: StoreSaveRow) => r.store_id === storeId && r.status === 'live')
        .sort((a: StoreSaveRow, b: StoreSaveRow) => {
          const aTime = a.live_at ? new Date(a.live_at).getTime() : 0;
          const bTime = b.live_at ? new Date(b.live_at).getTime() : 0;
          return bTime - aTime;
        });

      if (liveRecords.length === 0) {
        setError(`No live version found for store "${storeId}"`);
        setLoading(false);
        return;
      }

      const record = liveRecords[0];
      setStoreRecord(record);

      // 2-3. Download and migrate ZIP
      let blob = await supabase.downloadZip(record.zip_path);
      const migrationResult = await migrateBrandsInZip(blob);
      blob = migrationResult.zipBlob;
      setZipBlob(blob);

      // 4. Extract files
      const files = await extractZipFiles(blob);
      setExtractedFiles(files);

      // 5. Identify floor GLB files
      const floors = files.filter((f) => isFloorFile(f.name));
      setFloorFiles(floors);

      // 6. Parse location-master.csv
      const csvFile = files.find(
        (f) => f.name.toLowerCase().includes('location') && f.name.toLowerCase().endsWith('.csv')
      );

      let parsedData: LocationData[] = [];
      if (csvFile) {
        const csvText = await csvFile.blob.text();
        parsedData = parseLocationCsv(csvText);
      }

      setLocationData(parsedData);

      // 7-8. Fetch mappings in parallel
      const [typeMap, catMappingRes, brandCatsRes] = await Promise.all([
        fetchBlockTypeMapping(),
        apiService.getBrandCategoryMapping().catch(() => ({ brand_category_mapping: {} as Record<string, string> })),
        apiService.getBrandCategories().catch(() => ({ brands: [] as string[] })),
      ]);

      setFixtureTypeMap(typeMap);
      setBrandCategoryMapping(catMappingRes.brand_category_mapping);

      // Derive fixture types, brands, floor indices from parsed data
      const typeSet = new Set<string>();
      const brandSet = new Set<string>();
      const floorSet = new Set<number>();

      for (const loc of parsedData) {
        const ft = typeMap.get(loc.blockName) || loc.blockName;
        typeSet.add(ft);
        brandSet.add(loc.brand);
        floorSet.add(loc.floorIndex);
      }

      // Add all known brands from API
      if (brandCatsRes.brands) {
        for (const b of brandCatsRes.brands) brandSet.add(b);
      }

      setFixtureTypes(Array.from(typeSet).sort());
      setBrands(Array.from(brandSet).sort());
      setFloorIndices(Array.from(floorSet).sort((a, b) => a - b));
    } catch (err: any) {
      console.error('[useStoreLayoutData] Failed to load:', err);
      setError(err.message || 'Failed to load store data');
    } finally {
      setLoading(false);
    }
  }, [storeId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    locationData,
    setLocationData,
    extractedFiles,
    floorFiles,
    fixtureTypeMap,
    brandCategoryMapping,
    storeRecord,
    zipBlob,
    fixtureTypes,
    brands,
    floorIndices,
    loading,
    error,
  };
}

/**
 * Parse location-master.csv text into LocationData[].
 * Matches the exact parsing logic from 3DViewerModifier.
 */
function parseLocationCsv(csvText: string): LocationData[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  const data: LocationData[] = [];
  const ingestionTimestamp = Date.now();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < 14) continue;

    const blockName = values[0].trim();
    const floorIndex = parseInt(values[1]) || 0;
    const originX = parseFloat(values[2]) || 0;
    const originY = parseFloat(values[3]) || 0;
    const posX = parseFloat(values[5]) || 0;
    const posY = parseFloat(values[6]) || 0;
    const posZ = parseFloat(values[7]) || 0;
    const rotationX = parseFloat(values[8]) || 0;
    const rotationY = parseFloat(values[9]) || 0;
    const rotationZ = parseFloat(values[10]) || 0;
    const brand = values[11]?.trim() || 'unknown';
    const count = parseInt(values[12]) || 1;
    const hierarchy = parseInt(values[13]) || 0;
    const fixtureId = values[14]?.trim() || undefined;

    data.push({
      _stableId: `${ingestionTimestamp}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      blockName,
      floorIndex,
      originX,
      originY,
      posX,
      posY,
      posZ,
      rotationX,
      rotationY,
      rotationZ,
      brand,
      count,
      hierarchy,
      fixtureId,

      originalBlockName: blockName,
      originalPosX: posX,
      originalPosY: posY,
      originalPosZ: posZ,
      originalRotationX: rotationX,
      originalRotationY: rotationY,
      originalRotationZ: rotationZ,
      originalBrand: brand,
      originalCount: count,
      originalHierarchy: hierarchy,
      originalFixtureId: fixtureId,

      wasMoved: false,
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,
      wasDuplicated: false,

      _ingestionTimestamp: ingestionTimestamp + i,
    });
  }

  return data;
}
