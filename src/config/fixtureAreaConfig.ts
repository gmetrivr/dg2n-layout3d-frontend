/**
 * Configuration file for fixture area calculations
 * All areas are in square feet (sqft)
 */

export interface FixtureAreaInfo {
  fixtureType: string;
  areaInSqft: number;
  description?: string;
}

/**
 * Mapping of fixture types to their standard area in square feet
 * These values should be adjusted based on actual fixture specifications
 */
export const FIXTURE_AREA_CONFIG: Record<string, number> = {
  // Core fixture types
  'WALL-BAY': 6.5,           // Wall bay fixtures
  'A-RAIL': 40.7,             // A-Rail fixtures
  '4-WAY': 45.7,              // 4-Way fixtures
  'NESTED-TABLE': 57.2,       // Nested table fixtures
  'GLASS-TABLE': 52.9,        // Glass table fixtures
  'H-GONDOLA': 68.9,          // H-Gondola fixtures
  'IMPULSE-FIXTURE': 34.5,    // Impulse fixtures
  'ACC-GONDOLA': 31.5,        // Accessory gondola fixtures

  // Additional fixture types (to be adjusted as needed)
  'GONDOLA': 35.0,
  'SHELF': 15.0,
  'RACK': 25.0,
  'DISPLAY-STAND': 20.0,
  'MANNEQUIN-STAND': 10.0,

  // Default fallback
  'DEFAULT': 25.0,
};

/**
 * Get the area for a specific fixture type
 * @param fixtureType - The fixture type string
 * @returns Area in square feet
 */
export function getFixtureArea(fixtureType: string): number {
  const normalizedType = fixtureType.toUpperCase().trim();
  return FIXTURE_AREA_CONFIG[normalizedType] || FIXTURE_AREA_CONFIG['DEFAULT'];
}

/**
 * Calculate total brand area for given fixtures
 * @param fixtureCount - Number of fixtures
 * @param fixtureType - Type of fixture
 * @returns Total area in square feet
 */
export function calculateBrandArea(fixtureCount: number, fixtureType: string): number {
  const areaPerFixture = getFixtureArea(fixtureType);
  return fixtureCount * areaPerFixture;
}

/**
 * Get all configured fixture types
 */
export function getAllFixtureTypes(): string[] {
  return Object.keys(FIXTURE_AREA_CONFIG).filter(key => key !== 'DEFAULT');
}

/**
 * Brand metadata interface
 */
export interface BrandMetadata {
  brand: string;
  segment: string;
  family: string;
  brandType: string;
}

/**
 * Brand metadata configuration
 * Contains product segment, family, and brand type information for each brand
 */
export const BRAND_METADATA: BrandMetadata[] = [
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
  { brand: "EXT-ZIVAME", segment: "WOMENS INTIMATE", family: "LINGERIE", brandType: "PRIVATE LABEL" }
];

/**
 * Brand metadata lookup map (normalized brand name -> metadata)
 */
const brandMetadataMap = new Map<string, BrandMetadata>(
  BRAND_METADATA.map(item => [normalizeBrandName(item.brand), item])
);

/**
 * Normalize brand name for lookup
 * Converts to uppercase and removes extra spaces/special characters
 */
function normalizeBrandName(brand: string): string {
  return brand.toUpperCase().trim().replace(/\s+/g, ' ');
}

/**
 * Get brand metadata by brand name
 * @param brandName - The brand name to lookup
 * @returns Brand metadata or null if not found
 */
export function getBrandMetadata(brandName: string): BrandMetadata | null {
  const normalized = normalizeBrandName(brandName);
  return brandMetadataMap.get(normalized) || null;
}
