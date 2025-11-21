import type { StoreFixtureId, StoreFixtureIdRow } from './supabaseService';
import {
  generateFixtureId,
  findClosestFixture,
  isFixtureMatch,
  type FixtureWithPosition,
} from '../utils/fixtureIdUtils';
import { getFixtureType } from './fixtureTypeMapping';

export interface CurrentFixture {
  blockName: string; // type
  floorIndex: number;
  posX: number;
  posY: number;
  posZ: number;
  brand: string;
}

export interface AssignedFixture extends CurrentFixture {
  fixtureId: string;
  createdAt: string;
}

interface TempFixture extends FixtureWithPosition {
  fixture_id: string;
  created_at: string; // Preserved from original fixture
}

interface FixtureClassification {
  noChange: Array<{ current: CurrentFixture; existing: StoreFixtureIdRow }>;
  deletions: TempFixture[]; // In-memory TEMP fixtures with floor_index
  additions: CurrentFixture[];
}

/**
 * Convert CurrentFixture to FixtureWithPosition for matching
 */
function toFixtureWithPosition(fixture: CurrentFixture, blockTypeMapping: Map<string, string>): FixtureWithPosition {
  return {
    fixture_type: getFixtureType(fixture.blockName, blockTypeMapping),
    floor_index: fixture.floorIndex,
    pos_x: fixture.posX,
    pos_y: fixture.posY,
  };
}

/**
 * Convert StoreFixtureIdRow to FixtureWithPosition for matching
 * Uses floor_index from the database
 */
function existingToFixtureWithPosition(fixture: StoreFixtureIdRow): FixtureWithPosition {
  return {
    fixture_type: fixture.fixture_type,
    floor_index: fixture.floor_index,
    pos_x: fixture.pos_x,
    pos_y: fixture.pos_y,
  };
}

/**
 * Classify fixtures into no-change, deletions (TEMP), and additions
 */
function classifyFixtures(
  currentFixtures: CurrentFixture[],
  existingFixtures: StoreFixtureIdRow[],
  blockTypeMapping: Map<string, string>
): FixtureClassification {
  const noChange: Array<{ current: CurrentFixture; existing: StoreFixtureIdRow }> = [];
  const additions: CurrentFixture[] = [];
  const matchedExistingIds = new Set<string>();

  // Filter out STORAGE fixtures from matching (they're in the reuse pool, not active fixtures)
  const activeExisting = existingFixtures.filter((f) => f.brand !== 'STORAGE');

  // Find no-change and additions
  for (const current of currentFixtures) {
    const currentPos = toFixtureWithPosition(current, blockTypeMapping);

    // Try to find exact match in existing (same fixture_type + position within 0.3m)
    const match = activeExisting.find((existing) => {
      if (matchedExistingIds.has(existing.id)) {
        return false;
      }
      // For no-change matching, compare fixture_type and position (within 0.3m threshold)
      const existingPos = existingToFixtureWithPosition(existing);
      return isFixtureMatch(currentPos, existingPos);
    });

    if (match) {
      noChange.push({ current, existing: match });
      matchedExistingIds.add(match.id);
    } else {
      additions.push(current);
      // Debug: log fixtures that didn't match
      console.log(`Addition: ${current.blockName} at floor ${current.floorIndex}, pos (${current.posX.toFixed(2)}, ${current.posY.toFixed(2)})`);
    }
  }

  // Find deletions (active fixtures not matched) - convert to TEMP with floor_index from DB
  const deletions: TempFixture[] = activeExisting
    .filter((existing) => !matchedExistingIds.has(existing.id))
    .map((existing) => {
      // Debug: log fixtures from DB that didn't match
      console.log(`Deletion: ${existing.fixture_type} (${existing.fixture_id}) at floor ${existing.floor_index}, pos (${existing.pos_x.toFixed(2)}, ${existing.pos_y.toFixed(2)})`);
      return {
        fixture_id: existing.fixture_id,
        fixture_type: existing.fixture_type,
        floor_index: existing.floor_index, // Use floor_index from database
        pos_x: existing.pos_x,
        pos_y: existing.pos_y,
        created_at: existing.created_at, // Preserve created_at
      };
    });

  console.log(`Classification: ${noChange.length} no-change, ${deletions.length} deletions (TEMP), ${additions.length} additions`);

  return { noChange, deletions, additions };
}

/**
 * Assign fixture IDs to additions using TEMP (in-memory) and STORAGE pools
 */
