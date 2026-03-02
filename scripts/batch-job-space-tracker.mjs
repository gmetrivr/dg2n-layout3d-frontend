#!/usr/bin/env node

/**
 * Batch Job Space Tracker Script
 *
 * For each job_id in the input CSV:
 *   1. Calls the backend API to get the job's input files
 *   2. Finds the location-master.csv by original_name
 *   3. Downloads it via the downloadUrl
 *   4. Calculates and appends space tracker rows to the output CSV
 *
 * The input CSV must have at minimum a `job_id` column and a `store_code` column.
 *
 * Usage:
 *   node scripts/batch-job-space-tracker.mjs --jobs jobs.csv
 *   node scripts/batch-job-space-tracker.mjs --jobs jobs.csv --env .env.local.prod
 *   node scripts/batch-job-space-tracker.mjs --jobs jobs.csv --output my-report.csv
 *   node scripts/batch-job-space-tracker.mjs --jobs jobs.csv --api-url https://my-backend.com
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const FASTIFY_API_BASE_URL = 'https://dg2n-layout3d-backend.rc.dg2n.com';

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    jobsCsvPath: '',
    envFile: '.env.local',
    outputFile: '',
    apiUrl: FASTIFY_API_BASE_URL,
    continueOnError: true,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--jobs' && args[i + 1]) {
      opts.jobsCsvPath = args[++i];
    } else if (arg === '--env' && args[i + 1]) {
      opts.envFile = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      opts.outputFile = args[++i];
    } else if (arg === '--api-url' && args[i + 1]) {
      opts.apiUrl = args[++i];
    } else if (arg === '--continue-on-error') {
      opts.continueOnError = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    }
    i++;
  }

  if (!opts.jobsCsvPath) {
    console.error('Error: --jobs <file> is required');
    printUsage();
    process.exit(1);
  }

  if (!opts.outputFile) {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    opts.outputFile = `space-tracker-jobs_${timestamp}.csv`;
  }

  return opts;
}

function printUsage() {
  console.error(`
Usage:
  node scripts/batch-job-space-tracker.mjs --jobs jobs.csv

Required:
  --jobs <file>          CSV file with job_id and store_code columns

Options:
  --env <file>           .env file to use (default: .env.local)
  --output <file>        Output CSV filename (default: space-tracker-jobs_YYYYMMDD.csv)
  --api-url <url>        Backend API base URL (default: ${FASTIFY_API_BASE_URL})
  --continue-on-error    Continue if a job fails (default: true)
  --help, -h             Show this help

Environment variables (in your .env file):
  VITE_SUPABASE_URL          Supabase project URL
  VITE_SUPABASE_ANON_KEY     Supabase anon key
  SCRIPT_EMAIL               Supabase user email for API auth
  SCRIPT_PASSWORD            Supabase user password for API auth

Input CSV format:
  job_id,store_code
  550e8400-e29b-41d4-a716-446655440000,1234
  ...
`);
}

// ---------------------------------------------------------------------------
// Read jobs from input CSV
// ---------------------------------------------------------------------------

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

function readJobsFromCsv(csvPath) {
  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Jobs CSV file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    console.error('Jobs CSV must have a header row and at least one data row');
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const jobIdIdx = headers.findIndex(h => h === 'job_id');
  const storeCodeIdx = headers.findIndex(h => h === 'store_code' || h === 'storecode' || h === 'store_id');

  if (jobIdIdx === -1) {
    console.error(`CSV must have a "job_id" column. Found columns: ${headers.join(', ')}`);
    process.exit(1);
  }

  if (storeCodeIdx === -1) {
    console.error(`CSV must have a "store_code" column. Found columns: ${headers.join(', ')}`);
    process.exit(1);
  }

  const jobs = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('#')) continue;
    const values = parseCSVLine(lines[i]);
    const jobId = values[jobIdIdx]?.trim();
    const storeCode = values[storeCodeIdx]?.trim();
    if (jobId) jobs.push({ jobId, storeCode: storeCode || '' });
  }

  // Deduplicate by job_id
  const seen = new Set();
  return jobs.filter(j => {
    if (seen.has(j.jobId)) return false;
    seen.add(j.jobId);
    return true;
  });
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
    };
  }).filter(s => s.storeCode);
}

// ---------------------------------------------------------------------------
// Brand metadata
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

async function fetchBlockTypeMapping(apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/api/fixtures/block-types`);
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
// Space tracker logic
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
// Location CSV parsing
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
// Backend API: fetch job detail (with auth token)
// ---------------------------------------------------------------------------

async function fetchJobDetail(jobId, token, apiUrl) {
  const response = await fetch(`${apiUrl}/api/jobs/${jobId}?allUsers=true`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status} for job ${jobId}`);
  }

  const body = await response.json();
  // Response shape: { status: { success }, data: { job: JobDetail } }
  return body.data?.job || body;
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
  const email = process.env.SCRIPT_EMAIL;
  const password = process.env.SCRIPT_PASSWORD;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env');
    process.exit(1);
  }

  if (!email || !password) {
    console.error('Missing SCRIPT_EMAIL or SCRIPT_PASSWORD in env (needed to call backend API)');
    process.exit(1);
  }

  // Authenticate to get a JWT for the backend API
  console.log('Authenticating with Supabase...');
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

  if (authError || !authData.session) {
    console.error('Authentication failed:', authError?.message || 'No session returned');
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log('  Authenticated successfully');

  // Load store master data
  console.log('Loading store master data...');
  const storeMasterData = loadStoreMasterData();
  console.log(`  Loaded ${storeMasterData.length} stores from storemaster.csv`);
  const storeMasterMap = new Map(storeMasterData.map(s => [s.storeCode, s]));

  // Fetch fixture type mapping
  console.log('Fetching fixture type mapping from API...');
  const fixtureTypeMap = await fetchBlockTypeMapping(opts.apiUrl);

  // Read jobs from input CSV
  console.log(`Reading jobs from ${opts.jobsCsvPath}...`);
  const jobs = readJobsFromCsv(opts.jobsCsvPath);
  console.log(`  Found ${jobs.length} unique jobs to process`);

  // Prepare output
  const outputDir = path.join(PROJECT_ROOT, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, opts.outputFile);

  fs.writeFileSync(outputPath, CSV_HEADERS.join(',') + '\n', 'utf-8');

  let successCount = 0;
  let failCount = 0;
  let totalRows = 0;

  for (let idx = 0; idx < jobs.length; idx++) {
    const { jobId, storeCode } = jobs[idx];
    const progress = `[${idx + 1}/${jobs.length}]`;

    console.log(`${progress} Job ${jobId} (store: ${storeCode || 'unknown'})`);

    try {
      // Fetch job detail from backend API
      const jobDetail = await fetchJobDetail(jobId, token, opts.apiUrl);

      // Find location-master.csv in input files
      const allFiles = [
        ...(jobDetail.inputFiles || []),
        ...(jobDetail.outputFiles || []),
      ];

      const locationFile = allFiles.find(f => isLocationCsv(f.originalName || f.original_name || ''));

      if (!locationFile) {
        console.log(`  ⚠ No location-master.csv found in job files, skipping`);
        console.log(`    Available files: ${allFiles.map(f => f.originalName || f.original_name).join(', ') || 'none'}`);
        failCount++;
        continue;
      }

      const downloadUrl = locationFile.downloadUrl || locationFile.download_url;
      if (!downloadUrl) {
        console.log(`  ⚠ location-master.csv has no downloadUrl, skipping`);
        failCount++;
        continue;
      }

      // Download the CSV
      const fileResponse = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!fileResponse.ok) {
        throw new Error(`Failed to download location-master.csv: HTTP ${fileResponse.status}`);
      }

      const csvText = await fileResponse.text();

      // Parse location data
      const locationData = parseLocationCSV(csvText);
      if (locationData.length === 0) {
        console.log(`  ⚠ No fixtures found in location-master.csv, skipping`);
        failCount++;
        continue;
      }

      // Look up store metadata
      const storeData = storeMasterMap.get(storeCode) || (storeCode ? { storeCode, zone: '', state: '', city: '', format: '', formatType: '', storeName: '' } : null);

      // Generate space tracker rows
      const rows = generateSpaceTrackerRows(locationData, storeData, fixtureTypeMap);

      // Append to CSV
      fs.appendFileSync(outputPath, rows.map(rowToCSVLine).join('\n') + '\n', 'utf-8');

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
  console.log(`Done! Processed ${successCount}/${jobs.length} jobs (${failCount} failed)`);
  console.log(`Total rows: ${totalRows}`);
  console.log(`Output: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
