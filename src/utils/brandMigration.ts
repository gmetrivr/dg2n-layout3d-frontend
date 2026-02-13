import JSZip from 'jszip';
import { apiService } from '../services/api';

/**
 * Migrate brand names in location-master.csv within a ZIP blob.
 * Calls the migration API to get updated brand names and applies them to the CSV.
 */
export async function migrateBrandsInZip(zipBlob: Blob, pipelineVersion: string = '02'): Promise<{ zipBlob: Blob; migratedCount: number }> {
  const zip = await JSZip.loadAsync(zipBlob);

  // Find location-master.csv
  const locationCsvFile = zip.file(/location[-_]master\.csv/i)[0];
  if (!locationCsvFile) {
    console.log('[brandMigration] No location-master.csv found, skipping brand migration');
    return { zipBlob, migratedCount: 0 };
  }

  console.log('[brandMigration] Found location-master.csv, extracting brand names...');
  const locationCsvText = await locationCsvFile.async('text');
  const locationLines = locationCsvText.split(/\r?\n/); // Split by both CRLF and LF

  // Parse CSV header to find Brand column index
  const headerLine = locationLines[0];
  const headers = headerLine.split(',').map(h => h.trim());
  const brandColumnIndex = headers.findIndex(h => h.toLowerCase() === 'brand');

  if (brandColumnIndex === -1) {
    console.warn('[brandMigration] Brand column not found in CSV, skipping migration');
    return { zipBlob, migratedCount: 0 };
  }

  // Extract unique brand names from CSV (skip header)
  const uniqueBrands = new Set<string>();
  for (let i = 1; i < locationLines.length; i++) {
    const line = locationLines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    if (values.length > brandColumnIndex) {
      const brand = values[brandColumnIndex].trim();
      if (brand) {
        uniqueBrands.add(brand);
      }
    }
  }

  if (uniqueBrands.size === 0) {
    console.log('[brandMigration] No brands found in CSV, skipping migration');
    return { zipBlob, migratedCount: 0 };
  }

  console.log(`[brandMigration] Found ${uniqueBrands.size} unique brands, calling migration API...`);

  // Call migration API
  let migrationResults;
  try {
    const migrationResponse = await apiService.migrateBrandNames(Array.from(uniqueBrands), pipelineVersion);
    migrationResults = migrationResponse.migrations;
    console.log(`[brandMigration] Migration API returned ${migrationResponse.total_changed} changes`);
  } catch (error) {
    console.error('[brandMigration] Failed to call migration API:', error);
    return { zipBlob, migratedCount: 0 };
  }

  // Build brand mapping
  const brandMap = new Map<string, string>();
  let changedCount = 0;
  for (const result of migrationResults) {
    brandMap.set(result.old_name.toLowerCase(), result.new_name);
    if (result.changed) {
      changedCount++;
      console.log(`[brandMigration] Brand migration: "${result.old_name}" -> "${result.new_name}"`);
    }
  }

  if (changedCount === 0) {
    console.log('[brandMigration] No brand names needed migration');
    return { zipBlob, migratedCount: 0 };
  }

  // Apply migrations to CSV
  // Ensure header has "Fixture ID" column (15th column)
  let updatedHeaderLine = locationLines[0].trim();
  const updatedHeaderColumns = updatedHeaderLine.split(',').map(col => col.trim());
  console.log(`[brandMigration] Original header columns: ${updatedHeaderColumns.length}`, updatedHeaderColumns);
  if (updatedHeaderColumns.length < 15 || !updatedHeaderColumns[14]) {
    console.log(`[brandMigration] Adding Fixture ID header (was ${updatedHeaderColumns.length} columns)`);
    while (updatedHeaderColumns.length < 14) {
      updatedHeaderColumns.push('');
    }
    updatedHeaderColumns[14] = 'Fixture ID';
    console.log('[brandMigration] New header columns:', updatedHeaderColumns);
  } else {
    console.log('[brandMigration] Header already has Fixture ID:', updatedHeaderColumns[14]);
  }
  updatedHeaderLine = updatedHeaderColumns.join(',');
  const updatedLines = [updatedHeaderLine];
  for (let i = 1; i < locationLines.length; i++) {
    const line = locationLines[i].trim();
    if (!line) {
      updatedLines.push(line);
      continue;
    }

    const values = line.split(',');
    if (values.length > brandColumnIndex) {
      const oldBrand = values[brandColumnIndex].trim();
      const newBrand = brandMap.get(oldBrand.toLowerCase());
      if (newBrand && newBrand !== oldBrand) {
        values[brandColumnIndex] = newBrand;
      }
    }

    updatedLines.push(values.join(','));
  }

  // Update CSV in ZIP
  const updatedCsvText = updatedLines.join('\n');
  zip.file(locationCsvFile.name, updatedCsvText);
  console.log(`[brandMigration] Updated location-master.csv with ${changedCount} brand migrations`);

  // Generate updated ZIP blob
  const updatedZipBlob = await zip.generateAsync({ type: 'blob' });
  return { zipBlob: updatedZipBlob, migratedCount: changedCount };
}
