import { getBrandCategoryColor } from '../utils/brandColorUtils';
import { getFixtureSvgPath, getFixtureSize, getFixtureOffset } from '../utils/fixtureSvgConfig';
import type { LocationData } from '../hooks/useFixtureSelection';
import type { FloorOutline } from '../utils/floorOutlineExtractor';

interface DownloadLayoutPdfOptions {
  locationData: LocationData[];
  floorOutlines: Record<number, FloorOutline>;
  floorIndices: number[];
  fixtureTypeMap: Map<string, string>;
  brandCategoryMapping: Record<string, string>;
  storeName: string;
  storeId: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Fetch an SVG file and return it as a base64 data URI for embedding in offline HTML. */
async function fetchSvgDataUri(path: string): Promise<string> {
  try {
    const res = await fetch(path);
    if (!res.ok) return '';
    const text = await res.text();
    const b64 = btoa(unescape(encodeURIComponent(text)));
    return `data:image/svg+xml;base64,${b64}`;
  } catch {
    return '';
  }
}

function generateFloorSvg(
  floorIdx: number,
  outline: FloorOutline | undefined,
  fixtures: LocationData[],
  fixtureTypeMap: Map<string, string>,
  brandCategoryMapping: Record<string, string>,
  svgDataUris: Map<string, string>
): string {
  // Compute bounds from outline or fixtures
  let minX: number, maxX: number, minY: number, maxY: number;

  if (outline) {
    minX = outline.bounds.minX;
    maxX = outline.bounds.maxX;
    minY = outline.bounds.minY;
    maxY = outline.bounds.maxY;
  } else if (fixtures.length > 0) {
    minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
    for (const loc of fixtures) {
      const ft = fixtureTypeMap.get(loc.blockName) || loc.blockName;
      const [w, h] = getFixtureSize(ft);
      const count = loc.count || 1;
      const cx = loc.posX;
      const cy = -loc.posY;
      minX = Math.min(minX, cx - (w * count) / 2);
      maxX = Math.max(maxX, cx + (w * count) / 2);
      minY = Math.min(minY, cy - h / 2);
      maxY = Math.max(maxY, cy + h / 2);
    }
  } else {
    return `<div style="padding:8px;color:#64748b">No fixture data for Floor ${floorIdx}</div>`;
  }

  const padding = 2;
  const vbMinX = minX - padding;
  const vbMinY = minY - padding;
  const vbW = (maxX - minX) + padding * 2;
  const vbH = (maxY - minY) + padding * 2;

  const strokeW = Math.max(0.02, vbW * 0.001);

  // IMG_SCALE: render <image> at N× world units then scale back so browsers
  // rasterize at sufficient resolution (same technique as FixtureSvgRenderer).
  const IMG_SCALE = 50;
  const invScale = 1 / IMG_SCALE;

  // --- Floor outline ---
  let outlineSvg = '';
  if (outline) {
    const edgePaths = outline.edges
      .map(([[x1, y1], [x2, y2]]) => `M${x1},${y1}L${x2},${y2}`)
      .join('');
    if (edgePaths) {
      outlineSvg += `<path d="${edgePaths}" fill="none" stroke="#334155" stroke-width="${strokeW}" opacity="0.9"/>`;
    }
    for (const col of outline.columns) {
      outlineSvg += `<rect x="${col.cx - col.width / 2}" y="${col.cy - col.depth / 2}" width="${col.width}" height="${col.depth}" fill="#64748b" opacity="0.8" stroke="#334155" stroke-width="${strokeW * 0.7}"/>`;
    }
  }

  // --- Fixtures ---
  let fixturesSvg = '';
  for (const loc of fixtures) {
    const ft = fixtureTypeMap.get(loc.blockName) || loc.blockName;
    const [w, h] = getFixtureSize(ft);
    const halfW = w / 2;
    const halfH = h / 2;
    const count = loc.count || 1;
    const totalWidth = w * count;
    const totalHalfWidth = totalWidth / 2;

    const cx = loc.posX;
    const cy = -loc.posY;
    const rotation = -(loc.rotationZ || 0);
    const [offsetX, offsetY] = getFixtureOffset(ft);
    const color = getBrandCategoryColor(brandCategoryMapping, loc.brand);
    const dataUri = svgDataUris.get(ft) || '';

    const brandLabel = escapeXml(loc.brand || '');
    const idLabel = loc.fixtureId ? escapeXml(loc.fixtureId) : '';

    // Font size: geometric mean of the fixture's total footprint.
    // This keeps labels proportional whether the fixture is a narrow wall-bay
    // strip or a large nested table, without being too small or too large.
    const fontSize = Math.sqrt(totalWidth * h) * 0.18;

    // Render count copies side-by-side (same as FixtureSvgRenderer)
    let copies = '';
    for (let i = 0; i < count; i++) {
      const xOff = -totalHalfWidth + halfW + i * w;
      copies += `
        <g transform="translate(${xOff},0)">
          <rect x="${-halfW}" y="${-halfH}" width="${w}" height="${h}"
                rx="${strokeW * 2}" fill="${color}" opacity="0.7"
                stroke="#1e293b" stroke-width="${strokeW * 0.5}"/>
          ${dataUri
            ? `<g transform="scale(${invScale})">
                 <image href="${dataUri}"
                        x="${-halfW * IMG_SCALE}" y="${-halfH * IMG_SCALE}"
                        width="${w * IMG_SCALE}" height="${h * IMG_SCALE}"
                        preserveAspectRatio="xMidYMid meet"/>
               </g>`
            : ''}
        </g>`;
    }

    // Labels: brand name + fixture ID just below the fixture in local space.
    const labelY1 = halfH + fontSize * 0.95;
    const labelY2 = halfH + fontSize * 2.05;

    fixturesSvg += `
      <g transform="translate(${cx},${cy}) rotate(${rotation}) translate(${offsetX},${offsetY})">
        ${copies}
        <text x="0" y="${labelY1}" text-anchor="middle"
              font-size="${fontSize}" fill="#1e293b"
              font-family="sans-serif" font-weight="700">${brandLabel}</text>
        ${idLabel
          ? `<text x="0" y="${labelY2}" text-anchor="middle"
                  font-size="${fontSize * 0.85}" fill="#475569"
                  font-family="sans-serif">${idLabel}</text>`
          : ''}
      </g>`;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         viewBox="${vbMinX} ${vbMinY} ${vbW} ${vbH}"
         preserveAspectRatio="xMidYMid meet"
         width="100%" height="100%"
         style="display:block;background:#f8fafc;">
      ${outlineSvg}
      ${fixturesSvg}
    </svg>`;
}

function generatePrintableHTML(
  storeName: string,
  storeId: string,
  floorIndices: number[],
  floorSvgs: string[]
): string {
  const floorPages = floorIndices
    .map(
      (floorIdx, i) => `
      <div class="floor-page">
        <div class="floor-title">Floor ${floorIdx}</div>
        <div class="floor-svg-wrap">${floorSvgs[i]}</div>
      </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(storeName || storeId)} — Floor Layout</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #fff; }

    .instructions {
      padding: 10px 14px;
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
      font-size: 13px;
      color: #334155;
    }
    .instructions strong { color: #0f172a; }

    .floor-page {
      width: 100%;
      height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 6mm;
      page-break-after: always;
      break-after: page;
    }
    .floor-page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }

    .floor-title {
      font-size: 15pt;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 4mm;
      flex-shrink: 0;
    }

    .floor-svg-wrap {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .floor-svg-wrap svg {
      width: 100%;
      height: 100%;
    }

    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    @media print {
      .instructions { display: none; }
      .floor-page {
        /* A4 landscape: 297mm wide × 210mm tall; minus 8mm margins each side */
        width: calc(297mm - 16mm);
        height: calc(210mm - 16mm);
        padding: 0;
        page-break-after: always;
        break-after: page;
      }
      .floor-title { margin-bottom: 2mm; font-size: 12pt; }
      .floor-svg-wrap { min-height: 0; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="instructions">
    <strong>${escapeXml(storeName || storeId)}</strong> (${escapeXml(storeId)}) — Floor Layout —
    Open in a browser and print (Ctrl+P / Cmd+P). Select <strong>A4 Landscape</strong> and
    <strong>Save as PDF</strong>.
  </div>
  ${floorPages}
</body>
</html>`;
}

export async function downloadLayoutPdf(options: DownloadLayoutPdfOptions): Promise<void> {
  const {
    locationData,
    floorOutlines,
    floorIndices,
    fixtureTypeMap,
    brandCategoryMapping,
    storeName,
    storeId,
  } = options;

  // Collect all unique fixture types used across all floors
  const usedTypes = new Set<string>();
  for (const loc of locationData) {
    if (!loc.forDelete) {
      usedTypes.add(fixtureTypeMap.get(loc.blockName) || loc.blockName);
    }
  }

  // Fetch all fixture SVGs and embed as data URIs so the offline HTML is self-contained
  const svgDataUris = new Map<string, string>();
  await Promise.all(
    Array.from(usedTypes).map(async (ft) => {
      const path = getFixtureSvgPath(ft);
      const dataUri = await fetchSvgDataUri(path);
      if (dataUri) svgDataUris.set(ft, dataUri);
    })
  );

  const floorSvgs = floorIndices.map((floorIdx) => {
    const outline = floorOutlines[floorIdx];
    const fixtures = locationData.filter(
      (loc) => !loc.forDelete && loc.floorIndex === floorIdx
    );
    return generateFloorSvg(
      floorIdx, outline, fixtures, fixtureTypeMap, brandCategoryMapping, svgDataUris
    );
  });

  const html = generatePrintableHTML(storeName, storeId, floorIndices, floorSvgs);

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${(storeName || storeId).replace(/\s+/g, '_')}_layout.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
