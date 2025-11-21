/**
 * Fetch fixture type mapping from backend API
 * Maps block names to fixture types
 */

export interface BlockTypeMapping {
  blockName: string;
  fixtureType: string;
}

// Use the Rhino backend API (same as api.ts)
const API_BASE_URL = import.meta.env.MODE === "production"
  ? 'https://ec2-prod-rhino.dg2n.com'
  : ""; // Empty string uses relative URLs (goes through Vite proxy)

const FIXTURE_BLOCKS_API = `${API_BASE_URL}/api/fixtures/block-types`;

// Cache to avoid repeated API calls
let blockTypeMappingCache: Map<string, string> | null = null;

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
 * Clear the cache (useful for testing or forced refresh)
 */
export function clearBlockTypeMappingCache(): void {
  blockTypeMappingCache = null;
}
