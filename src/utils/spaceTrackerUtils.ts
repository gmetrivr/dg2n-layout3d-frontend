import type { LocationData } from '../hooks/useFixtureSelection';
import type { StoreData } from './csvUtils';
import { getFixtureType } from '../services/fixtureTypeMapping';
import { calculateBrandArea, getBrandMetadata } from '../config/fixtureAreaConfig';

export interface SpaceTrackerRow {
  storeCode: string;
  zone: string;
  state: string;
  city: string;
  format: string;
  formatType: string;
  storeName: string;
  productSegment: string;
  brandName: string;
  productFamily: string;
  productClass: string;
  brandType: string;
  wallbayCount: number;
  aRailCount: number;
  fourWayCount: number;
  nestedTableCount: number;
  glassTableCount: number;
  hGondolaCount: number;
  impulseFixtureCount: number;
  accGondolaCount: number;
  brandAreaInSqft: number;
  floorLevel: string;
  status: string;
}

interface FixtureCounts {
  wallbayCount: number;
  aRailCount: number;
  fourWayCount: number;
  nestedTableCount: number;
  glassTableCount: number;
  hGondolaCount: number;
  impulseFixtureCount: number;
  accGondolaCount: number;
}

/**
 * Generate Space Tracker CSV data from location data
 *
 * Data Sources:
 * - Store columns (STORE CODE, ZONE, STATE, CITY, FORMATE, Format Type, STORE NAME):
 *   Populated from storeData (loaded from /storemaster.csv)
 * - Brand columns (PRODUCT SEGMENT, PRODUCT FAMILY, BRAND TYPE):
 *   Populated from brand metadata config (fixtureAreaConfig.ts)
 * - Fixture counts: Calculated from locationData fixtures
 * - Brand area: Calculated as fixture count × area per fixture type
 * - Floor level: From floorNames map or default "Floor N"
 *
 * @param locationData All fixture location data
 * @param storeData Store information from store master file (can be null)
 * @param fixtureTypeMap Block name to fixture type mapping
 * @param floorNames Custom floor names mapping
 * @param deletedFixtures Set of deleted fixture UIDs
 * @returns Array of Space Tracker rows (one per brand per floor)
 */
export function generateSpaceTrackerData(
  locationData: LocationData[],
  storeData: StoreData | null,
  fixtureTypeMap: Map<string, string>,
  floorNames: Map<number, string>,
  deletedFixtures: Set<string>
): SpaceTrackerRow[] {
  // Log data availability
  console.log('[Space Tracker] Generating CSV data...');
  console.log(`[Space Tracker] Store data: ${storeData ? `${storeData.storeCode} - ${storeData.storeName}` : 'Not found'}`);
  console.log(`[Space Tracker] Fixtures: ${locationData.length} total, ${deletedFixtures.size} deleted`);
  console.log(`[Space Tracker] Floors: ${floorNames.size} custom names`);

  // Filter out deleted fixtures
  const activeFixtures = locationData.filter(fixture => {
    const uid = generateFixtureUID(fixture);
    return !deletedFixtures.has(uid);
  });

  // Group fixtures by brand and floor
  const groupedData = new Map<string, LocationData[]>();

  for (const fixture of activeFixtures) {
    const key = `${fixture.brand}|${fixture.floorIndex}`;
    if (!groupedData.has(key)) {
      groupedData.set(key, []);
    }
    groupedData.get(key)!.push(fixture);
  }

  // Generate rows for each brand-floor combination
  const rows: SpaceTrackerRow[] = [];

  for (const [key, fixtures] of groupedData.entries()) {
    const [brandName, floorIndexStr] = key.split('|');
    const floorIndex = parseInt(floorIndexStr);

    // Count fixtures by type
    const counts = countFixturesByType(fixtures, fixtureTypeMap);

    // Calculate brand area
    const brandArea = calculateTotalBrandArea(fixtures, fixtureTypeMap);

    // Get floor name
    const floorLevel = floorNames.get(floorIndex) || `Floor ${floorIndex}`;

    // Get brand metadata
    const metadata = getBrandMetadata(brandName);

    // Create row
    const row: SpaceTrackerRow = {
      storeCode: storeData?.storeCode || '',
      zone: storeData?.zone || '',
      state: storeData?.state || '',
      city: storeData?.city || '',
      format: storeData?.format || '',
      formatType: storeData?.formatType || '',
      storeName: storeData?.storeName || '',
      productSegment: metadata?.segment || '',
      brandName: brandName,
      productFamily: metadata?.family || '',
      productClass: '', // To be filled manually
      brandType: metadata?.brandType || '',
      wallbayCount: counts.wallbayCount,
      aRailCount: counts.aRailCount,
      fourWayCount: counts.fourWayCount,
      nestedTableCount: counts.nestedTableCount,
      glassTableCount: counts.glassTableCount,
      hGondolaCount: counts.hGondolaCount,
      impulseFixtureCount: counts.impulseFixtureCount,
      accGondolaCount: counts.accGondolaCount,
      brandAreaInSqft: brandArea,
      floorLevel: floorLevel,
      status: '', // To be filled manually
    };

    // Log if brand metadata not found
    if (!metadata) {
      console.warn(`[Space Tracker] Brand metadata not found for: ${brandName}`);
    }

    rows.push(row);
  }

  // Sort by floor index and brand name
  rows.sort((a, b) => {
    if (a.floorLevel !== b.floorLevel) {
      return a.floorLevel.localeCompare(b.floorLevel);
    }
    return a.brandName.localeCompare(b.brandName);
  });

  // Summary logging
  const brandsWithMetadata = rows.filter(r => r.productSegment).length;
  const brandsWithoutMetadata = rows.filter(r => !r.productSegment).length;
  console.log(`[Space Tracker] Generated ${rows.length} rows`);
  console.log(`[Space Tracker] Brands with metadata: ${brandsWithMetadata}, without: ${brandsWithoutMetadata}`);

  if (brandsWithoutMetadata > 0) {
    const missingBrands = [...new Set(rows.filter(r => !r.productSegment).map(r => r.brandName))];
    console.warn(`[Space Tracker] Brands missing metadata:`, missingBrands);
  }

  return rows;
}

