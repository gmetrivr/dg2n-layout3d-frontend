/**
 * Generate a random 10-character alphanumeric fixture ID
 * @returns A unique 10-character alphanumeric string (uppercase)
 */
export function generateFixtureId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export interface Position2D {
  x: number;
  y: number;
}

/**
 * Calculate 2D Euclidean distance between two positions (X, Y plane - horizontal plane where Z is up)
 * @param pos1 First position
 * @param pos2 Second position
 * @returns Distance in meters
 */
export function calculate2DDistance(pos1: Position2D, pos2: Position2D): number {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface FixtureWithPosition {
  fixture_type: string;
  floor_index: number;
  pos_x: number;
  pos_y: number;
}

/**
 * Find the closest fixture from a list of candidates that matches the type.
 * Prefers same floor (floor_index), but will search all floors if no match found.
 * NO distance threshold - always returns closest match if type matches.
 *
 * @param target Target fixture to match
 * @param candidates List of candidate fixtures to search
 * @returns The closest matching fixture or null if no type match found
 */
export function findClosestFixture<T extends FixtureWithPosition>(
  target: FixtureWithPosition,
  candidates: T[]
): T | null {
  // Filter by matching fixture_type
  const matchingType = candidates.filter((c) => c.fixture_type === target.fixture_type);

  if (matchingType.length === 0) {
    return null;
  }

  // Separate into same floor and different floors
  const sameFloor = matchingType.filter((c) => c.floor_index === target.floor_index);
  const otherFloors = matchingType.filter((c) => c.floor_index !== target.floor_index);

  // Try same floor first
  const searchList = sameFloor.length > 0 ? sameFloor : otherFloors;

  // Find closest by 2D distance (X, Y - horizontal plane)
  let closest: T | null = null;
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

/**
 * Check if two fixtures are at the same position within a threshold (0.3m)
 * Used for "no change" detection
 *
 * @param fixture1 First fixture
 * @param fixture2 Second fixture
 * @param threshold Distance threshold in meters (default 0.3m)
 * @returns True if fixtures are at the same position
 */
export function isSamePosition(
  fixture1: FixtureWithPosition,
  fixture2: FixtureWithPosition,
  threshold: number = 0.3
): boolean {
  const distance = calculate2DDistance(
    { x: fixture1.pos_x, y: fixture1.pos_y },
    { x: fixture2.pos_x, y: fixture2.pos_y }
  );
  return distance <= threshold;
}

/**
 * Check if a fixture matches another by fixture_type and position (within 0.3m threshold)
 * Used for "no change" detection
 *
 * @param fixture1 First fixture
 * @param fixture2 Second fixture
 * @param threshold Distance threshold in meters (default 0.3m)
 * @returns True if fixtures match (same fixture_type + same position)
 */
export function isFixtureMatch(
  fixture1: FixtureWithPosition,
  fixture2: FixtureWithPosition,
  threshold: number = 0.3
): boolean {
  return fixture1.fixture_type === fixture2.fixture_type && isSamePosition(fixture1, fixture2, threshold);
}
