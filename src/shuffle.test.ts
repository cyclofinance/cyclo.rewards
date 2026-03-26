import { describe, it, expect } from 'vitest';
import { shuffle } from './shuffle';
import seedrandom from 'seedrandom';

describe('shuffle', () => {
  it('should return a new array with the same elements', () => {
    const rng = seedrandom('test');
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input, rng);
    expect(result).toHaveLength(input.length);
    expect(result.sort()).toEqual(input.sort());
  });

  it('should not mutate the input array', () => {
    const rng = seedrandom('test');
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input, rng);
    expect(input).toEqual(copy);
  });

  it('should be deterministic with the same seed', () => {
    const a = shuffle([1, 2, 3, 4, 5], seedrandom('fixed'));
    const b = shuffle([1, 2, 3, 4, 5], seedrandom('fixed'));
    expect(a).toEqual(b);
  });

  it('should produce different results with different seeds', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], seedrandom('seed-a'));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], seedrandom('seed-b'));
    expect(a).not.toEqual(b);
  });

  it('should handle empty array', () => {
    const rng = seedrandom('test');
    expect(shuffle([], rng)).toEqual([]);
  });

  it('should handle single-element array', () => {
    const rng = seedrandom('test');
    expect(shuffle([42], rng)).toEqual([42]);
  });

  it('should handle two-element array', () => {
    const rng = seedrandom('test');
    const result = shuffle([1, 2], rng);
    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual([1, 2]);
  });

  it('should produce approximately uniform distribution', () => {
    const input = [1, 2, 3, 4, 5];
    const positionCounts: number[][] = input.map(() => new Array(input.length).fill(0));
    const iterations = 50000;

    for (let i = 0; i < iterations; i++) {
      const rng = seedrandom(`run-${i}`);
      const result = shuffle(input, rng);
      for (let pos = 0; pos < result.length; pos++) {
        positionCounts[result[pos] - 1][pos]++;
      }
    }

    const expected = iterations / input.length;
    for (let val = 0; val < input.length; val++) {
      for (let pos = 0; pos < input.length; pos++) {
        const ratio = positionCounts[val][pos] / expected;
        // Each value should appear at each position ~20% of the time
        // Allow 5% tolerance
        expect(ratio).toBeGreaterThan(0.95);
        expect(ratio).toBeLessThan(1.05);
      }
    }
  });

  it('should preserve duplicate values', () => {
    const rng = seedrandom('test');
    const input = [1, 1, 2, 2, 3];
    const result = shuffle(input, rng);
    expect(result.sort()).toEqual([1, 1, 2, 2, 3]);
  });
});
