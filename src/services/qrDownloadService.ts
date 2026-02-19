import JSZip from 'jszip';
import QRCode from 'qrcode';
import type { StoreFixtureWithHistory } from './supabaseService';

function escapeCSV(value: any): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSVManifest(fixtures: StoreFixtureWithHistory[]): string {
  const header = 'fixture_id,fixture_type,brand,floor,new_fixture,fixture_moved_from,fixture_moved_to';

  const rows = fixtures.map((f) => [
    escapeCSV(f.fixture_id),
    escapeCSV(f.fixture_type),
    escapeCSV(f.brand),
    escapeCSV(f.floor_index),
    escapeCSV(f.isNew ? 'yes' : 'no'),
    escapeCSV(f.movedFrom || ''),
    escapeCSV(f.movedTo || ''),
  ].join(','));

  return [header, ...rows].join('\n');
}

function generatePrintableHTML(
  storeId: string,
  storeName: string,
  qrItems: Array<{ dataUrl: string; qrValue: string; fixture: StoreFixtureWithHistory }>
): string {
  const cells = qrItems.map(({ dataUrl, fixture }) => `
    <div class="cell">
      <img src="${dataUrl}" alt="${fixture.fixture_id}" />
      <div class="fixture-id">${fixture.fixture_id}</div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${storeName} QR Codes</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      background: #fff;
      color: #000;
    }
    h1 {
      font-size: 11pt;
      text-align: center;
      margin-bottom: 6mm;
      padding-bottom: 3mm;
      border-bottom: 1px solid #ccc;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      width: 100%;
    }
    .cell {
      border: 1px dashed #bbb;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3mm 2mm 4mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .cell img {
      width: 38mm;
      height: 38mm;
      display: block;
    }
    .fixture-id {
      font-size: 11pt;
      font-weight: bold;
      text-align: center;
      margin-top: 2mm;
      word-break: break-all;
    }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <h1>${storeName} (${storeId}) &mdash; QR Codes &mdash; Open in browser and print (Ctrl+P) to A4</h1>
  <div class="grid">${cells}
  </div>
</body>
</html>`;
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
  const allQrItems: Array<{ dataUrl: string; qrValue: string; fixture: StoreFixtureWithHistory }> = [];

  for (let i = 0; i < fixtures.length; i += BATCH_SIZE) {
    const batch = fixtures.slice(i, i + BATCH_SIZE);

    const qrCodes = await Promise.all(
      batch.map(async (fixture) => {
        try {
          const qrValue = `${entity}:${fixture.store_id}:${fixture.fixture_id}`;

          const dataUrl = await QRCode.toDataURL(qrValue, {
            width: 256,
            margin: 2,
            errorCorrectionLevel: 'M',
          });

          successCount++;
          return { dataUrl, qrValue, fixture };
        } catch (err) {
          console.warn(`Error generating QR for ${fixture.fixture_id}:`, err);
          return null;
        }
      })
    );

    qrCodes.forEach((qr) => {
      if (qr) {
        allQrItems.push({ dataUrl: qr.dataUrl, qrValue: qr.qrValue, fixture: qr.fixture });
      }
    });
  }

  if (successCount === 0) {
    throw new Error('Failed to generate any QR codes. Please try again.');
  }

  // Add CSV manifest
  const csv = generateCSVManifest(fixtures);
  zip.file('qr_codes_manifest.csv', csv);

  // Add printable A4 HTML sheet
  const html = generatePrintableHTML(storeId, storeName, allQrItems);
  zip.file('qr_codes_printable.html', html);

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
