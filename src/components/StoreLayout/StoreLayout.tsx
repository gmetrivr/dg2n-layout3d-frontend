import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { Loader2, Eye } from 'lucide-react';
import JSZip from 'jszip';
import { useStoreLayoutData } from '../../hooks/useStoreLayoutData';
import { useSupabaseService } from '../../services/supabaseService';
import { extractFloorOutline, type FloorOutline } from '../../utils/floorOutlineExtractor';
import { serializeLocationDataToCsv } from '../../utils/layoutCsvSerializer';
import { migrateBrandsInZip } from '../../utils/brandMigration';
import { generateFixtureUID, type LocationData } from '../../hooks/useFixtureSelection';
import { LayoutCanvas } from './LayoutCanvas';
import { LayoutLeftPanel } from './LayoutLeftPanel';
import { LayoutRightPanel } from './LayoutRightPanel';
import { BrandSelectionModal } from '../BrandSelectionModal';
import { FixtureTypeSelectionModal } from '../FixtureTypeSelectionModal';

export function StoreLayout() {
  const { store_id } = useParams<{ store_id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const supabase = useSupabaseService();

  // View-only mode detection
  const isViewOnly = location.pathname.endsWith('/view');
  const qrFixtureId = searchParams.get('fixture_id');

  const {
    locationData,
    setLocationData,
    floorFiles,
    fixtureTypeMap,
    brandCategoryMapping,
    storeRecord,
    zipBlob,
    fixtureTypes,
    floorIndices,
    loading,
    error,
  } = useStoreLayoutData(store_id);

  // UI state
  const [selectedFloor, setSelectedFloor] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [visibleFixtureTypes, setVisibleFixtureTypes] = useState<string[]>([]);
  const [visibleBrands, setVisibleBrands] = useState<string[]>([]);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [fixtureTypeModalOpen, setFixtureTypeModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showFixtureId, setShowFixtureId] = useState(false);

  // QR highlight state
  const [highlightedLocation, setHighlightedLocation] = useState<LocationData | null>(null);
  const [fixtureNotFound, setFixtureNotFound] = useState(false);

  // Floor outlines
  const [floorOutlines, setFloorOutlines] = useState<Record<number, FloorOutline>>({});

  // Set initial floor when data loads
  useEffect(() => {
    if (floorIndices.length > 0 && !floorIndices.includes(selectedFloor)) {
      setSelectedFloor(floorIndices[0]);
    }
  }, [floorIndices, selectedFloor]);

  // Load floor outlines from GLB files
  useEffect(() => {
    if (floorFiles.length === 0) return;

    const loadOutlines = async () => {
      const outlines: Record<number, FloorOutline> = {};

      for (const file of floorFiles) {
        const match = file.name.match(/floor[-_]?(\d+)/i);
        const floorIdx = match ? parseInt(match[1]) : 0;

        try {
          const outline = await extractFloorOutline(file.blob);
          outlines[floorIdx] = outline;
        } catch (err) {
          console.warn(`[StoreLayout] Failed to extract outline for ${file.name}:`, err);
        }
      }

      setFloorOutlines(outlines);
    };

    loadOutlines();
  }, [floorFiles]);

  // Find and highlight fixture from QR code
  useEffect(() => {
    if (!isViewOnly || !qrFixtureId || locationData.length === 0) return;

    const found = locationData.find(
      (loc) => loc.fixtureId === qrFixtureId && !loc.forDelete
    );

    if (found) {
      setHighlightedLocation(found);
      setSelectedFloor(found.floorIndex);
      setFixtureNotFound(false);
    } else {
      setHighlightedLocation(null);
      setFixtureNotFound(true);
    }
  }, [isViewOnly, qrFixtureId, locationData]);

  // Check if there are any changes
  const hasChanges = useMemo(() => {
    return locationData.some(
      (loc) => loc.wasBrandChanged || loc.wasTypeChanged || loc.wasRotated
    );
  }, [locationData]);

  // Get the fixture type for the selected location
  const selectedFixtureType = useMemo(() => {
    if (!selectedLocation) return '';
    return fixtureTypeMap.get(selectedLocation.blockName) || selectedLocation.blockName;
  }, [selectedLocation, fixtureTypeMap]);

  // Filtered brands from the current locationData (only brands in use on current floor)
  const activeBrands = useMemo(() => {
    const set = new Set<string>();
    for (const loc of locationData) {
      if (!loc.forDelete) set.add(loc.brand);
    }
    return Array.from(set).sort();
  }, [locationData]);

  // Handle brand change
  const handleBrandSelect = useCallback(
    (newBrand: string) => {
      if (!selectedLocation) return;

      const uid = generateFixtureUID(selectedLocation);
      setLocationData((prev) =>
        prev.map((loc) => {
          if (generateFixtureUID(loc) !== uid) return loc;
          return {
            ...loc,
            brand: newBrand,
            wasBrandChanged: newBrand !== (loc.originalBrand ?? loc.brand),
            _updateTimestamp: Date.now(),
          };
        })
      );

      // Update selected location reference
      setSelectedLocation((prev) => {
        if (!prev || generateFixtureUID(prev) !== uid) return prev;
        return {
          ...prev,
          brand: newBrand,
          wasBrandChanged: newBrand !== (prev.originalBrand ?? prev.brand),
          _updateTimestamp: Date.now(),
        };
      });

      setBrandModalOpen(false);
    },
    [selectedLocation, setLocationData]
  );

  // Handle fixture type change
  const handleFixtureTypeSelect = useCallback(
    (newType: string) => {
      if (!selectedLocation) return;

      // Find the block name for this fixture type from the reverse map
      let newBlockName = newType;
      for (const [block, ft] of fixtureTypeMap.entries()) {
        if (ft === newType) {
          newBlockName = block;
          break;
        }
      }

      const uid = generateFixtureUID(selectedLocation);
      setLocationData((prev) =>
        prev.map((loc) => {
          if (generateFixtureUID(loc) !== uid) return loc;
          return {
            ...loc,
            blockName: newBlockName,
            wasTypeChanged: newBlockName !== (loc.originalBlockName ?? loc.blockName),
            _updateTimestamp: Date.now(),
          };
        })
      );

      setSelectedLocation((prev) => {
        if (!prev || generateFixtureUID(prev) !== uid) return prev;
        return {
          ...prev,
          blockName: newBlockName,
          wasTypeChanged: newBlockName !== (prev.originalBlockName ?? prev.blockName),
          _updateTimestamp: Date.now(),
        };
      });

      setFixtureTypeModalOpen(false);
    },
    [selectedLocation, fixtureTypeMap, setLocationData]
  );

  // Handle rotation — applies a relative delta to rotationZ only
  const handleRotateFixture = useCallback(
    (delta: number) => {
      if (!selectedLocation) return;

      const uid = generateFixtureUID(selectedLocation);
      setLocationData((prev) =>
        prev.map((loc) => {
          if (generateFixtureUID(loc) !== uid) return loc;
          const origZ = loc.originalRotationZ ?? loc.rotationZ;
          const newRotZ = ((loc.rotationZ + delta) % 360 + 360) % 360;
          return {
            ...loc,
            rotationZ: newRotZ,
            wasRotated: newRotZ !== origZ,
            _updateTimestamp: Date.now(),
          };
        })
      );

      setSelectedLocation((prev) => {
        if (!prev || generateFixtureUID(prev) !== uid) return prev;
        const origZ = prev.originalRotationZ ?? prev.rotationZ;
        const newRotZ = ((prev.rotationZ + delta) % 360 + 360) % 360;
        return {
          ...prev,
          rotationZ: newRotZ,
          wasRotated: newRotZ !== origZ,
          _updateTimestamp: Date.now(),
        };
      });
    },
    [selectedLocation, setLocationData]
  );

  // Handle reset
  const handleReset = useCallback(() => {
    if (!selectedLocation) return;

    const uid = generateFixtureUID(selectedLocation);
    setLocationData((prev) =>
      prev.map((loc) => {
        if (generateFixtureUID(loc) !== uid) return loc;
        return {
          ...loc,
          blockName: loc.originalBlockName ?? loc.blockName,
          brand: loc.originalBrand ?? loc.brand,
          rotationX: loc.originalRotationX ?? loc.rotationX,
          rotationY: loc.originalRotationY ?? loc.rotationY,
          rotationZ: loc.originalRotationZ ?? loc.rotationZ,
          wasBrandChanged: false,
          wasTypeChanged: false,
          wasRotated: false,
          _updateTimestamp: Date.now(),
        };
      })
    );

    setSelectedLocation((prev) => {
      if (!prev || generateFixtureUID(prev) !== uid) return prev;
      return {
        ...prev,
        blockName: prev.originalBlockName ?? prev.blockName,
        brand: prev.originalBrand ?? prev.brand,
        rotationX: prev.originalRotationX ?? prev.rotationX,
        rotationY: prev.originalRotationY ?? prev.rotationY,
        rotationZ: prev.originalRotationZ ?? prev.rotationZ,
        wasBrandChanged: false,
        wasTypeChanged: false,
        wasRotated: false,
        _updateTimestamp: Date.now(),
      };
    });
  }, [selectedLocation, setLocationData]);

  // Save flow
  const handleSave = useCallback(async () => {
    if (!zipBlob || !storeRecord || !store_id) return;

    try {
      setIsSaving(true);

      // 1. Open original ZIP, copy all files except location-master.csv
      const originalZip = await JSZip.loadAsync(zipBlob);
      const newZip = new JSZip();

      for (const [name, file] of Object.entries(originalZip.files)) {
        if (file.dir) continue;
        if (/location[-_]master\.csv/i.test(name)) continue;
        const content = await file.async('blob');
        newZip.file(name, content);
      }

      // 2. Generate new location-master.csv
      const csvText = serializeLocationDataToCsv(locationData);
      newZip.file('location-master.csv', csvText);

      // 3. Generate ZIP blob
      let newZipBlob = await newZip.generateAsync({ type: 'blob' });

      // 4. Run brand migration on new ZIP
      const migrationResult = await migrateBrandsInZip(newZipBlob);
      newZipBlob = migrationResult.zipBlob;

      // 5. Upload to Supabase
      const timestamp = Date.now();
      const zipPath = `${store_id}/layout-2d-${timestamp}.zip`;
      await supabase.uploadStoreZip(zipPath, newZipBlob);

      // 6. Insert store_saves record
      await supabase.insertStoreRecord({
        store_id: storeRecord.store_id,
        store_name: storeRecord.store_name,
        zip_path: zipPath,
        zip_size: newZipBlob.size,
        entity: storeRecord.entity,
      });

      console.log('[StoreLayout] Save complete:', zipPath);
      alert('Store layout saved successfully!');
    } catch (err: any) {
      console.error('[StoreLayout] Save failed:', err);
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [zipBlob, storeRecord, store_id, locationData, supabase]);

  // Loading state
  if (loading) {
    return (
      <div className="h-[calc(100vh-6rem)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading store layout...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-[calc(100vh-6rem)] flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-destructive font-medium mb-2">Error Loading Layout</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  // Fixture not found in view-only mode
  if (isViewOnly && fixtureNotFound) {
    return (
      <div className="h-[calc(100vh-6rem)] flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-destructive font-medium mb-2">Fixture Not Found</p>
          <p className="text-sm text-muted-foreground">
            Fixture ID "{qrFixtureId}" was not found in this store layout.
          </p>
        </div>
      </div>
    );
  }

  const currentOutline = floorOutlines[selectedFloor] || null;

  return (
    <div className="relative h-[calc(100vh-6rem)] w-full overflow-hidden">
      {/* SVG Canvas */}
      <LayoutCanvas
        locationData={locationData}
        floorOutline={currentOutline}
        selectedFloor={selectedFloor}
        visibleFixtureTypes={visibleFixtureTypes}
        visibleBrands={visibleBrands}
        fixtureTypeMap={fixtureTypeMap}
        brandCategoryMapping={brandCategoryMapping}
        selectedLocation={selectedLocation}
        onSelectLocation={setSelectedLocation}
        highlightedLocation={highlightedLocation}
        showFixtureId={showFixtureId}
      />

      {/* Left Panel */}
      <LayoutLeftPanel
        floorIndices={floorIndices}
        selectedFloor={selectedFloor}
        onFloorChange={setSelectedFloor}
        fixtureTypes={fixtureTypes}
        visibleFixtureTypes={visibleFixtureTypes}
        onFixtureTypeChange={setVisibleFixtureTypes}
        brands={activeBrands}
        visibleBrands={visibleBrands}
        onBrandChange={setVisibleBrands}
        hasChanges={hasChanges}
        isSaving={isSaving}
        onSave={handleSave}
        storeName={storeRecord?.store_name || store_id || ''}
        isViewOnly={isViewOnly}
        showFixtureId={showFixtureId}
        onShowFixtureIdChange={setShowFixtureId}
      />

      {/* Right Panel */}
      {selectedLocation && (
        <LayoutRightPanel
          location={selectedLocation}
          fixtureType={selectedFixtureType}
          onClose={() => setSelectedLocation(null)}
          onEditBrand={() => setBrandModalOpen(true)}
          onEditFixtureType={() => setFixtureTypeModalOpen(true)}
          onReset={handleReset}
          onRotateFixture={handleRotateFixture}
          isViewOnly={isViewOnly}
        />
      )}

      {/* Brand Selection Modal — hidden in view-only */}
      {!isViewOnly && (
        <BrandSelectionModal
          open={brandModalOpen}
          onOpenChange={setBrandModalOpen}
          currentBrand={selectedLocation?.brand || ''}
          onBrandSelect={handleBrandSelect}
        />
      )}

      {/* Fixture Type Selection Modal — hidden in view-only */}
      {!isViewOnly && (
        <FixtureTypeSelectionModal
          open={fixtureTypeModalOpen}
          onOpenChange={setFixtureTypeModalOpen}
          currentType={selectedFixtureType}
          availableTypes={fixtureTypes}
          onTypeSelect={handleFixtureTypeSelect}
        />
      )}

      {/* View-only banner */}
      {isViewOnly && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background/90 backdrop-blur-sm border border-border rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">View Only Mode</span>
        </div>
      )}
    </div>
  );
}
