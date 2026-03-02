#!/usr/bin/env node

/**
 * Batch Space Tracker Script
 *
 * Fetches the latest saved entry per store from the store_saves table,
 * downloads each ZIP, extracts location-master.csv, runs the space tracker
 * logic, and appends all results to a single CSV file.
 *
 * Usage:
 *   node scripts/batch-space-tracker.mjs                          # all stores
 *   node scripts/batch-space-tracker.mjs 1234,5678                # specific stores
 *   node scripts/batch-space-tracker.mjs --csv stores.csv         # from CSV file
 *   node scripts/batch-space-tracker.mjs --env .env.local.prod    # use prod env
 *   node scripts/batch-space-tracker.mjs --output my-report.csv   # custom output file
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    storeCodes: /** @type {string[]} */ ([]),
    envFile: '.env.local',
    outputFile: '',
    continueOnError: true,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--env' && args[i + 1]) {
      opts.envFile = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      opts.outputFile = args[++i];
    } else if (arg === '--csv' && args[i + 1]) {
      const csvPath = args[++i];
      opts.storeCodes.push(...readStoreCodesFromCsv(csvPath));
    } else if (arg === '--continue-on-error') {
      opts.continueOnError = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    } else {
      opts.storeCodes.push(...arg.split(/[,\s]+/).map(s => s.trim()).filter(Boolean));
    }
    i++;
  }

  // Deduplicate
  opts.storeCodes = [...new Set(opts.storeCodes)];

  // Default output filename
  if (!opts.outputFile) {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    opts.outputFile = `space-tracker-all_${timestamp}.csv`;
  }

  return opts;
}

function printUsage() {
  console.error(`
Usage:
  node scripts/batch-space-tracker.mjs                       # all stores (latest per store)
  node scripts/batch-space-tracker.mjs 1234,5678             # specific stores
  node scripts/batch-space-tracker.mjs --csv stores.csv      # from CSV file

Options:
  --env <file>           .env file to use (default: .env.local)
  --output <file>        Output CSV filename (default: space-tracker-all_YYYYMMDD.csv)
  --csv <file>           Read store codes from a CSV file
  --continue-on-error    Continue if a store fails (default: true)
  --help, -h             Show this help
`);
}

