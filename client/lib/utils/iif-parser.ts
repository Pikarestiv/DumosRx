export interface ParsedIIF {
  products: any[];
  customers: any[];
}

export function parseIIF(fileContent: string): ParsedIIF {
  const lines = fileContent.split('\n').map(l => l.trim()).filter(Boolean);
  
  const products = [];
  const customers = [];

  let currentMode = '';
  let headers: string[] = [];

  for (const line of lines) {
    const columns = line.split('\t').map(c => c.replace(/^"|"$/g, '')); // Handle basic quotes if any

    const rowType = columns[0];

    // Header rows start with !
    if (rowType === '!INVITEM') {
      currentMode = 'INVITEM';
      headers = columns.slice(1);
    } else if (rowType === '!CUST') {
      currentMode = 'CUST';
      headers = columns.slice(1);
    } 
    // Data rows
    else if (rowType === 'INVITEM' && currentMode === 'INVITEM') {
      const data = columns.slice(1);
      const rowData: Record<string, string> = {};
      
      headers.forEach((h, i) => {
        if (h && data[i] !== undefined) {
          rowData[h] = data[i];
        }
      });

      // Quickbooks basic mapping for items
      const name = rowData['NAME'] || rowData['DESC'] || 'Unknown Item';
      const price = parseFloat(rowData['PRICE'] || rowData['SALESPRICE'] || '0');
      const stock = parseInt(rowData['QNTY'] || '0', 10);
      const barcode = rowData['BARCODE'] || rowData['ALUP'] || rowData['UPC'] || '';

      if (name !== 'Unknown Item') {
        products.push({
          id: `qb_${crypto.randomUUID()}`,
          name,
          generic_name: '',
          brand: '',
          strength: '',
          unit_price: isNaN(price) ? 0 : price,
          stock: isNaN(stock) ? 0 : stock,
          barcode,
        });
      }
    }
    else if (rowType === 'CUST' && currentMode === 'CUST') {
      const data = columns.slice(1);
      const rowData: Record<string, string> = {};
      
      headers.forEach((h, i) => {
        if (h && data[i] !== undefined) {
          rowData[h] = data[i];
        }
      });

      const name = rowData['NAME'] || '';
      const phone = rowData['PHONE1'] || rowData['PHONE2'] || '';
      
      if (name) {
        // Attempt to split name into first and last
        const nameParts = name.split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || '';

        customers.push({
          id: `qb_${crypto.randomUUID()}`,
          first_name: firstName,
          last_name: lastName,
          phone,
          loyalty_points: 0,
          outstanding_balance: parseFloat(rowData['BALANCE'] || '0') || 0,
        });
      }
    }
  }

  return { products, customers };
}
