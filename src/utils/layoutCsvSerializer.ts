import type { LocationData } from '../hooks/useFixtureSelection';

/**
 * Serialize LocationData[] back to location-master.csv text.
 * 15-column format: Block Name, Floor Index, Origin X, Origin Y, Origin Z,
 * Pos X, Pos Y, Pos Z, Rotation X, Rotation Y, Rotation Z, Brand, Count, Hierarchy, Fixture ID
 */
export function serializeLocationDataToCsv(data: LocationData[]): string {
  const header = 'Block Name,Floor Index,Origin X (m),Origin Y (m),Origin Z (m),Pos X (m),Pos Y (m),Pos Z (m),Rotation X (deg),Rotation Y (deg),Rotation Z (deg),Brand,Count,Hierarchy,Fixture ID';

  const rows = data
    .filter(loc => !loc.forDelete)
    .map(loc => [
      loc.blockName,
      loc.floorIndex,
      Number((loc.originX ?? 0).toFixed(12)),
      Number((loc.originY ?? 0).toFixed(12)),
      0, // Origin Z is always 0
      Number(loc.posX.toFixed(12)),
      Number(loc.posY.toFixed(12)),
      Number(loc.posZ.toFixed(1)),
      Number(loc.rotationX.toFixed(1)),
      Number(loc.rotationY.toFixed(1)),
      Number(loc.rotationZ.toFixed(1)),
      loc.brand,
      loc.count,
      loc.hierarchy,
      loc.fixtureId || '',
    ].join(','));

  return [header, ...rows].join('\n');
}
