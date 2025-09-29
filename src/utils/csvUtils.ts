export interface StoreData {
  storeCode: string;
  zone: string;
  state: string;
  city: string;
  formatType: string;
  format: string;
  storeName: string;
  sapName: string;
  nocName: string;
}

export async function loadStoreMasterData(): Promise<StoreData[]> {
  try {
    const response = await fetch('/storemaster.csv');
    if (!response.ok) {
      throw new Error(`Failed to fetch storemaster.csv: ${response.statusText}`);
    }

    const csvText = await response.text();
    const lines = csvText.split('\n').filter(line => line.trim());

    // Skip header row
    const dataLines = lines.slice(1);

    const stores: StoreData[] = dataLines.map(line => {
      const columns = parseCSVLine(line);
      return {
        storeCode: columns[0]?.trim() || '',
        zone: columns[1]?.trim() || '',
        state: columns[2]?.trim() || '',
        city: columns[3]?.trim() || '',
        formatType: columns[4]?.trim() || '',
        format: columns[5]?.trim() || '',
        storeName: columns[6]?.trim() || '',
        sapName: columns[7]?.trim() || '',
        nocName: columns[8]?.trim() || ''
      };
    }).filter(store => store.storeCode); // Filter out empty store codes

    return stores;
  } catch (error) {
    console.error('Error loading store master data:', error);
    throw error;
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current);

  return result;
}

export function getUniqueStoreCodes(stores: StoreData[]): string[] {
  const codes = stores.map(store => store.storeCode).filter(Boolean);
  return [...new Set(codes)].sort();
}