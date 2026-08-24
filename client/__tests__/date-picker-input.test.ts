import { describe, it, expect } from 'vitest';
import { sanitizeDateDigits } from '@/components/ui/date-picker-input';

describe('sanitizeDateDigits', () => {
  it('passes through a fully valid DD/MM/YYYY digit string unchanged', () => {
    expect(sanitizeDateDigits('25122027')).toBe('25122027');
  });

  it('rejects the "11/2027" month/year-only attempt at the first invalid month digit', () => {
    // "11/2027" -> raw digits "112027" -> day "11" is fine, but the next
    // digit ("2") would make the month segment start with 2, which is
    // impossible (no month > 12), so it gets dropped there.
    expect(sanitizeDateDigits('112027')).toBe('11');
  });

  it('rejects a day tens-digit greater than 3', () => {
    expect(sanitizeDateDigits('4')).toBe('');
    expect(sanitizeDateDigits('9122027')).toBe('');
  });

  it('rejects a day exceeding 31', () => {
    expect(sanitizeDateDigits('35')).toBe('3');
    expect(sanitizeDateDigits('39')).toBe('3');
  });

  it('allows day 31', () => {
    expect(sanitizeDateDigits('31')).toBe('31');
  });

  it('rejects day "00"', () => {
    expect(sanitizeDateDigits('00')).toBe('0');
  });

  it('rejects a month tens-digit greater than 1', () => {
    expect(sanitizeDateDigits('012')).toBe('01');
    expect(sanitizeDateDigits('01912027')).toBe('01');
  });

  it('rejects a month exceeding 12', () => {
    expect(sanitizeDateDigits('0113')).toBe('011');
    expect(sanitizeDateDigits('0115')).toBe('011');
  });

  it('allows month 12', () => {
    expect(sanitizeDateDigits('0112')).toBe('0112');
  });

  it('rejects month "00"', () => {
    expect(sanitizeDateDigits('0100')).toBe('010');
  });

  it('places no restrictions on the year segment', () => {
    expect(sanitizeDateDigits('01129999')).toBe('01129999');
    expect(sanitizeDateDigits('01120000')).toBe('01120000');
  });
});
