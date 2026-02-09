#!/usr/bin/env node

/**
 * Batch Make-Live Script
 *
 * Re-runs the full "Make Live" process for stores that are already live.
 * This is useful for batch-migrating brands across all live stores.
 *
 * Usage:
 *   node scripts/batch-make-live.mjs <store_codes>          # comma-separated store codes
 *   node scripts/batch-make-live.mjs --csv <path/to/file.csv>  # CSV file with store codes
 *   node scripts/batch-make-live.mjs 1234                   # single store code
 *   node scripts/batch-make-live.mjs 1234,5678,9012         # multiple store codes
 *
 *   Options:
 *     --preview         Show what would happen without making any changes
 *     --env <file>      Use a specific .env file (default: .env.local)
 *     --pipeline <ver>  Pipeline version for brand migration (default: '02')
 *     --continue-on-error  Continue processing remaining stores if one fails
 *
 * CSV file format:
 *   A single column of store codes (with or without a header row).
 *   Lines starting with # are treated as comments.
 *
 * Sequential operations per store (mirrors the frontend Make Live flow):
 *   1.  Query store_saves for the most recent 'live' record for the store code
 *   2.  Download the ZIP from Supabase storage
 *   3.  Migrate brand names in location-master.csv (via backend API)
 *   4.  Filter excluded fixture types (stairs, toilets, trial rooms, etc.)
 *   5.  Ensure store-config.json exists (generate from GLB files + API if missing)
 *   6.  Parse location-master.csv to extract current fixtures
 *   7.  Fetch block-name-to-fixture-type mapping from backend API
 *   8.  Fetch existing fixtures from store_fixture_ids table
 *   9.  Assign fixture IDs (new store = generate all; update = reuse/reassign/generate)
 *   10. Update location-master.csv with fixture IDs (column 15)
 *   11. Upload full updated ZIP back to Supabase storage
 *   12. Create filtered "live" ZIP (baked GLBs + CSV + updated store-config.json only)
 *   13. Insert fixture records into store_fixture_ids table
 *   14. Move leftover TEMP fixtures to STORAGE brand
 *   15. Look up store metadata from storemaster.csv
 *   16. POST the live ZIP to /api/tooling/processStore3DZip (stockflow-core)
 *   17. Update store_saves record status to 'deploying'
  # Single store
  npm run batch-make-live -- 1234

  # Multiple stores (comma-separated)
  npm run batch-make-live -- 1234,5678,9012

  # From a CSV file
  npm run batch-make-live -- --csv stores.csv

  # Dry run (shows what would happen without making changes)
  npm run batch-make-live -- --dry-run 1234,5678

  # Continue processing if one store fails
  npm run batch-make-live -- --continue-on-error --csv stores.csv

  # Use production env
  npm run batch-make-live -- --env .env.local.prod --csv stores.csv
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
// Log file helper
// ---------------------------------------------------------------------------

let logStream = null;
let logFilePath = null;

function initLogFile() {
  const outputDir = path.join(PROJECT_ROOT, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  logFilePath = path.join(outputDir, `batch-make-live_${timestamp}.log`);
  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  writeLog(`Batch Make-Live Log`);
  writeLog(`Started: ${new Date().toISOString()}`);
  writeLog('='.repeat(70));
}

function writeLog(line) {
  if (logStream) logStream.write(line + '\n');
}

function closeLogFile() {
  if (logStream) {
    writeLog('');
    writeLog(`Log ended: ${new Date().toISOString()}`);
    logStream.end();
  }
}

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    storeCodes: /** @type {string[]} */ ([]),
    dryRun: false,
    envFile: '.env.local.prod',
    pipelineVersion: '02',
    continueOnError: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--preview' || arg === 'preview') {
      opts.dryRun = true;
    } else if (arg === '--env' && args[i + 1]) {
      opts.envFile = args[++i];
    } else if (arg === '--pipeline' && args[i + 1]) {
      opts.pipelineVersion = args[++i];
    } else if (arg === '--continue-on-error' || arg === 'continue-on-error') {
      opts.continueOnError = true;
    } else if (arg === '--csv' && args[i + 1]) {
      const csvPath = args[++i];
      opts.storeCodes.push(...readStoreCodesFromCsv(csvPath));
    } else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    } else {
      // Treat as comma/space-separated store codes
      opts.storeCodes.push(...arg.split(/[,\s]+/).map(s => s.trim()).filter(Boolean));
    }
    i++;
  }

  if (opts.storeCodes.length === 0) {
    printUsage();
    process.exit(1);
  }

  // Deduplicate
  opts.storeCodes = [...new Set(opts.storeCodes)];
  return opts;
}