/**
 * Count fixtures by type
 */
function countFixturesByType(
  fixtures: LocationData[],
  fixtureTypeMap: Map<string, string>
): FixtureCounts {
  const counts: FixtureCounts = {
    wallbayCount: 0,
    aRailCount: 0,
    fourWayCount: 0,
    nestedTableCount: 0,
    glassTableCount: 0,
    hGondolaCount: 0,
    impulseFixtureCount: 0,
    accGondolaCount: 0,
  };

  for (const fixture of fixtures) {
    const fixtureType = getFixtureType(fixture.blockName, fixtureTypeMap).toUpperCase();
    const count = fixture.count || 1;

    // Map fixture types to counts
    if (fixtureType.includes('WALL-BAY') || fixtureType.includes('WALLBAY') || fixtureType.includes('WPS')) {
      counts.wallbayCount += count;
    } else if (fixtureType.includes('A-RAIL') || fixtureType.includes('ARAIL') || fixtureType.includes('SR')) {
      counts.aRailCount += count;
    } else if (fixtureType.includes('4-WAY') || fixtureType.includes('4WAY') || fixtureType === '4W') {
      counts.fourWayCount += count;
    } else if (fixtureType.includes('NESTED') && fixtureType.includes('TABLE')) {
      counts.nestedTableCount += count;
    } else if (fixtureType.includes('GLASS') && fixtureType.includes('TABLE')) {
      counts.glassTableCount += count;
    } else if (fixtureType.includes('H-GONDOLA') || fixtureType.includes('HGONDOLA') || fixtureType.includes('HG')) {
      counts.hGondolaCount += count;
    } else if (fixtureType.includes('IMPULSE')) {
      counts.impulseFixtureCount += count;
    } else if (fixtureType.includes('ACC') && fixtureType.includes('GONDOLA')) {
      counts.accGondolaCount += count;
    }
  }

  return counts;
}

/**
 * Calculate total brand area for fixtures
 */
function calculateTotalBrandArea(
  fixtures: LocationData[],
  fixtureTypeMap: Map<string, string>
): number {
  let totalArea = 0;

  for (const fixture of fixtures) {
    const fixtureType = getFixtureType(fixture.blockName, fixtureTypeMap);
    const count = fixture.count || 1;
    const area = calculateBrandArea(count, fixtureType);
    totalArea += area;
  }

  return Math.round(totalArea * 100) / 100; // Round to 2 decimal places
}

/**
 * Generate UID for a fixture (for deletion checking)
 */
function generateFixtureUID(fixture: LocationData): string {
  const pos = `${Math.round(fixture.posX * 100)},${Math.round(fixture.posY * 100)},${Math.round(fixture.posZ * 100)}`;
  const timestamp = fixture._updateTimestamp || fixture._ingestionTimestamp || Date.now();
  return `${fixture.blockName}_${pos}_${timestamp}`;
}

/**
 * Convert Space Tracker data to CSV string
 */
export function spaceTrackerToCSV(rows: SpaceTrackerRow[]): string {
  const headers = [
    'STORE CODE',
    'ZONE',
    'STATE',
    'CITY',
    'FORMATE',
    'Format Type',
    'STORE NAME',
    'PRODUCT SEGMENT',
    'Brand Name',
    'PRODUCT FAMILY',
    'PRODUCT Class',
    'BRAND TYPE',
    'Wallbay Count',
    'A-Rail Count',
    '4Way Count',
    'Nested Table Count',
    'Glass Table Count',
    'H Gandola Count',
    'Impulse Fixture Count',
    'Acc Gondola Count',
    'brand AREA in sft',
    'FLOOR LEVEL',
    'Status',
  ];

  const csvLines = [headers.join(',')];

  for (const row of rows) {
    const line = [
      escapeCSVField(row.storeCode),
      escapeCSVField(row.zone),
      escapeCSVField(row.state),
      escapeCSVField(row.city),
      escapeCSVField(row.format),
      escapeCSVField(row.formatType),
      escapeCSVField(row.storeName),
      escapeCSVField(row.productSegment),
      escapeCSVField(row.brandName),
      escapeCSVField(row.productFamily),
      escapeCSVField(row.productClass),
      escapeCSVField(row.brandType),
      row.wallbayCount,
      row.aRailCount,
      row.fourWayCount,
      row.nestedTableCount,
      row.glassTableCount,
      row.hGondolaCount,
      row.impulseFixtureCount,
      row.accGondolaCount,
      row.brandAreaInSqft,
      escapeCSVField(row.floorLevel),
      escapeCSVField(row.status),
    ];

    csvLines.push(line.join(','));
  }

  return csvLines.join('\n');
}

/**
 * Escape CSV field if it contains special characters
 */
function escapeCSVField(field: string | number): string {
  const strField = String(field);
  if (strField.includes(',') || strField.includes('"') || strField.includes('\n')) {
    return `"${strField.replace(/"/g, '""')}"`;
  }
  return strField;
}

/**
 * Download Space Tracker CSV file
 */
export function downloadSpaceTrackerCSV(csvContent: string, storeName: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `space-tracker_${storeName || 'store'}_${timestamp}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