function readStoreCodesFromCsv(csvPath) {
  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`CSV file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const codes = [];
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    const value = line.split(',')[0].trim();
    if (/^(store.?code|store.?id|code|id)$/i.test(value)) continue;
    if (value) codes.push(value);
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Store master data (loaded from public/storemaster.csv)
// ---------------------------------------------------------------------------

function loadStoreMasterData() {
  const csvPath = path.join(PROJECT_ROOT, 'public', 'storemaster.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn('storemaster.csv not found at', csvPath);
    return [];
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  const dataLines = lines.slice(1); // skip header

  return dataLines.map(line => {
    const columns = parseCSVLine(line);
    return {
      storeCode: columns[0]?.trim() || '',
      zone: columns[1]?.trim() || '',
      state: columns[2]?.trim() || '',
      city: columns[3]?.trim() || '',
      formatType: columns[4]?.trim() || '',
      format: columns[5]?.trim() || '',
      storeName: columns[6]?.trim() || '',
      sapName: columns[7]?.trim() || '',
      nocName: columns[8]?.trim() || '',
    };
  }).filter(s => s.storeCode);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Brand metadata (ported from fixtureAreaConfig.ts)
// ---------------------------------------------------------------------------

const FIXTURE_AREA_CONFIG = {
  'WALL-BAY': 6.5,
  'A-RAIL': 40.7,
  '4-WAY': 45.7,
  'NESTED-TABLE': 57.2,
  'GLASS-TABLE': 52.9,
  'H-GONDOLA': 68.9,
  'IMPULSE-FIXTURE': 34.5,
  'ACC-GONDOLA': 31.5,
  'GONDOLA': 35.0,
  'SHELF': 15.0,
  'RACK': 25.0,
  'DISPLAY-STAND': 20.0,
  'MANNEQUIN-STAND': 10.0,
  'DEFAULT': 25.0,
};

const BRAND_METADATA = [
  { brand: "ALTHEORY-BY-AZORTE", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "AVAASA-MIX-N-MATCH", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "PRIVATE LABEL" },
  { brand: "AVAASA-SET", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "PRIVATE LABEL" },
  { brand: "DNMX MENS CASUAL", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "DNMX WOMENS WEAR", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "PRIVATE LABEL" },
  { brand: "FIG", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "PRIVATE LABEL" },
  { brand: "FUSION", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "PRIVATE LABEL" },
  { brand: "INF-FRENDZ", segment: "KIDS WEAR", family: "INFANTS", brandType: "PRIVATE LABEL" },
  { brand: "JOHN-PLAYERS", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "JOHN-PLAYERS-JEANS", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "KB-TEAM-SPIRIT", segment: "KIDS WEAR", family: "BOYS", brandType: "PRIVATE LABEL" },
  { brand: "KG-FRENDZ", segment: "KIDS WEAR", family: "GIRLS", brandType: "PRIVATE LABEL" },
  { brand: "KRITA", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "PRIVATE LABEL" },
  { brand: "LEE COOPER MENS CASUAL", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "LEE COOPER WOMENS WEAR", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "PRIVATE LABEL" },
  { brand: "LEECOOPERORIGINALS", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "NETPLAY FORMAL WEAR", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "NETPLAY SMART CASUALS", segment: "MENS WEAR", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "OUTRYT-BY-AZORTE", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "PRIVATE LABEL" },
  { brand: "PERFORMAX MENS CASUAL", segment: "MENS CASUAL", family: "ACTIVE WEAR", brandType: "PRIVATE LABEL" },
  { brand: "PERFORMAX WOMENS WEAR", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "PRIVATE LABEL" },
  { brand: "REV-VERSE", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "RIO", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "PRIVATE LABEL" },
  { brand: "RIO-BASIC", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "PRIVATE LABEL" },
  { brand: "RIO-GIRLS", segment: "KIDS WEAR", family: "GIRLS", brandType: "PRIVATE LABEL" },
  { brand: "ROYAAJ", segment: "MENS WEAR", family: "ETHNIC WEAR", brandType: "PRIVATE LABEL" },
  { brand: "SIYAHI", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "PRIVATE LABEL" },
  { brand: "SVRNAA-BY-AZORTE", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "PRIVATE LABEL" },
  { brand: "TEAMSPIRIT MENS CASUAL", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "TEAMSPIRIT WOMENS WEAR", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "PRIVATE LABEL" },
  { brand: "YB-DNMX", segment: "KIDS WEAR", family: "BOYS", brandType: "PRIVATE LABEL" },
  { brand: "YOUSTA", segment: "MENS WEAR", family: "CASUAL WEAR", brandType: "PRIVATE LABEL" },
  { brand: "LEE COOPER KIDS WEAR", segment: "KIDS WEAR", family: "BOYS/GIRLS", brandType: "PRIVATE LABEL" },
  { brand: "POINTCOVE BOYS", segment: "KIDS WEAR", family: "BOYS", brandType: "PRIVATE LABEL" },
  { brand: "POINTCOVE GIRLS", segment: "KIDS WEAR", family: "GIRLS", brandType: "PRIVATE LABEL" },
  { brand: "EXT-ALLEN SOLLEY YOUTH", segment: "MENS CASUAL", family: "MENS WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-AMANTE", segment: "WOMENS INTIMATE", family: "LINGERIE", brandType: "PRIVATE LABEL" },
  { brand: "EXT-ATHENA", segment: "MENS INNERWEAR", family: "INNERWEAR", brandType: "PRIVATE LABEL" },
  { brand: "EXT-AURELIA", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-BASICS", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-BEING", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-CC-KIDS", segment: "KIDS WEAR", family: "BOYS/GIRLS", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-CLOVIA", segment: "WOMENS INTIMATE", family: "LINGERIE", brandType: "PRIVATE LABEL" },
  { brand: "EXT-CRIMSOUNE-CLUB", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-CRIMSOUNE-CLUB-KIDS", segment: "KIDS WEAR", family: "BOYS/GIRLS", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-DEMOZA", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-DUKE", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-EB1", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-FLYING-MACHINE", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-GLIMMER", segment: "NON APPAREL", family: "NON APPAREL", brandType: "NON APPAREL" },
  { brand: "EXT-GO-COLORS", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-INTEGRITI", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-JOCKEY", segment: "WOMENS INTIMATE", family: "LINGERIE", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-JUNIPER", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-KILLER", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-KRAUS", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-LIBAS", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-MINIKLUB", segment: "KIDS WEAR", family: "BOYS/GIRLS", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-MONTE-BIANCO", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-MONTE-CARLO", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-PARX", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-PE-CASUALS", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-PEPE-JEANS", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-PE-PERFORM", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-PETER-ENGLAND", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-PLAY-DAY", segment: "KIDS WEAR", family: "KIDS WEAR", brandType: "PRIVATE LABEL" },
  { brand: "EXT-RANGRITI", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-RECAP", segment: "WOMENS WESTERN", family: "WESTERN WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-SIN", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-THE-BEAR-HOUSE", segment: "MENS CASUAL", family: "CASUAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-TINY-GIRLS", segment: "KIDS WEAR", family: "GIRLS", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-TURTLE", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-TWILLS", segment: "MENS WEAR", family: "FORMAL WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-VEDIC", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-W", segment: "WOMENS ETHNIC", family: "ETHNIC WEAR", brandType: "MANUFACTURER BRAND" },
  { brand: "EXT-ZIVAME", segment: "WOMENS INTIMATE", family: "LINGERIE", brandType: "PRIVATE LABEL" },
];

const brandMetadataMap = new Map(
  BRAND_METADATA.map(item => [item.brand.toUpperCase().trim().replace(/\s+/g, ' '), item])
);

function getBrandMetadata(brandName) {
  const normalized = brandName.toUpperCase().trim().replace(/\s+/g, ' ');
  return brandMetadataMap.get(normalized) || null;
}

function getFixtureArea(fixtureType) {
  const normalized = fixtureType.toUpperCase().trim();
  return FIXTURE_AREA_CONFIG[normalized] || FIXTURE_AREA_CONFIG['DEFAULT'];
}

// ---------------------------------------------------------------------------
// Fixture type mapping (from backend API)
// ---------------------------------------------------------------------------

const FASTIFY_API_BASE_URL = 'https://dg2n-layout3d-backend.rc.dg2n.com';

async function fetchBlockTypeMapping() {
  try {
    const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/block-types`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const mapping = new Map();
    if (data.block_fixture_types && typeof data.block_fixture_types === 'object') {
      for (const [blockName, fixtureType] of Object.entries(data.block_fixture_types)) {
        if (typeof fixtureType === 'string') mapping.set(blockName, fixtureType);
      }
    } else if (typeof data === 'object') {
      for (const [blockName, fixtureType] of Object.entries(data)) {
        if (typeof fixtureType === 'string') mapping.set(blockName, fixtureType);
      }
    }

    console.log(`  Loaded ${mapping.size} block→fixture_type mappings`);
    return mapping;
  } catch (error) {
    console.warn('  Failed to fetch block type mapping:', error.message);
    return new Map();
  }
}