function printUsage() {
  console.error(`
Usage:
  node scripts/batch-make-live.mjs <store_codes>
  node scripts/batch-make-live.mjs --csv <path/to/file.csv>
  node scripts/batch-make-live.mjs 1234,5678,9012

Options:
  --preview              Show what would happen without making any changes
  --env <file>           Use a specific .env file (default: .env.local)
  --pipeline <version>   Pipeline version for brand migration (default: '02')
  --continue-on-error    Continue processing remaining stores if one fails
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
    // Skip comments
    if (line.startsWith('#')) continue;

    // Take first column (in case CSV has multiple columns)
    const value = line.split(',')[0].trim();

    // Skip common header names
    if (/^(store.?code|store.?id|code|id)$/i.test(value)) continue;

    if (value) codes.push(value);
  }

  return codes;
}

// ---------------------------------------------------------------------------
// Constants (mirrored from frontend)
// ---------------------------------------------------------------------------

const EXCLUDED_FIXTURE_TYPES = [
  'STAIRCASE', 'STAIR', 'STAIRS',
  'TOILET', 'RESTROOM',
  'TRIAL ROOM', 'TRIAL-ROOM', 'FITTING ROOM',
  'BOH', 'BACK OF HOUSE',
  'CASH TILL', 'CASH-TILL', 'CHECKOUT', 'TILL',
  'DOOR', 'INTERIOR-DOOR',
  'WINDOW', 'WINDOW-DISPLAY', 'WINDOW DISPLAY',
];

// const FASTIFY_API_BASE_URL = 'https://dg2n-layout3d-backend.rc.dg2n.com';
const FASTIFY_API_BASE_URL = 'http://localhost:4260'; // for local testing with API proxy
const MAKE_LIVE_API_URL = 'https://stockflow-core.dg2n.com';

// ---------------------------------------------------------------------------
// Utility functions (ported from frontend)
// ---------------------------------------------------------------------------

function generateFixtureId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function calculate2DDistance(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isSamePosition(f1, f2, threshold = 0.3) {
  return calculate2DDistance(
    { x: f1.pos_x, y: f1.pos_y },
    { x: f2.pos_x, y: f2.pos_y }
  ) <= threshold;
}

function isFixtureMatch(f1, f2, threshold = 0.3) {
  return (
    f1.fixture_type === f2.fixture_type &&
    f1.floor_index === f2.floor_index &&
    isSamePosition(f1, f2, threshold)
  );
}

function findClosestFixture(target, candidates) {
  const matchingType = candidates.filter(c => c.fixture_type === target.fixture_type);
  if (matchingType.length === 0) return null;

  const sameFloor = matchingType.filter(c => c.floor_index === target.floor_index);
  const otherFloors = matchingType.filter(c => c.floor_index !== target.floor_index);
  const searchList = sameFloor.length > 0 ? sameFloor : otherFloors;

  let closest = null;
  let minDistance = Infinity;

  for (const candidate of searchList) {
    const distance = calculate2DDistance(
      { x: target.pos_x, y: target.pos_y },
      { x: candidate.pos_x, y: candidate.pos_y }
    );
    if (distance < minDistance) {
      minDistance = distance;
      closest = candidate;
    }
  }
  return closest;
}

function getFixtureType(blockName, mapping) {
  return mapping.get(blockName) || blockName;
}

function isFloorFile(fileName) {
  if (!fileName.toLowerCase().endsWith('.glb')) return false;
  if (fileName.includes('_baked')) return false;
  if (fileName.includes('dg2n-3d-floor-')) return true;
  if (fileName.match(/[-_]floor[-_]?\d+\.glb$/i)) return true;
  return false;
}

function isShatteredFloorPlateFile(fileName) {
  return fileName.includes('dg2n-shattered-floor-plates-');
}

// ---------------------------------------------------------------------------
// Backend API helpers
// ---------------------------------------------------------------------------

async function fetchBlockTypeMapping() {
  const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/block-types`);
  if (!response.ok) throw new Error(`Failed to fetch block-types: ${response.status}`);

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

  return mapping;
}

async function migrateBrandNames(brandNames, pipelineVersion) {
  const response = await fetch(`${FASTIFY_API_BASE_URL}/api/brands/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand_names: brandNames, pipeline_version: pipelineVersion }),
  });
  if (!response.ok) throw new Error(`Brand migration API failed: ${response.status}`);
  return response.json();
}

async function getFixtureBlocks(blockNames) {
  const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/blocks?pipeline_version=02`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ block_names: blockNames }),
  });
  if (!response.ok) throw new Error(`Fixture blocks API failed: ${response.status}`);
  return response.json();
}

async function getFixtureTypeUrl(fixtureType) {
  const response = await fetch(
    `${FASTIFY_API_BASE_URL}/api/fixtures/type/${encodeURIComponent(fixtureType)}/url?pipeline_version=02`
  );
  if (!response.ok) return null;
  return response.json();
}

