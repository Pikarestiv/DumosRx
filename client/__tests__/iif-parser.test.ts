import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseIIF } from '@/lib/utils/iif-parser';

describe('IIF Parser', () => {
  beforeEach(() => {
    // Mock crypto.randomUUID to return predictable IDs
    let counter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => `test-uuid-${++counter}`
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses empty string correctly', () => {
    const result = parseIIF('');
    expect(result.products).toEqual([]);
    expect(result.customers).toEqual([]);
  });

  it('parses products correctly', () => {
    const iifContent = `
!INVITEM	NAME	DESC	PRICE	QNTY	BARCODE
INVITEM	"Panadol"	"Paracetamol 500mg"	"1000.50"	"50"	"12345"
INVITEM	"Amoxil"	"Amoxicillin 250mg"	"500"	"100"	"67890"
    `;

    const result = parseIIF(iifContent);
    expect(result.customers).toEqual([]);
    expect(result.products).toHaveLength(2);

    expect(result.products[0]).toEqual({
      id: 'qb_test-uuid-1',
      name: 'Panadol',
      generic_name: '',
      strength: '',
      unit_price: 1000.5,
      stock: 50,
      barcode: '12345',
    });

    expect(result.products[1]).toEqual({
      id: 'qb_test-uuid-2',
      name: 'Amoxil',
      generic_name: '',
      strength: '',
      unit_price: 500,
      stock: 100,
      barcode: '67890',
    });
  });

  it('parses customers correctly', () => {
    const iifContent = `
!CUST	NAME	PHONE1	BALANCE
CUST	"John Doe"	"08012345678"	"5000"
CUST	"Jane Smith"	"08087654321"	"0"
    `;

    const result = parseIIF(iifContent);
    expect(result.products).toEqual([]);
    expect(result.customers).toHaveLength(2);

    expect(result.customers[0]).toEqual({
      id: 'qb_test-uuid-1',
      first_name: 'John',
      last_name: 'Doe',
      phone: '08012345678',
      loyalty_points: 0,
      outstanding_balance: 5000,
    });

    expect(result.customers[1]).toEqual({
      id: 'qb_test-uuid-2',
      first_name: 'Jane',
      last_name: 'Smith',
      phone: '08087654321',
      loyalty_points: 0,
      outstanding_balance: 0,
    });
  });

  it('ignores unknown row types and handles mixed data', () => {
    const iifContent = `
!UNKNOWN	COL1
UNKNOWN	VAL1

!INVITEM	NAME	PRICE
INVITEM	"TestItem"	"100"

!CUST	NAME
CUST	"TestCust"
    `;

    const result = parseIIF(iifContent);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe('TestItem');
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].first_name).toBe('TestCust');
  });
});
