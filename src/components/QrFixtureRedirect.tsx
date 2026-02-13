import { useParams, Navigate } from 'react-router-dom';

/**
 * Route: /qr/:payload
 * Parses QR payload format "entity:store_id:fixture_id" and redirects
 * to the view-only 2D layout with the fixture highlighted.
 */
export function QrFixtureRedirect() {
  const { payload } = useParams<{ payload: string }>();

  if (!payload) {
    return <InvalidPayload reason="No QR payload provided." />;
  }

  // Format: entity:store_id:fixture_id
  const parts = payload.split(':');
  if (parts.length < 3) {
    return <InvalidPayload reason={`Invalid QR format: "${payload}". Expected entity:store_id:fixture_id`} />;
  }

  // parts[0] = entity (e.g. "trends"), parts[1] = store_id, parts[2+] = fixture_id (may contain colons)
  const storeId = parts[1];
  const fixtureId = parts.slice(2).join(':');

  if (!storeId || !fixtureId) {
    return <InvalidPayload reason={`Missing store ID or fixture ID in: "${payload}"`} />;
  }

  return (
    <Navigate
      to={`/layout/${storeId}/view?fixture_id=${encodeURIComponent(fixtureId)}`}
      replace
    />
  );
}

function InvalidPayload({ reason }: { reason: string }) {
  return (
    <div className="h-[calc(100vh-6rem)] flex items-center justify-center">
      <div className="text-center max-w-md">
        <p className="text-destructive font-medium mb-2">Invalid QR Code</p>
        <p className="text-sm text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}
