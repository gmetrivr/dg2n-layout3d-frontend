import QRCode from 'qrcode';

/**
 * Generate a QR code as a PNG Blob
 * @param entity - The entity (e.g., "trends")
 * @param storeId - The store ID
 * @param fixtureId - The fixture ID
 * @returns PNG Blob containing the QR code with format: entity:store_id:fixture_id
 */
export async function generateQRCodeBlob(
  entity: string,
  storeId: string,
  fixtureId: string
): Promise<Blob> {
  // Format: entity:store_id:fixture_id
  const qrContent = `${entity}:${storeId}:${fixtureId}`;

  // Generate QR code as Data URL (256x256px)
  const dataUrl = await QRCode.toDataURL(qrContent, {
    width: 256,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  // Convert Data URL to Blob
  const response = await fetch(dataUrl);
  return await response.blob();
}
