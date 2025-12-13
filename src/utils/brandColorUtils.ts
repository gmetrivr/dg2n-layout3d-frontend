/**
 * Brand Category to Color Mapping Utilities
 * Maps brand categories to specific colors for fixture area visualization
 */

// Color mapping for brand categories
const CATEGORY_COLOR_MAP: Record<string, string> = {
  'MENS-CASUAL': '#80ffff',
  'WOMENS-WESTERN-WEAR': '#ffe8a3',
  'WOMENS-ETHNIC-WEAR': '#ffff85',
  'MENS-FORMAL': '#c2e0ff',
  'MENS-ETHNIC': '#004e98',
  'KIDS': '#ffbdff',
};

// Default color for unmapped categories
const DEFAULT_CATEGORY_COLOR = '#4CAF50'; // Green (original default)

/**
 * Get color for a brand based on its category
 * @param brandCategoryMapping - Mapping of brand names to categories
 * @param brand - Brand name
 * @returns Hex color string
 */
export function getBrandCategoryColor(
  brandCategoryMapping: Record<string, string>,
  brand: string
): string {
  // Get category for the brand
  const category = brandCategoryMapping[brand];

  // Return mapped color if category exists, otherwise return default
  return category && CATEGORY_COLOR_MAP[category]
    ? CATEGORY_COLOR_MAP[category]
    : DEFAULT_CATEGORY_COLOR;
}

/**
 * Get all available category colors
 * @returns Object mapping categories to colors
 */
export function getCategoryColorMap(): Record<string, string> {
  return { ...CATEGORY_COLOR_MAP };
}

/**
 * Get default color for unmapped categories
 * @returns Default hex color string
 */
export function getDefaultCategoryColor(): string {
  return DEFAULT_CATEGORY_COLOR;
}
