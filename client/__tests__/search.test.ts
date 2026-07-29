import { describe, it, expect } from 'vitest';
import { calculateLevenshteinDistance, searchProducts, genericFuzzySearch } from '@/lib/utils/search';

describe('Search Utilities', () => {
  describe('calculateLevenshteinDistance', () => {
    it('calculates distance correctly for identical strings', () => {
      expect(calculateLevenshteinDistance('kitten', 'kitten')).toBe(0);
    });

    it('calculates distance correctly for single edits', () => {
      expect(calculateLevenshteinDistance('kitten', 'sitten')).toBe(1); // substitution
      expect(calculateLevenshteinDistance('kitten', 'kittens')).toBe(1); // insertion
      expect(calculateLevenshteinDistance('kitten', 'kitte')).toBe(1); // deletion
    });

    it('handles completely different strings', () => {
      expect(calculateLevenshteinDistance('abc', 'xyz')).toBe(3);
    });

    it('handles empty strings', () => {
      expect(calculateLevenshteinDistance('', 'abc')).toBe(3);
      expect(calculateLevenshteinDistance('xyz', '')).toBe(3);
      expect(calculateLevenshteinDistance('', '')).toBe(0);
    });
  });

  describe('searchProducts', () => {
    const products = [
      { id: '1', name: 'Paracetamol', generic_name: 'Acetaminophen', barcode: '12345' },
      { id: '2', name: 'Amoxicillin', generic_name: 'Amoxicillin', barcode: '67890' },
      { id: '3', name: 'Ibuprofen', generic_name: 'Ibuprofen', barcode: '11111' },
    ];

    it('returns exact match (Tier 1)', () => {
      const result = searchProducts('Paracetamol', products);
      expect(result.results.length).toBe(1);
      expect(result.results[0].name).toBe('Paracetamol');
      expect(result.isFuzzyFallback).toBe(false);
    });

    it('returns generic name match', () => {
      const result = searchProducts('Acetaminophen', products);
      expect(result.results.length).toBe(1);
      expect(result.results[0].id).toBe('1');
    });

    it('returns prefix match (Tier 2)', () => {
      const result = searchProducts('Amoxi', products);
      expect(result.results.length).toBe(1);
      expect(result.results[0].name).toBe('Amoxicillin');
    });

    it('falls back to fuzzy search for typos', () => {
      // "Paracetemol" (typo) instead of "Paracetamol"
      const result = searchProducts('Paracetemol', products);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].name).toBe('Paracetamol');
      expect(result.isFuzzyFallback).toBe(true);
    });

    it('returns empty array when term does not match and is too short for fuzzy', () => {
      const result = searchProducts('xx', products);
      expect(result.results.length).toBe(0);
    });

    it('returns all products when search term is empty', () => {
      const result = searchProducts('', products);
      expect(result.results.length).toBe(products.length);
    });
  });

  describe('genericFuzzySearch', () => {
    const data = [
      { id: '1', title: 'React Guide', category: 'Frontend' },
      { id: '2', title: 'Vue Tutorial', category: 'Frontend' },
      { id: '3', title: 'Nodejs Handbook', category: 'Backend' },
    ];

    it('finds items based on specified keys', () => {
      const result = genericFuzzySearch('React', data, ['title']);
      expect(result.results.length).toBe(1);
      expect(result.results[0].id).toBe('1');
    });

    it('matches across multiple keys', () => {
      const result = genericFuzzySearch('Frontend', data, ['title', 'category']);
      expect(result.results.length).toBe(2);
    });

    it('performs fuzzy search for typos', () => {
      const result = genericFuzzySearch('Nodejz', data, ['title', 'category']);
      expect(result.results.length).toBe(1);
      expect(result.results[0].title).toBe('Nodejs Handbook');
      expect(result.isFuzzyFallback).toBe(true);
    });
  });
});
