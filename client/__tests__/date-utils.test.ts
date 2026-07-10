import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  getExpiryStatus, 
  getDaysToExpiry, 
  formatDateToDDMMYYYY, 
  parseDDMMYYYYToDate 
} from '@/lib/utils/date-utils';

describe('Date Utilities', () => {
  beforeEach(() => {
    // Mock system time so 'now' is predictable
    // Let's set 'now' to 2024-01-01T12:00:00.000Z
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getExpiryStatus', () => {
    it('returns "expired" if date is in the past', () => {
      expect(getExpiryStatus('2023-12-01')).toBe('expired');
    });

    it('returns "expiring_soon" if date is within warning threshold', () => {
      // Default warning is 3 months, so anything before April 2024 is expiring soon
      expect(getExpiryStatus('2024-02-15')).toBe('expiring_soon');
      expect(getExpiryStatus('2024-03-31')).toBe('expiring_soon');
    });

    it('returns "healthy" if date is beyond warning threshold', () => {
      expect(getExpiryStatus('2024-05-01')).toBe('healthy');
      expect(getExpiryStatus('2025-01-01')).toBe('healthy');
    });

    it('respects custom warning months', () => {
      // With 6 months warning, July is 'expiring_soon' instead of 'healthy'
      expect(getExpiryStatus('2024-06-15', 6)).toBe('expiring_soon');
      expect(getExpiryStatus('2024-08-01', 6)).toBe('healthy');
    });
  });

  describe('getDaysToExpiry', () => {
    it('returns positive days for future dates', () => {
      // 2024-01-11 is 10 days after 2024-01-01
      expect(getDaysToExpiry('2024-01-11T12:00:00.000Z')).toBe(10);
    });

    it('returns negative days for past dates', () => {
      // 2023-12-22 is 10 days before 2024-01-01
      expect(getDaysToExpiry('2023-12-22T12:00:00.000Z')).toBe(-10);
    });
  });

  describe('formatDateToDDMMYYYY', () => {
    it('formats a date object correctly', () => {
      const date = new Date(2024, 0, 15); // Jan 15, 2024
      expect(formatDateToDDMMYYYY(date)).toBe('15/01/2024');
    });

    it('formats a date string correctly', () => {
      expect(formatDateToDDMMYYYY('2024-12-05T10:00:00Z')).toBe('05/12/2024');
    });

    it('handles null, undefined, or invalid dates gracefully', () => {
      expect(formatDateToDDMMYYYY(null)).toBe('');
      expect(formatDateToDDMMYYYY(undefined)).toBe('');
      expect(formatDateToDDMMYYYY('invalid-date')).toBe('');
    });
  });

  describe('parseDDMMYYYYToDate', () => {
    it('parses a valid DD/MM/YYYY string to a Date object', () => {
      const result = parseDDMMYYYYToDate('15/01/2024');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth()).toBe(0); // 0-indexed month
      expect(result?.getDate()).toBe(15);
    });

    it('returns null for improperly formatted strings', () => {
      expect(parseDDMMYYYYToDate('15-01-2024')).toBeNull();
      expect(parseDDMMYYYYToDate('2024/01/15')).toBeNull();
      expect(parseDDMMYYYYToDate('1/1/24')).toBeNull();
      expect(parseDDMMYYYYToDate('')).toBeNull();
    });

    it('returns null for invalid dates (like Feb 30)', () => {
      expect(parseDDMMYYYYToDate('30/02/2024')).toBeNull();
    });
  });
});
