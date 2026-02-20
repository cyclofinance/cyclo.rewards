import { describe, it, expect } from 'vitest';
import { generateSnapshotBlocks, scaleTo18 } from './config';

describe('Test generateSnapshotTimestampForEpoch', () => {
  
  const start = 5000;
  const end = 9000;
  it('should generate correct number of blocks', () => {
    const blocks = generateSnapshotBlocks('test-seed', start, end);
    expect(blocks).toHaveLength(30);
  });

  it('should be deterministic - same seed produces same results', () => {
    const seed = 'deterministic-test';
    const blocks1 = generateSnapshotBlocks(seed, start, end);
    const blocks2 = generateSnapshotBlocks(seed, start, end);
    
    expect(blocks1).toEqual(blocks2);
  });

  it('should produce different results with different seeds', () => {
    const blocks1 = generateSnapshotBlocks('seed1', start, end);
    const blocks2 = generateSnapshotBlocks('seed2', start, end);
    
    expect(blocks1).not.toEqual(blocks2);
  });

  it('should return blocks in ascending order', () => {
    const blocks = generateSnapshotBlocks('test-seed', start, end);
    
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i]).toBeGreaterThan(blocks[i - 1]);
    }
  });

  it('should generate blocks within the epoch range', () => {
    const blocks = generateSnapshotBlocks('test-seed', start, end);    
    blocks.forEach(block => {
      expect(block).toBeGreaterThanOrEqual(start);
      expect(block).toBeLessThanOrEqual(end);
    });
  });
});

describe("Test math functions", () => {
  it("should test scale to 18", async function () {
    // down
    const value1 = 123456789n;
    const decimals1 = 3;
    const result1 = scaleTo18(value1, decimals1);
    const expected1 = 123456789000000000000000n;
    expect(result1).toBe(expected1);

    // up
    const value2 = 123456789n;
    const decimals2 = 23;
    const result2 = scaleTo18(value2, decimals2);
    const expected2 = 1234n;
    expect(result1).toBe(expected2);

    // eq
    const value3 = 123456789n;
    const decimals3 = 18;
    const result3 = scaleTo18(value3, decimals3);
    const expected3 = 123456789n;
    expect(result3).toBe(expected3);
  });
});