async function getDirectRenderTypes() {
  const response = await fetch(`${FASTIFY_API_BASE_URL}/api/fixtures/direct-render-types?pipeline_version=02`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.direct_render_fixture_types || [];
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function getStoreFixtures(supabase, storeId) {
  let allData = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('store_fixture_ids')
      .select('*')
      .eq('store_id', storeId)
      .order('fixture_id', { ascending: true })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to get store fixtures: ${error.message}`);
    if (data && data.length > 0) {
      allData = allData.concat(data);
      offset += limit;
      hasMore = data.length === limit;
    } else {
      hasMore = false;
    }
  }

  // Deduplicate by fixture_id (latest entry only)
  const latestByFixture = new Map();
  for (const row of allData) {
    const existing = latestByFixture.get(row.fixture_id);
    if (!existing || new Date(row.updated_at) > new Date(existing.updated_at)) {
      latestByFixture.set(row.fixture_id, row);
    }
  }

  return Array.from(latestByFixture.values());
}

async function insertFixtures(supabase, fixtures) {
  if (fixtures.length === 0) return [];

  const { data, error } = await supabase
    .from('store_fixture_ids')
    .insert(
      fixtures.map(f => ({
        fixture_id: f.fixture_id,
        store_id: f.store_id,
        fixture_type: f.fixture_type,
        brand: f.brand,
        floor_index: f.floor_index,
        pos_x: f.pos_x,
        pos_y: f.pos_y,
        pos_z: f.pos_z,
        created_at: f.created_at,
        updated_at: new Date().toISOString(),
      }))
    )
    .select();

  if (error) throw new Error(`Failed to insert fixtures: ${error.message}`);
  return data || [];
}

// ---------------------------------------------------------------------------
// ZIP processing functions (ported from frontend)
// ---------------------------------------------------------------------------

async function migrateBrandsInZip(zipBlob, pipelineVersion) {
  const buf = Buffer.isBuffer(zipBlob) ? zipBlob : Buffer.from(await zipBlob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);

  const locationCsvFile = zip.file(/location[-_]master\.csv/i)[0];
  if (!locationCsvFile) return { zip, zipBuffer: buf, migratedCount: 0 };

  const csvText = await locationCsvFile.async('text');
  const lines = csvText.split(/\r?\n/);

  const headers = lines[0].split(',').map(h => h.trim());
  const brandColumnIndex = headers.findIndex(h => h.toLowerCase() === 'brand');
  if (brandColumnIndex === -1) return { zip, zipBuffer: buf, migratedCount: 0 };

  const uniqueBrands = new Set();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',');
    if (values.length > brandColumnIndex) {
      const brand = values[brandColumnIndex].trim();
      if (brand) uniqueBrands.add(brand);
    }
  }

  if (uniqueBrands.size === 0) return { zip, zipBuffer: buf, migratedCount: 0, brandMigrations: [] };

  const migrationResponse = await migrateBrandNames(Array.from(uniqueBrands), pipelineVersion);
  const migrationResults = migrationResponse.migrations;

  const brandMap = new Map();
  let changedCount = 0;
  const brandMigrations = []; // detailed list of { oldName, newName }
  for (const result of migrationResults) {
    brandMap.set(result.old_name.toLowerCase(), result.new_name);
    if (result.changed) {
      changedCount++;
      brandMigrations.push({ oldName: result.old_name, newName: result.new_name });
    }
  }

  if (changedCount === 0) return { zip, zipBuffer: buf, migratedCount: 0, brandMigrations: [] };

  const updatedLines = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { updatedLines.push(line); continue; }
    const values = line.split(',');
    if (values.length > brandColumnIndex) {
      const oldBrand = values[brandColumnIndex].trim();
      const newBrand = brandMap.get(oldBrand.toLowerCase());
      if (newBrand && newBrand !== oldBrand) values[brandColumnIndex] = newBrand;
    }
    updatedLines.push(values.join(','));
  }

  zip.file(locationCsvFile.name, updatedLines.join('\n'));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  return { zip: await JSZip.loadAsync(zipBuffer), zipBuffer, migratedCount: changedCount, brandMigrations };
}

async function filterExcludedFixturesInZip(zip) {
  const locationCsvFile = zip.file(/location[-_]master\.csv/i)[0];
  if (!locationCsvFile) return { zip, removedCount: 0 };

  const csvText = await locationCsvFile.async('text');
  const lines = csvText.split(/\r?\n/);

  const headers = lines[0].split(',').map(h => h.trim());
  const blockNameColumnIndex = headers.findIndex(
    h => h.toLowerCase() === 'blockname' || h.toLowerCase() === 'block_name' || h.toLowerCase() === 'block name'
  );
  const columnIndex = blockNameColumnIndex === -1 ? 0 : blockNameColumnIndex;

  const excludedSet = new Set(EXCLUDED_FIXTURE_TYPES.map(t => t.toUpperCase()));

  const filteredLines = [lines[0]];
  let removedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { filteredLines.push(line); continue; }

    const values = line.split(',');
    if (values.length > columnIndex) {
      const blockName = values[columnIndex].trim().toUpperCase();
      if (excludedSet.has(blockName)) {
        removedCount++;
        continue;
      }
    }
    filteredLines.push(lines[i]);
  }

  if (removedCount === 0) return { zip, removedCount: 0 };

  zip.file(locationCsvFile.name, filteredLines.join('\n'));
  return { zip, removedCount };
}

async function ensureStoreConfigInZip(zip) {
  if (zip.file('store-config.json')) return zip;

  const locationCsvFile = zip.file(/location[-_]master\.csv/i)[0];
  if (!locationCsvFile) return zip;

  const csvText = await locationCsvFile.async('text');
  const locationLines = csvText.split(/\r?\n/).filter(line => line.trim());

  const blockNames = new Set();
  for (let i = 1; i < locationLines.length; i++) {
    const values = locationLines[i].split(',');
    if (values.length >= 14) blockNames.add(values[0].trim());
  }

  // Build floor array from GLB files
  const allFiles = Object.keys(zip.files);
  const floorFiles = allFiles.filter(name => {
    const fileName = name.split('/').pop() || name;
    return isFloorFile(fileName) && !isShatteredFloorPlateFile(fileName);
  });

  const floors = floorFiles.map(fileName => {
    const baseName = fileName.split('/').pop() || fileName;
    const floorMatch = baseName.match(/floor[_-]?(\d+)/i);
    const floorIndex = floorMatch ? parseInt(floorMatch[1]) : 0;
    const nameMatch = baseName.match(/^(.+?)[-_]floor/i);
    const floorName = nameMatch ? nameMatch[1] : `Floor ${floorIndex}`;

    return { name: floorName, glb_file_name: baseName, floor_index: floorIndex, spawn_point: [0, 0, 0] };
  }).sort((a, b) => a.floor_index - b.floor_index);

  // Fetch block→fixture_type mapping
  let blockFixtureTypes = {};
  try {
    if (blockNames.size > 0) {
      const fixtureBlocks = await getFixtureBlocks(Array.from(blockNames));
      blockFixtureTypes = fixtureBlocks.reduce((acc, block) => {
        if (block.block_name && block.fixture_type) acc[block.block_name] = block.fixture_type;
        return acc;
      }, {});
    }
  } catch (e) {
    console.warn('  Warning: Failed to fetch block fixture types:', e.message);
  }

  // Get unique fixture types and fetch their URLs
  const uniqueFixtureTypes = [...new Set(Object.values(blockFixtureTypes))];
  let fixtureTypeGlbUrls = {};
  try {
    if (uniqueFixtureTypes.length > 0) {
      const results = await Promise.all(
        uniqueFixtureTypes.map(async ft => {
          const info = await getFixtureTypeUrl(ft);
          return { ft, url: info?.glb_url || null };
        })
      );
      for (const { ft, url } of results) {
        if (url) fixtureTypeGlbUrls[ft] = url;
      }
    }
  } catch (e) {
    console.warn('  Warning: Failed to fetch fixture type URLs:', e.message);
  }

  let directRenderTypes = [];
  try {
    directRenderTypes = await getDirectRenderTypes();
  } catch (e) {
    console.warn('  Warning: Failed to fetch direct render types:', e.message);
  }

  const config = {
    floor: floors,
    block_fixture_types: blockFixtureTypes,
    fixture_type_glb_urls: fixtureTypeGlbUrls,
    additional_block_fixture_type: directRenderTypes,
  };

  zip.file('store-config.json', JSON.stringify(config, null, 2));
  return zip;
}

// ---------------------------------------------------------------------------
// Fixture ID assignment (ported from frontend)
// ---------------------------------------------------------------------------

function classifyFixtures(currentFixtures, existingFixtures, blockTypeMapping) {
  const noChange = [];
  const additions = [];
  const matchedExistingIds = new Set();
  const activeExisting = existingFixtures.filter(f => f.brand !== 'STORAGE');

  for (const current of currentFixtures) {
    const currentFixtureType = getFixtureType(current.blockName, blockTypeMapping);
    const currentPos = {
      fixture_type: currentFixtureType,
      floor_index: current.floorIndex,
      pos_x: current.posX,
      pos_y: current.posY,
    };

    const match = activeExisting.find(existing => {
      if (matchedExistingIds.has(existing.id)) return false;
      return isFixtureMatch(currentPos, {
        fixture_type: existing.fixture_type,
        floor_index: existing.floor_index,
        pos_x: existing.pos_x,
        pos_y: existing.pos_y,
      });
    });

    if (match) {
      noChange.push({ current, existing: match });
      matchedExistingIds.add(match.id);
    } else {
      additions.push(current);
    }
  }

  const deletions = activeExisting
    .filter(existing => !matchedExistingIds.has(existing.id))
    .map(existing => ({
      fixture_id: existing.fixture_id,
      fixture_type: existing.fixture_type,
      floor_index: existing.floor_index,
      pos_x: existing.pos_x,
      pos_y: existing.pos_y,
      created_at: existing.created_at,
    }));

  return { noChange, deletions, additions };
}

function assignFixtureIdsForAdditions(additions, tempFixtures, storageFixtures, blockTypeMapping) {
  const assignments = [];
  const usedTempIds = new Set();
  const usedStorageIds = new Set();
  const now = new Date().toISOString();

  for (const addition of additions) {
    const additionPos = {
      fixture_type: getFixtureType(addition.blockName, blockTypeMapping),
      floor_index: addition.floorIndex,
      pos_x: addition.posX,
      pos_y: addition.posY,
    };

    // Try TEMP pool first
    const availableTemp = tempFixtures.filter(f => !usedTempIds.has(f.fixture_id));
    const tempMatch = findClosestFixture(additionPos, availableTemp);

    if (tempMatch) {
      const matched = availableTemp.find(f => f.fixture_id === tempMatch.fixture_id);
      if (matched) {
        assignments.push({ ...addition, fixtureId: matched.fixture_id, createdAt: matched.created_at });
        usedTempIds.add(matched.fixture_id);
        continue;
      }
    }

    // Try STORAGE pool second
    const availableStorage = storageFixtures.filter(f => !usedStorageIds.has(f.fixture_id));
    const storageCandidates = availableStorage.map(f => ({
      fixture_type: f.fixture_type,
      floor_index: f.floor_index,
      pos_x: f.pos_x,
      pos_y: f.pos_y,
      fixture_id: f.fixture_id,
      created_at: f.created_at,
    }));
    const storageMatch = findClosestFixture(additionPos, storageCandidates);

    if (storageMatch) {
      const matched = availableStorage.find(
        f => f.fixture_type === storageMatch.fixture_type && f.pos_x === storageMatch.pos_x && f.pos_y === storageMatch.pos_y
      );
      if (matched) {
        assignments.push({ ...addition, fixtureId: matched.fixture_id, createdAt: matched.created_at });
        usedStorageIds.add(matched.fixture_id);
        continue;
      }
    }

    // Generate new ID
    assignments.push({ ...addition, fixtureId: generateFixtureId(), createdAt: now });
  }

  return { assignments, usedTempIds, usedStorageIds };
}

function assignFixtureIdsNewStore(storeId, currentFixtures, blockTypeMapping) {
  const now = new Date().toISOString();
  return currentFixtures.map(f => ({
    fixture_id: generateFixtureId(),
    store_id: storeId,
    fixture_type: getFixtureType(f.blockName, blockTypeMapping),
    brand: f.brand,
    floor_index: f.floorIndex,
    pos_x: f.posX,
    pos_y: f.posY,
    pos_z: f.posZ,
    created_at: now,
  }));
}

function assignFixtureIdsUpdateStore(storeId, currentFixtures, existingFixtures, blockTypeMapping) {
  const { noChange, deletions, additions } = classifyFixtures(currentFixtures, existingFixtures, blockTypeMapping);

  const tempFixtures = deletions;
  const storageFixtures = existingFixtures.filter(f => f.brand === 'STORAGE');

  const { assignments, usedTempIds } = assignFixtureIdsForAdditions(
    additions, tempFixtures, storageFixtures, blockTypeMapping
  );

  const finalFixtures = [
    ...noChange.map(({ current, existing }) => ({
      fixture_id: existing.fixture_id,
      store_id: storeId,
      fixture_type: existing.fixture_type,
      brand: current.brand,
      floor_index: current.floorIndex,
      pos_x: current.posX,
      pos_y: current.posY,
      pos_z: current.posZ,
      created_at: existing.created_at,
    })),
    ...assignments.map(assigned => ({
      fixture_id: assigned.fixtureId,
      store_id: storeId,
      fixture_type: getFixtureType(assigned.blockName, blockTypeMapping),
      brand: assigned.brand,
      floor_index: assigned.floorIndex,
      pos_x: assigned.posX,
      pos_y: assigned.posY,
      pos_z: assigned.posZ,
      created_at: assigned.createdAt,
    })),
  ];

  const moveToStorage = tempFixtures
    .filter(f => !usedTempIds.has(f.fixture_id))
    .map(f => f.fixture_id);

  return { finalFixtures, moveToStorage };
}

// ---------------------------------------------------------------------------
// Store master CSV (loaded from public/ directory)
// ---------------------------------------------------------------------------

function loadStoreMasterData() {
  const csvPath = path.join(PROJECT_ROOT, 'public', 'storemaster.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn('  Warning: storemaster.csv not found, store metadata will be empty');
    return [];
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());

  return lines.slice(1).map(line => {
    const cols = parseCSVLine(line);
    return {
      storeCode: (cols[0] || '').trim(),
      zone: (cols[1] || '').trim(),
      state: (cols[2] || '').trim(),
      city: (cols[3] || '').trim(),
      formatType: (cols[4] || '').trim(),
      format: (cols[5] || '').trim(),
      storeName: (cols[6] || '').trim(),
      sapName: (cols[7] || '').trim(),
      nocName: (cols[8] || '').trim(),
    };
  }).filter(s => s.storeCode);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += char;
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Main make-live logic for a single store
// ---------------------------------------------------------------------------

async function makeLiveForStore(supabase, bucket, storeCode, pipelineVersion, dryRun, storeData) {
  const prefix = dryRun ? '[DRY-RUN] ' : '';

  // Step 1: Find the most recent live store record
  console.log(`${prefix}Step 1: Looking up most recent live record for store "${storeCode}" ...`);
  const { data: records, error: queryError } = await supabase
    .from('store_saves')
    .select('id, created_at, store_id, store_name, zip_path, zip_size, status, entity, deployed_at, live_at')
    .eq('store_id', storeCode)
    .eq('status', 'live')
    .order('live_at', { ascending: false });

  if (queryError) throw new Error(`Supabase query failed: ${queryError.message}`);
  if (!records || records.length === 0) throw new Error(`No live store record found for store "${storeCode}"`);

  const r = records[0]; // most recently went live
  console.log(`${prefix}  Found: id=${r.id}, name="${r.store_name}", entity="${r.entity || 'trends'}", live_at=${r.live_at}`);

  writeLog('');
  writeLog(`Store: ${storeCode} - "${r.store_name}"`);
  writeLog(`  Record ID: ${r.id}`);
  writeLog(`  Entity: ${r.entity || 'trends'}`);
  writeLog(`  Last live_at: ${r.live_at}`);
  writeLog(`  ZIP path: ${r.zip_path}`);

  // Step 2: Download ZIP
  console.log(`${prefix}Step 2: Downloading ZIP from storage ...`);
  const { data: dlData, error: dlError } = await supabase.storage.from(bucket).download(r.zip_path);
  if (dlError || !dlData) throw new Error(`Failed to download ZIP: ${dlError?.message || 'no data'}`);
  console.log(`${prefix}  Downloaded ZIP (${(dlData.size / 1024).toFixed(1)} KB)`);

  // Step 3: Migrate brand names
  console.log(`${prefix}Step 3: Migrating brand names (pipeline=${pipelineVersion}) ...`);
  let { zip, migratedCount, brandMigrations } = await migrateBrandsInZip(dlData, pipelineVersion);
  console.log(`${prefix}  Migrated ${migratedCount} brand name(s)`);

  // Log brand migrations
  writeLog(`  Brand Migrations (${migratedCount} changed):`);
  if (brandMigrations.length > 0) {
    for (const { oldName, newName } of brandMigrations) {
      writeLog(`    "${oldName}" -> "${newName}"`);
    }
  } else {
    writeLog(`    (none)`);
  }

  // Step 4: Filter excluded fixture types
  console.log(`${prefix}Step 4: Filtering excluded fixture types ...`);
  const filterResult = await filterExcludedFixturesInZip(zip);
  zip = filterResult.zip;
  console.log(`${prefix}  Removed ${filterResult.removedCount} excluded fixture(s)`);

  // Step 5: Ensure store-config.json
  console.log(`${prefix}Step 5: Ensuring store-config.json exists ...`);
  zip = await ensureStoreConfigInZip(zip);

  // Step 6: Parse location-master.csv
  console.log(`${prefix}Step 6: Parsing location-master.csv ...`);
  const locationMasterFile = Object.keys(zip.files).find(
    name => name.toLowerCase().includes('location') && name.toLowerCase().includes('master') && name.endsWith('.csv')
  );
  if (!locationMasterFile) throw new Error('location-master.csv not found in ZIP');

  const csvText = await zip.files[locationMasterFile].async('text');
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());

  const currentFixtures = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 14) {
      currentFixtures.push({
        blockName: values[0].trim(),
        floorIndex: parseInt(values[1]) || 0,
        posX: parseFloat(values[5]) || 0,
        posY: parseFloat(values[6]) || 0,
        posZ: parseFloat(values[7]) || 0,
        brand: (values[11] || '').trim() || 'unknown',
      });
    }
  }
  console.log(`${prefix}  Parsed ${currentFixtures.length} fixture(s)`);

  // Step 7: Fetch block type mapping
  console.log(`${prefix}Step 7: Fetching block-type mapping from API ...`);
  const blockTypeMapping = await fetchBlockTypeMapping();
  console.log(`${prefix}  Loaded ${blockTypeMapping.size} block-type mapping(s)`);

  // Step 8: Get existing fixtures from DB
  console.log(`${prefix}Step 8: Fetching existing fixtures from store_fixture_ids ...`);
  const existingFixtures = await getStoreFixtures(supabase, storeCode);
  const isNewStore = existingFixtures.length === 0;
  console.log(`${prefix}  Found ${existingFixtures.length} existing fixture(s) (${isNewStore ? 'new store' : 'update'})`);

  // Step 9: Assign fixture IDs
  console.log(`${prefix}Step 9: Assigning fixture IDs ...`);
  let finalFixtures;
  let moveToStorage = [];

  if (isNewStore) {
    finalFixtures = assignFixtureIdsNewStore(storeCode, currentFixtures, blockTypeMapping);
  } else {
    const result = assignFixtureIdsUpdateStore(storeCode, currentFixtures, existingFixtures, blockTypeMapping);
    finalFixtures = result.finalFixtures;
    moveToStorage = result.moveToStorage;
  }
  console.log(`${prefix}  Assigned ${finalFixtures.length} fixture ID(s), ${moveToStorage.length} to move to STORAGE`);

  // Log fixture IDs
  writeLog(`  Fixture IDs (${finalFixtures.length} total, ${isNewStore ? 'new store' : 'update'}):`);
  writeLog(`    ${'Fixture ID'.padEnd(12)} ${'Fixture Type'.padEnd(20)} ${'Brand'.padEnd(20)} Floor  Position`);
  writeLog(`    ${'─'.repeat(12)} ${'─'.repeat(20)} ${'─'.repeat(20)} ${'─'.repeat(5)}  ${'─'.repeat(20)}`);
  for (const f of finalFixtures) {
    writeLog(
      `    ${f.fixture_id.padEnd(12)} ${f.fixture_type.padEnd(20)} ${f.brand.padEnd(20)} ${String(f.floor_index).padEnd(5)}  (${f.pos_x.toFixed(2)}, ${f.pos_y.toFixed(2)}, ${f.pos_z.toFixed(2)})`
    );
  }
  if (moveToStorage.length > 0) {
    writeLog(`  Moved to STORAGE (${moveToStorage.length}):`);
    for (const fid of moveToStorage) {
      writeLog(`    ${fid}`);
    }
  }

  // Step 10: Update CSV with fixture IDs
  console.log(`${prefix}Step 10: Updating location-master.csv with fixture IDs ...`);
  let header = lines[0].trim();
  const headerColumns = header.split(',').map(col => col.trim());
  if (headerColumns.length < 15 || !headerColumns[14]) {
    while (headerColumns.length < 14) headerColumns.push('');
    headerColumns[14] = 'Fixture ID';
  }
  header = headerColumns.join(',');

  const updatedLines = [header];
  for (let i = 0; i < currentFixtures.length; i++) {
    const values = lines[i + 1].split(',');
    const fixtureId = finalFixtures[i]?.fixture_id || '';
    if (values.length > 14) values[14] = fixtureId;
    else values.push(fixtureId);
    updatedLines.push(values.join(','));
  }

  zip.file(locationMasterFile, updatedLines.join('\n'));

  if (dryRun) {
    console.log(`${prefix}Step 11-17: Skipped (preview mode)`);
    console.log(`${prefix}  Would upload updated ZIP to: ${r.zip_path}`);
    console.log(`${prefix}  Would insert ${finalFixtures.length} fixture records`);
    console.log(`${prefix}  Would move ${moveToStorage.length} fixture(s) to STORAGE`);
    console.log(`${prefix}  Would call makeStoreLive API for entity="${r.entity || 'trends'}"`);
    console.log(`${prefix}  Would set store status to 'deploying'`);
    return { success: true, storeCode, storeName: r.store_name, fixtureCount: finalFixtures.length, dryRun: true };
  }

  // Step 11: Upload full ZIP
  console.log(`Step 11: Uploading updated full ZIP ...`);
  const updatedZipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(r.zip_path, updatedZipBuffer, { contentType: 'application/zip', upsert: true });
  if (uploadError) throw new Error(`Failed to upload ZIP: ${uploadError.message}`);
  console.log(`  Uploaded full ZIP to: ${r.zip_path}`);

  // Step 12: Create filtered live ZIP (baked GLBs only)
  console.log(`Step 12: Creating filtered live ZIP (baked GLBs only) ...`);
  const liveZip = new JSZip();
  let bakedGlbCount = 0;

  for (const fileName of Object.keys(zip.files)) {
    const file = zip.files[fileName];
    if (!file.dir && fileName.toLowerCase().endsWith('_baked.glb')) {
      const content = await file.async('nodebuffer');
      liveZip.file(fileName, content);
      bakedGlbCount++;
    }
  }

  if (bakedGlbCount === 0) throw new Error('No baked GLB files found in ZIP');

  // Add location-master.csv
  const csvContent = await zip.files[locationMasterFile].async('nodebuffer');
  liveZip.file(locationMasterFile, csvContent);

  // Add store-config.json with baked GLB references
  const storeConfigFile = Object.keys(zip.files).find(n => n.toLowerCase() === 'store-config.json');
  if (!storeConfigFile) throw new Error('store-config.json not found in ZIP');

  const configText = await zip.files[storeConfigFile].async('text');
  const config = JSON.parse(configText);
  if (config.floor && Array.isArray(config.floor)) {
    config.floor.forEach(floor => {
      if (floor.glb_file_name && floor.glb_file_name.toLowerCase().endsWith('.glb')) {
        floor.glb_file_name = floor.glb_file_name.replace(/\.glb$/i, '_baked.glb');
      }
    });
  }
  liveZip.file(storeConfigFile, JSON.stringify(config, null, 2));

  const liveZipBuffer = await liveZip.generateAsync({ type: 'nodebuffer' });
  console.log(`  Created live ZIP with ${bakedGlbCount} baked GLB(s)`);

  // Step 13: Insert fixture records
  console.log(`Step 13: Inserting ${finalFixtures.length} fixture record(s) ...`);
  await insertFixtures(supabase, finalFixtures);

  // Step 14: Move leftover TEMP to STORAGE
  if (moveToStorage.length > 0) {
    console.log(`Step 14: Moving ${moveToStorage.length} fixture(s) to STORAGE ...`);
    const storageFixtures = moveToStorage
      .map(fixtureId => {
        const existing = existingFixtures.find(f => f.fixture_id === fixtureId);
        if (!existing) return null;
        return {
          fixture_id: existing.fixture_id,
          store_id: storeCode,
          fixture_type: existing.fixture_type,
          brand: 'STORAGE',
          floor_index: existing.floor_index,
          pos_x: existing.pos_x,
          pos_y: existing.pos_y,
          pos_z: existing.pos_z,
          created_at: existing.created_at,
        };
      })
      .filter(Boolean);
    await insertFixtures(supabase, storageFixtures);
  } else {
    console.log(`Step 14: No fixtures to move to STORAGE`);
  }

  // Step 15: Look up store metadata
  console.log(`Step 15: Looking up store metadata ...`);
  const storeInfo = storeData.find(s => s.storeCode === storeCode);
  if (storeInfo) {
    console.log(`  Found: ${storeInfo.storeName} (${storeInfo.city}, ${storeInfo.state})`);
  } else {
    console.log(`  No metadata found in storemaster.csv`);
  }

  // Step 16: Call makeStoreLive API
  console.log(`Step 16: Calling makeStoreLive API ...`);

  // Derive entity from formatType: "Trends Small Town" → "tst", everything else → "trends"
  const formatType = (storeInfo?.formatType || '').toLowerCase().trim();
  const derivedEntity = formatType === 'trends small town' ? 'tst' : 'trends';
  const storedEntity = (r.entity || 'trends').toLowerCase();
  const entity = derivedEntity;

  if (storedEntity !== derivedEntity) {
    console.log(`  Entity corrected: "${storedEntity}" -> "${derivedEntity}" (formatType="${storeInfo?.formatType || ''}")`);
    writeLog(`  Entity corrected: "${storedEntity}" -> "${derivedEntity}" (formatType="${storeInfo?.formatType || ''}")`);
  }

  const formData = new FormData();
  formData.append('entity', entity);
  formData.append('store', storeCode);
  formData.append('store3dZip', new Blob([liveZipBuffer], { type: 'application/zip' }), `${r.store_name}.zip`);
  formData.append('spawnPoint', '0,0,0');
  formData.append('storeName', r.store_name);

  if (storeInfo?.nocName) formData.append('nocName', storeInfo.nocName);
  if (storeInfo?.sapName) formData.append('sapName', storeInfo.sapName);
  if (storeInfo?.zone) formData.append('zone', storeInfo.zone);
  if (storeInfo?.state) formData.append('state', storeInfo.state);
  if (storeInfo?.city) formData.append('city', storeInfo.city);
  if (storeInfo?.format) formData.append('formate', storeInfo.format);
  if (storeInfo?.formatType) formData.append('formatType', storeInfo.formatType);

  const makeLiveResponse = await fetch(`${MAKE_LIVE_API_URL}/api/tooling/processStore3DZip`, {
    method: 'POST',
    body: formData,
  });

  if (!makeLiveResponse.ok) {
    const errorText = await makeLiveResponse.text();
    throw new Error(`makeStoreLive API failed: ${makeLiveResponse.status} ${errorText}`);
  }

  const makeLiveResult = await makeLiveResponse.json();
  console.log(`  makeStoreLive API response:`, JSON.stringify(makeLiveResult).substring(0, 200));

  // Step 17: Update deployment status
  console.log(`Step 17: Updating deployment status to 'deploying' ...`);
  const { error: updateError } = await supabase
    .from('store_saves')
    .update({
      status: 'deploying',
      deployed_at: new Date().toISOString(),
      entity: entity,
    })
    .eq('id', r.id);

  if (updateError) {
    console.warn(`  Warning: Failed to update deployment status: ${updateError.message}`);
  } else {
    console.log(`  Updated store record status to 'deploying'`);
  }

  writeLog(`  Result: SUCCESS - ${finalFixtures.length} fixtures, ${migratedCount} brands migrated, ${filterResult.removedCount} excluded, ${moveToStorage.length} to storage`);

  return {
    success: true,
    storeCode,
    storeName: r.store_name,
    fixtureCount: finalFixtures.length,
    migratedBrands: migratedCount,
    removedFixtures: filterResult.removedCount,
    movedToStorage: moveToStorage.length,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  initLogFile();
  console.log(`Log file: ${logFilePath}`);

  console.log('='.repeat(70));
  console.log('Batch Make-Live Script');
  console.log('='.repeat(70));
  console.log(`Store codes: ${opts.storeCodes.join(', ')}`);
  console.log(`Pipeline version: ${opts.pipelineVersion}`);
  console.log(`Dry run: ${opts.dryRun}`);
  console.log(`Continue on error: ${opts.continueOnError}`);
  console.log(`Env file: ${opts.envFile}`);
  console.log('='.repeat(70));

  // Load environment
  const envPath = path.resolve(PROJECT_ROOT, opts.envFile);
  if (!fs.existsSync(envPath)) {
    console.error(`Env file not found: ${envPath}`);
    process.exit(1);
  }
  dotenv.config({ path: envPath });

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  const BUCKET = process.env.VITE_SUPABASE_BUCKET?.split('#')[0]?.trim() || 'store-archives';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env file');
    process.exit(1);
  }

  // Use service role key to bypass RLS (required for storage uploads and DB inserts)
  const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Warning: VITE_SUPABASE_SERVICE_ROLE_KEY not set, using anon key (uploads may fail due to RLS)');
  }

  const supabase = createClient(SUPABASE_URL, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  writeLog(`Store codes: ${opts.storeCodes.join(', ')}`);
  writeLog(`Pipeline version: ${opts.pipelineVersion}`);
  writeLog(`Dry run: ${opts.dryRun}`);
  writeLog(`Env file: ${opts.envFile}`);
  writeLog('');

  // Load store master data
  console.log('\nLoading store master data ...');
  const storeData = loadStoreMasterData();
  console.log(`Loaded ${storeData.length} store(s) from storemaster.csv\n`);

  // Process each store
  const results = [];
  const failed = [];

  for (let idx = 0; idx < opts.storeCodes.length; idx++) {
    const storeCode = opts.storeCodes[idx];
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[${idx + 1}/${opts.storeCodes.length}] Processing store: ${storeCode}`);
    console.log('='.repeat(70));

    try {
      const result = await makeLiveForStore(
        supabase, BUCKET, storeCode, opts.pipelineVersion, opts.dryRun, storeData
      );
      results.push(result);
      console.log(`\n  SUCCESS: Store "${result.storeName}" (${storeCode}) - ${result.fixtureCount} fixtures`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ storeCode, error: message });
      console.error(`\n  FAILED: Store "${storeCode}" - ${message}`);
      writeLog('');
      writeLog(`Store: ${storeCode}`);
      writeLog(`  Result: FAILED - ${message}`);

      if (!opts.continueOnError) {
        console.error('\nAborting (use --continue-on-error to process remaining stores)');
        break;
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total stores: ${opts.storeCodes.length}`);
  console.log(`Succeeded: ${results.length}`);
  console.log(`Failed: ${failed.length}`);

  writeLog('');
  writeLog('='.repeat(70));
  writeLog('SUMMARY');
  writeLog('='.repeat(70));
  writeLog(`Store codes: ${opts.storeCodes.join(', ')}`);
  writeLog(`Pipeline version: ${opts.pipelineVersion}`);
  writeLog(`Dry run: ${opts.dryRun}`);
  writeLog(`Total stores: ${opts.storeCodes.length}`);
  writeLog(`Succeeded: ${results.length}`);
  writeLog(`Failed: ${failed.length}`);

  if (results.length > 0) {
    console.log('\nSuccessful:');
    writeLog('\nSuccessful:');
    for (const r of results) {
      const line = `  ${r.storeCode} - "${r.storeName}" (${r.fixtureCount} fixtures)${r.dryRun ? ' [DRY-RUN]' : ''}`;
      console.log(line);
      writeLog(line);
    }
  }

  if (failed.length > 0) {
    console.log('\nFailed:');
    writeLog('\nFailed:');
    for (const f of failed) {
      const line = `  ${f.storeCode} - ${f.error}`;
      console.log(line);
      writeLog(line);
    }
  }

  console.log(`\nLog file: ${logFilePath}`);
  closeLogFile();

  if (failed.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
