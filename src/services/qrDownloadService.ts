import JSZip from 'jszip';
import { generateQRCodeBlob } from './qrCodeService';
import type { StoreFixtureWithHistory } from './supabaseService';

function generateQRImageName(
  storeId: string,
  floorIndex: number,
  brand: string,
  fixtureType: string,
  fixtureId: string
): string {
  return `${storeId}-${floorIndex}-${brand}-${fixtureType}-${fixtureId}.png`;
}

function escapeCSV(value: any): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSVManifest(fixtures: StoreFixtureWithHistory[]): string {
  const header = 'fixture_id,fixture_type,brand,floor,qr_code_image_name,new_fixture,fixture_moved_from,fixture_moved_to';

  const rows = fixtures.map((f) => {
    const imageName = generateQRImageName(
      f.store_id,
      f.floor_index,
      f.brand,
      f.fixture_type,
      f.fixture_id
    );

    return [
      escapeCSV(f.fixture_id),
      escapeCSV(f.fixture_type),
      escapeCSV(f.brand),
      escapeCSV(f.floor_index),
      escapeCSV(imageName),
      escapeCSV(f.isNew ? 'yes' : 'no'),
      escapeCSV(f.movedFrom || ''),
      escapeCSV(f.movedTo || ''),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

export async function downloadQRCodesZIP(
  entity: string,
  storeId: string,
  storeName: string,
  fixtures: StoreFixtureWithHistory[]
): Promise<void> {
  if (fixtures.length === 0) {
    throw new Error('No fixtures available for this store.');
  }

  const zip = new JSZip();

  // Generate QR codes in batches (10 at a time)
  const BATCH_SIZE = 10;
  let successCount = 0;

  for (let i = 0; i < fixtures.length; i += BATCH_SIZE) {
    const batch = fixtures.slice(i, i + BATCH_SIZE);

    const qrCodes = await Promise.all(
      batch.map(async (fixture) => {
        try {
          // Generate QR code on-the-fly with format: entity:store_id:fixture_id
          const qrBlob = await generateQRCodeBlob(entity, fixture.store_id, fixture.fixture_id);

          const fileName = generateQRImageName(
            fixture.store_id,
            fixture.floor_index,
            fixture.brand,
            fixture.fixture_type,
            fixture.fixture_id
          );

          successCount++;
          return { fileName, blob: qrBlob };
        } catch (err) {
          console.warn(`Error generating QR for ${fixture.fixture_id}:`, err);
          return null;
        }
      })
    );

    // Add successful QR codes to ZIP
    qrCodes.forEach((qr) => qr && zip.file(qr.fileName, qr.blob));
  }

  if (successCount === 0) {
    throw new Error('Failed to generate any QR codes. Please try again.');
  }

  // Add CSV manifest
  const csv = generateCSVManifest(fixtures);
  zip.file('qr_codes_manifest.csv', csv);

  // Generate and download ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${storeId}_${storeName}_qrcodes.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  console.log(`Generated and downloaded ${successCount}/${fixtures.length} QR codes`);
}