function assignFixtureIds(
  additions: CurrentFixture[],
  tempFixtures: TempFixture[],
  storageFixtures: StoreFixtureIdRow[],
  blockTypeMapping: Map<string, string>
): { assignments: AssignedFixture[]; usedTempIds: Set<string>; usedStorageIds: Set<string> } {
  const assignments: AssignedFixture[] = [];
  const usedTempIds = new Set<string>();
  const usedStorageIds = new Set<string>();
  const now = new Date().toISOString();

  for (const addition of additions) {
    const additionPos = toFixtureWithPosition(addition, blockTypeMapping);

    console.log(`\n[ASSIGN] Addition: ${additionPos.fixture_type} at floor ${additionPos.floor_index}, pos (${additionPos.pos_x.toFixed(2)}, ${additionPos.pos_y.toFixed(2)})`);

    // Try TEMP first (has floor_index for floor-aware matching)
    const availableTemp = tempFixtures.filter((f) => !usedTempIds.has(f.fixture_id));
    console.log(`[ASSIGN] Available TEMP: ${availableTemp.length} fixtures`);
    availableTemp.forEach(f => {
      console.log(`  - ${f.fixture_id}: ${f.fixture_type} floor ${f.floor_index} at (${f.pos_x.toFixed(2)}, ${f.pos_y.toFixed(2)})`);
    });

    const tempMatch = findClosestFixture(additionPos, availableTemp);

    if (tempMatch) {
      console.log(`[ASSIGN] TEMP Match found: ${tempMatch.fixture_id} (floor ${tempMatch.floor_index})`);

      const matchedTempFixture = availableTemp.find((f) => f.fixture_id === tempMatch.fixture_id);
      if (matchedTempFixture) {
        assignments.push({
          ...addition,
          fixtureId: matchedTempFixture.fixture_id,
          createdAt: matchedTempFixture.created_at, // Preserve created_at from TEMP
        });
        usedTempIds.add(matchedTempFixture.fixture_id);
        continue;
      }
    }

    // Try STORAGE second (uses floor_index from DB for floor-aware matching)
    const availableStorage = storageFixtures.filter((f) => !usedStorageIds.has(f.fixture_id));
    const storageMatchCandidates = availableStorage.map((f) =>
      existingToFixtureWithPosition(f)
    );
    const storageMatch = findClosestFixture(additionPos, storageMatchCandidates);

    if (storageMatch) {
      const matchedStorageFixture = availableStorage.find(
        (f) => f.fixture_type === storageMatch.fixture_type && f.pos_x === storageMatch.pos_x && f.pos_y === storageMatch.pos_y
      );
      if (matchedStorageFixture) {
        assignments.push({
          ...addition,
          fixtureId: matchedStorageFixture.fixture_id,
          createdAt: matchedStorageFixture.created_at, // Preserve created_at from STORAGE
        });
        usedStorageIds.add(matchedStorageFixture.fixture_id);
        continue;
      }
    }

    // Generate new ID if no match found
    assignments.push({
      ...addition,
      fixtureId: generateFixtureId(),
      createdAt: now, // New fixture - set created_at to now
    });
  }

  return { assignments, usedTempIds, usedStorageIds };
}

/**
 * Make Live #1: New store setup - generate new fixture IDs for all fixtures
 */
export function assignFixtureIdsNewStore(
  storeId: string,
  currentFixtures: CurrentFixture[],
  blockTypeMapping: Map<string, string>
): StoreFixtureId[] {
  const now = new Date().toISOString();
  return currentFixtures.map((fixture) => ({
    fixture_id: generateFixtureId(),
    store_id: storeId,
    fixture_type: getFixtureType(fixture.blockName, blockTypeMapping),
    brand: fixture.brand,
    floor_index: fixture.floorIndex,
    pos_x: fixture.posX,
    pos_y: fixture.posY,
    pos_z: fixture.posZ,
    created_at: now, // New fixture - set created_at to now
  }));
}

/**
 * Make Live #2: Update existing store - reuse, reassign, or generate fixture IDs
 */
export function assignFixtureIdsUpdateStore(
  storeId: string,
  currentFixtures: CurrentFixture[],
  existingFixtures: StoreFixtureIdRow[],
  blockTypeMapping: Map<string, string>
): {
  finalFixtures: StoreFixtureId[];
  moveToStorage: string[]; // fixture_ids to move to STORAGE (leftover TEMP)
} {
  // Step 1: Classify fixtures
  const { noChange, deletions, additions } = classifyFixtures(currentFixtures, existingFixtures, blockTypeMapping);

  // Step 2: deletions become TEMP pool (in-memory only)
  const tempFixtures = deletions;

  // Step 3: Get existing STORAGE fixtures
  const storageFixtures = existingFixtures.filter((f) => f.brand === 'STORAGE');

  // Step 4: Assign fixture IDs to additions
  console.log(`Assignment pools: ${tempFixtures.length} TEMP, ${storageFixtures.length} STORAGE`);
  const { assignments, usedTempIds } = assignFixtureIds(additions, tempFixtures, storageFixtures, blockTypeMapping);
  console.log(`Assigned: ${assignments.length} additions (${usedTempIds.size} from TEMP)`);

  // Step 5: Collect final fixtures
  const finalFixtures: StoreFixtureId[] = [
    // No-change fixtures (keep existing fixture_id, fixture_type, created_at; use current brand/position/floor)
    ...noChange.map(({ current, existing }) => ({
      fixture_id: existing.fixture_id,
      store_id: storeId,
      fixture_type: existing.fixture_type, // Keep existing fixture_type (already mapped)
      brand: current.brand, // Use current brand from location master
      floor_index: current.floorIndex, // Use current floor_index
      pos_x: current.posX,
      pos_y: current.posY,
      pos_z: current.posZ,
      created_at: existing.created_at, // Preserve original created_at
    })),

    // Assigned fixtures (additions with assigned IDs and created_at)
    ...assignments.map((assigned) => ({
      fixture_id: assigned.fixtureId,
      store_id: storeId,
      fixture_type: getFixtureType(assigned.blockName, blockTypeMapping),
      brand: assigned.brand, // Use current brand from location master
      floor_index: assigned.floorIndex, // Use current floor_index
      pos_x: assigned.posX,
      pos_y: assigned.posY,
      pos_z: assigned.posZ,
      created_at: assigned.createdAt, // Preserved or new timestamp
    })),
  ];

  // Step 6: Identify leftover TEMP fixtures to move to STORAGE
  // These are deletions that weren't reused
  const moveToStorage = tempFixtures.filter((f) => !usedTempIds.has(f.fixture_id)).map((f) => f.fixture_id);

  return { finalFixtures, moveToStorage };
}
