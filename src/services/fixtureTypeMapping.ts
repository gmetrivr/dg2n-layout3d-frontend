/**
 * Fetch fixture type mapping from backend API
 * Maps block names to fixture types
 */

export interface BlockTypeMapping {
  blockName: string;
  fixtureType: string;
}

// Use the Fastify backend API
const API_BASE_URL =
  import.meta.env.MODE === "production"
    ? 'https://dg2n-layout3d-backend.rc.dg2n.com'
    : import.meta.env.MODE === "rc" || import.meta.env.MODE === "staging"
      ? 'https://dg2n-layout3d-backend.rc.dg2n.com'
      : ""; // Empty string uses relative URLs (goes through Vite proxy)

const FIXTURE_BLOCKS_API = `${API_BASE_URL}/api/fixtures/block-types`;

// Cache to avoid repeated API calls
let blockTypeMappingCache: Map<string, string> | null = null;
const allValidBlockNamesCache = new Map<string, Set<string>>(); // keyed by pipeline_version

/**
 * Fetch block name to fixture type mapping from backend
 * @returns Map of blockName → fixtureType
 */
export async function fetchBlockTypeMapping(): Promise<Map<string, string>> {
  // Return cached mapping if available
  if (blockTypeMappingCache) {
    return blockTypeMappingCache;
  }

  try {
    const response = await fetch(FIXTURE_BLOCKS_API);

    if (!response.ok) {
      throw new Error(`Failed to fetch fixture blocks: ${response.status}`);
    }

    const data = await response.json();

    // Build map from API response
    const mapping = new Map<string, string>();

    // Handle the new response format with block_fixture_types
    if (data.block_fixture_types && typeof data.block_fixture_types === 'object') {
      // New format: { block_fixture_types: { "RTL-4W": "4-WAY", ... } }
      for (const [blockName, fixtureType] of Object.entries(data.block_fixture_types)) {
        if (typeof fixtureType === 'string') {
          mapping.set(blockName, fixtureType);
        }
      }
    } else if (Array.isArray(data)) {
      // Fallback: Array of { blockName, fixtureType }
      for (const item of data) {
        if (item.blockName && item.fixtureType) {
          mapping.set(item.blockName, item.fixtureType);
        } else if (item.block_name && item.fixture_type) {
          mapping.set(item.block_name, item.fixture_type);
        }
      }
    } else if (typeof data === 'object') {
      // Fallback: { "RTL-4W": "Rack", "RTL-SR": "Shelf", ... }
      for (const [blockName, fixtureType] of Object.entries(data)) {
        if (typeof fixtureType === 'string') {
          mapping.set(blockName, fixtureType);
        }
      }
    }

    // Cache the mapping
    blockTypeMappingCache = mapping;

    console.log(`Loaded ${mapping.size} block→fixture_type mappings from API`);
    return mapping;
  } catch (error) {
    console.error('Failed to fetch block type mapping:', error);
    // Return empty map on error - will use blockName as fallback
    return new Map();
  }
}

/**
 * Get fixture type for a block name
 * @param blockName The block name (e.g., "RTL-4W")
 * @param mapping The block→fixture_type map
 * @returns Fixture type or blockName as fallback
 */
export function getFixtureType(blockName: string, mapping: Map<string, string>): string {
  return mapping.get(blockName) || blockName; // Fallback to blockName if not found
}

/**
 * Fetch all valid block names from backend API.
 * Used to prune the location-master.csv before live deployment.
 * @returns Set of all valid block names, or null if the call fails
 */
export async function fetchAllValidBlockNames(pipelineVersion: string = '02'): Promise<Set<string> | null> {
  if (allValidBlockNamesCache.has(pipelineVersion)) {
    return allValidBlockNamesCache.get(pipelineVersion)!;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/fixtures/blocks/all?pipeline_version=${pipelineVersion}`);

    if (!response.ok) {
      console.warn(`Failed to fetch all fixture block names: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const blockNames = new Set<string>();

    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === 'string') blockNames.add(item);
        else if (item.block_name) blockNames.add(item.block_name);
        else if (item.blockName) blockNames.add(item.blockName);
      }
    } else if (data.blocks && Array.isArray(data.blocks)) {
      for (const item of data.blocks) {
        if (typeof item === 'string') blockNames.add(item);
        else if (item.block_name) blockNames.add(item.block_name);
        else if (item.blockName) blockNames.add(item.blockName);
      }
    } else if (data.block_names && Array.isArray(data.block_names)) {
      for (const name of data.block_names) blockNames.add(name);
    } else if (data.all_block_names && Array.isArray(data.all_block_names)) {
      for (const name of data.all_block_names) blockNames.add(name);
    } else if (data.block_fixture_types && typeof data.block_fixture_types === 'object') {
      for (const name of Object.keys(data.block_fixture_types)) blockNames.add(name);
    }

    allValidBlockNamesCache.set(pipelineVersion, blockNames);
    console.log(`Loaded ${blockNames.size} valid block names from /api/fixtures/blocks/all (pipeline=${pipelineVersion})`);
    return blockNames;
  } catch (error) {
    console.warn('Failed to fetch all valid block names:', error);
    return null;
  }
}

/**
 * Clear the cache (useful for testing or forced refresh)
 */
export function clearBlockTypeMappingCache(): void {
  blockTypeMappingCache = null;
  allValidBlockNamesCache.clear();
}