function getFixtureType(blockName, mapping) {
  return mapping.get(blockName) || blockName;
}

// ---------------------------------------------------------------------------
// Space tracker logic (ported from spaceTrackerUtils.ts)
// ---------------------------------------------------------------------------

function countFixturesByType(fixtures, fixtureTypeMap) {
  const counts = {
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

function calculateTotalBrandArea(fixtures, fixtureTypeMap) {
  let totalArea = 0;
  for (const fixture of fixtures) {
    const fixtureType = getFixtureType(fixture.blockName, fixtureTypeMap);
    const count = fixture.count || 1;
    totalArea += count * getFixtureArea(fixtureType);
  }
  return Math.round(totalArea * 100) / 100;
}

function generateSpaceTrackerRows(locationData, storeData, fixtureTypeMap) {
  // Group fixtures by brand and floor
  const grouped = new Map();
  for (const fixture of locationData) {
    const key = `${fixture.brand}|${fixture.floorIndex}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(fixture);
  }

  const rows = [];
  for (const [key, fixtures] of grouped.entries()) {
    const [brandName, floorIndexStr] = key.split('|');
    const floorIndex = parseInt(floorIndexStr);
    const counts = countFixturesByType(fixtures, fixtureTypeMap);
    const brandArea = calculateTotalBrandArea(fixtures, fixtureTypeMap);
    const floorLevel = `Floor ${floorIndex}`;
    const metadata = getBrandMetadata(brandName);

    rows.push({
      storeCode: storeData?.storeCode || '',
      zone: storeData?.zone || '',
      state: storeData?.state || '',
      city: storeData?.city || '',
      format: storeData?.format || '',
      formatType: storeData?.formatType || '',
      storeName: storeData?.storeName || '',
      productSegment: metadata?.segment || '',
      brandName,
      productFamily: metadata?.family || '',
      productClass: '',
      brandType: metadata?.brandType || '',
      ...counts,
      brandAreaInSqft: brandArea,
      floorLevel,
      status: '',
    });
  }

  rows.sort((a, b) => {
    if (a.floorLevel !== b.floorLevel) return a.floorLevel.localeCompare(b.floorLevel);
    return a.brandName.localeCompare(b.brandName);
  });

  return rows;
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'STORE CODE', 'ZONE', 'STATE', 'CITY', 'FORMATE', 'Format Type', 'STORE NAME',
  'PRODUCT SEGMENT', 'Brand Name', 'PRODUCT FAMILY', 'PRODUCT Class', 'BRAND TYPE',
  'Wallbay Count', 'A-Rail Count', '4Way Count', 'Nested Table Count', 'Glass Table Count',
  'H Gandola Count', 'Impulse Fixture Count', 'Acc Gondola Count',
  'brand AREA in sft', 'FLOOR LEVEL', 'Status',
];

function escapeCSVField(field) {
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCSVLine(row) {
  return [
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
  ].join(',');
}

// ---------------------------------------------------------------------------
// Location CSV parsing (ported from 3DViewerModifier.tsx)
// ---------------------------------------------------------------------------

function isLocationCsv(name) {
  const n = name.toLowerCase().replace(/_/g, '-');
  return n.endsWith('.csv') && n.includes('location-master');
}

function parseLocationCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 14) {
      data.push({
        blockName: values[0].trim(),
        floorIndex: parseInt(values[1]) || 0,
        brand: values[11]?.trim() || 'unknown',
        count: parseInt(values[12]) || 1,
      });
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  // Load env
  const envPath = path.resolve(PROJECT_ROOT, opts.envFile);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded env from ${opts.envFile}`);
  } else {
    console.warn(`Env file not found: ${envPath}, trying default .env.local`);
    dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env.local') });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  const bucket = process.env.VITE_SUPABASE_BUCKET || 'store-archives';

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Load store master data
  console.log('Loading store master data...');
  const storeMasterData = loadStoreMasterData();
  console.log(`  Loaded ${storeMasterData.length} stores from storemaster.csv`);

  // Fetch fixture type mapping
  console.log('Fetching fixture type mapping from API...');
  const fixtureTypeMap = await fetchBlockTypeMapping();

  // Fetch all store_saves records (paginated to avoid 1000-row default limit)
  console.log('Fetching store records from Supabase...');
  let allRecords = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('store_saves')
      .select('id, created_at, store_id, store_name, zip_path, zip_size')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Failed to fetch store records:', error.message);
      process.exit(1);
    }

    if (data && data.length > 0) {
      allRecords = allRecords.concat(data);
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  console.log(`  Found ${allRecords.length} total records`);

  // Group by store_id and pick latest per store
  const latestByStore = new Map();
  for (const record of allRecords) {
    const existing = latestByStore.get(record.store_id);
    if (!existing || new Date(record.created_at) > new Date(existing.created_at)) {
      latestByStore.set(record.store_id, record);
    }
  }

  console.log(`  ${latestByStore.size} unique stores`);

  // Filter to requested stores if specified
  let storesToProcess;
  if (opts.storeCodes.length > 0) {
    storesToProcess = opts.storeCodes
      .map(code => latestByStore.get(code))
      .filter(Boolean);
    const notFound = opts.storeCodes.filter(code => !latestByStore.has(code));
    if (notFound.length > 0) {
      console.warn(`  Stores not found in DB: ${notFound.join(', ')}`);
    }
  } else {
    storesToProcess = Array.from(latestByStore.values());
  }

  // Sort by store_id for consistent output
  storesToProcess.sort((a, b) => a.store_id.localeCompare(b.store_id));

  console.log(`\nProcessing ${storesToProcess.length} stores...\n`);

  // Prepare output
  const outputDir = path.join(PROJECT_ROOT, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, opts.outputFile);

  // Write CSV header
  fs.writeFileSync(outputPath, CSV_HEADERS.join(',') + '\n', 'utf-8');

  let successCount = 0;
  let failCount = 0;
  let totalRows = 0;

  for (let idx = 0; idx < storesToProcess.length; idx++) {
    const record = storesToProcess[idx];
    const progress = `[${idx + 1}/${storesToProcess.length}]`;

    console.log(`${progress} Store ${record.store_id} (${record.store_name})`);

    try {
      // Download ZIP
      const { data: zipData, error: dlError } = await supabase.storage
        .from(bucket)
        .download(record.zip_path);

      if (dlError) throw new Error(`Download failed: ${dlError.message}`);

      // Extract location-master.csv from ZIP
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(await zipData.arrayBuffer());

      let csvText = null;
      for (const [fileName, file] of Object.entries(zipContent.files)) {
        if (!file.dir && isLocationCsv(fileName)) {
          csvText = await file.async('text');
          break;
        }
      }

      if (!csvText) {
        console.log(`  ⚠ No location-master.csv found in ZIP, skipping`);
        failCount++;
        continue;
      }

      // Parse location data
      const locationData = parseLocationCSV(csvText);
      if (locationData.length === 0) {
        console.log(`  ⚠ No fixtures in location-master.csv, skipping`);
        failCount++;
        continue;
      }

      // Find store master data
      const storeData = storeMasterData.find(s => s.storeCode === record.store_id) || null;

      // Generate space tracker rows
      const rows = generateSpaceTrackerRows(locationData, storeData, fixtureTypeMap);

      // Append to CSV
      const csvLines = rows.map(rowToCSVLine).join('\n');
      fs.appendFileSync(outputPath, csvLines + '\n', 'utf-8');

      totalRows += rows.length;
      successCount++;
      console.log(`  ✓ ${locationData.length} fixtures → ${rows.length} brand-floor rows`);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      failCount++;
      if (!opts.continueOnError) {
        console.error('Stopping due to error (use --continue-on-error to skip)');
        break;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Done! Processed ${successCount}/${storesToProcess.length} stores (${failCount} failed)`);
  console.log(`Total rows: ${totalRows}`);
  console.log(`Output: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});