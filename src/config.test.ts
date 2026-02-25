import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSnapshotBlocks, scaleTo18, parseEnv, isSameAddress, REWARDS_SOURCES, FACTORIES, CYTOKENS } from './config';
import { VALID_ADDRESS_REGEX } from './constants';

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

  it('should not produce duplicate blocks', () => {
    // Range of exactly 30 — pigeonhole principle means 30 unique blocks
    // are possible but random draws will almost certainly collide.
    const blocks = generateSnapshotBlocks('test-seed', 5000, 5029);
    const unique = new Set(blocks);
    expect(unique.size).toBe(blocks.length);
  });

  it('should error if range is less than 30', () => {
    expect(() => generateSnapshotBlocks('test-seed', 5000, 5028)).toThrow();
  });

  it('should generate blocks within the epoch range', () => {
    const blocks = generateSnapshotBlocks('test-seed', start, end);
    blocks.forEach(block => {
      expect(block).toBeGreaterThanOrEqual(start);
      expect(block).toBeLessThanOrEqual(end);
    });
  });

  it('should handle very large range (production scale)', () => {
    const blocks = generateSnapshotBlocks('cyclo-rewards', 52_974_045, 54_474_045);
    expect(blocks).toHaveLength(30);
    const unique = new Set(blocks);
    expect(unique.size).toBe(30);
    blocks.forEach(block => {
      expect(block).toBeGreaterThanOrEqual(52_974_045);
      expect(block).toBeLessThanOrEqual(54_474_045);
    });
  });

  it('should error on empty seed', () => {
    expect(() => generateSnapshotBlocks('', start, end)).toThrow();
  });
});

describe("RPC_URL", () => {
  it("should export RPC_URL from environment", async () => {
    const { RPC_URL } = await import('./config');
    expect(RPC_URL).toBe(process.env.RPC_URL);
  });

  it("should error if RPC_URL is not set", async () => {
    const original = process.env.RPC_URL;
    delete process.env.RPC_URL;
    try {
      vi.resetModules();
      await expect(import('./config')).rejects.toThrow("RPC_URL environment variable must be set");
    } finally {
      process.env.RPC_URL = original;
    }
  });
});

describe("parseEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.SEED = originalEnv.SEED;
    process.env.START_SNAPSHOT = originalEnv.START_SNAPSHOT;
    process.env.END_SNAPSHOT = originalEnv.END_SNAPSHOT;
  });

  it("should return parsed values when all env vars are set", () => {
    process.env.SEED = "test-seed";
    process.env.START_SNAPSHOT = "1000";
    process.env.END_SNAPSHOT = "2000";
    const result = parseEnv();
    expect(result).toEqual({ seed: "test-seed", startSnapshot: 1000, endSnapshot: 2000 });
  });

  it("should error if SEED is not set", () => {
    delete process.env.SEED;
    process.env.START_SNAPSHOT = "1000";
    process.env.END_SNAPSHOT = "2000";
    expect(() => parseEnv()).toThrow("SEED environment variable must be set");
  });

  it("should error if START_SNAPSHOT is not set", () => {
    process.env.SEED = "test-seed";
    delete process.env.START_SNAPSHOT;
    process.env.END_SNAPSHOT = "2000";
    expect(() => parseEnv()).toThrow("START_SNAPSHOT environment variable must be set");
  });

  it("should error if END_SNAPSHOT is not set", () => {
    process.env.SEED = "test-seed";
    process.env.START_SNAPSHOT = "1000";
    delete process.env.END_SNAPSHOT;
    expect(() => parseEnv()).toThrow("END_SNAPSHOT environment variable must be set");
  });

  it("should error if START_SNAPSHOT is not a valid number", () => {
    process.env.SEED = "test-seed";
    process.env.START_SNAPSHOT = "abc";
    process.env.END_SNAPSHOT = "2000";
    expect(() => parseEnv()).toThrow("START_SNAPSHOT must be a valid number");
  });

  it("should error if END_SNAPSHOT is not a valid number", () => {
    process.env.SEED = "test-seed";
    process.env.START_SNAPSHOT = "1000";
    process.env.END_SNAPSHOT = "abc";
    expect(() => parseEnv()).toThrow("END_SNAPSHOT must be a valid number");
  });
});

describe("isSameAddress", () => {
  it("matches identical addresses", () => {
    expect(isSameAddress("0xabc", "0xabc")).toBe(true);
  });

  it("matches addresses with different casing", () => {
    expect(isSameAddress("0xAbC", "0xabc")).toBe(true);
    expect(isSameAddress("0xABC", "0xabc")).toBe(true);
  });

  it("returns false for different addresses", () => {
    expect(isSameAddress("0xabc", "0xdef")).toBe(false);
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
    expect(result2).toBe(expected2);

    // eq
    const value3 = 123456789n;
    const decimals3 = 18;
    const result3 = scaleTo18(value3, decimals3);
    const expected3 = 123456789n;
    expect(result3).toBe(expected3);
  });

  it("should handle decimals=0", () => {
    expect(scaleTo18(5n, 0)).toBe(5_000_000_000_000_000_000n);
  });

  it("should return 0n for zero value regardless of decimals", () => {
    expect(scaleTo18(0n, 0)).toBe(0n);
    expect(scaleTo18(0n, 6)).toBe(0n);
    expect(scaleTo18(0n, 18)).toBe(0n);
    expect(scaleTo18(0n, 30)).toBe(0n);
  });

  it("should handle decimals=6 (cyFXRP production case)", () => {
    expect(scaleTo18(1_000_000n, 6)).toBe(1_000_000_000_000_000_000n);
  });

  it("should truncate to zero for small values with large decimals", () => {
    expect(scaleTo18(99999n, 23)).toBe(0n);
  });
});

describe("REWARDS_SOURCES", () => {
  it("should have valid hex addresses", () => {
    for (const addr of REWARDS_SOURCES) {
      expect(addr).toMatch(VALID_ADDRESS_REGEX);
    }
  });

  it("should have no duplicates (case-insensitive)", () => {
    const lower = REWARDS_SOURCES.map(a => a.toLowerCase());
    expect(new Set(lower).size).toBe(REWARDS_SOURCES.length);
  });
});

describe("FACTORIES", () => {
  it("should have valid hex addresses", () => {
    for (const addr of FACTORIES) {
      expect(addr).toMatch(VALID_ADDRESS_REGEX);
    }
  });

  it("should have no duplicates (case-insensitive)", () => {
    const lower = FACTORIES.map(a => a.toLowerCase());
    expect(new Set(lower).size).toBe(FACTORIES.length);
  });
});

describe("CYTOKENS", () => {
  it("should have valid hex addresses for all address fields", () => {
    for (const token of CYTOKENS) {
      expect(token.address).toMatch(VALID_ADDRESS_REGEX);
      expect(token.underlyingAddress).toMatch(VALID_ADDRESS_REGEX);
      expect(token.receiptAddress).toMatch(VALID_ADDRESS_REGEX);
    }
  });

  it("should have no duplicate addresses (case-insensitive)", () => {
    const addresses = CYTOKENS.map(t => t.address.toLowerCase());
    expect(new Set(addresses).size).toBe(CYTOKENS.length);
    const underlying = CYTOKENS.map(t => t.underlyingAddress.toLowerCase());
    expect(new Set(underlying).size).toBe(CYTOKENS.length);
    const receipts = CYTOKENS.map(t => t.receiptAddress.toLowerCase());
    expect(new Set(receipts).size).toBe(CYTOKENS.length);
  });

  it("should have non-negative decimals", () => {
    for (const token of CYTOKENS) {
      expect(token.decimals).toBeGreaterThanOrEqual(0);
    }
  });

  it("should have non-empty names", () => {
    for (const token of CYTOKENS) {
      expect(token.name.length).toBeGreaterThan(0);
      expect(token.underlyingSymbol.length).toBeGreaterThan(0);
    }
  });
});

describe("REWARDS_SOURCES and FACTORIES", () => {
  it("should not overlap (case-insensitive)", () => {
    const sources = new Set(REWARDS_SOURCES.map(a => a.toLowerCase()));
    for (const factory of FACTORIES) {
      expect(sources.has(factory.toLowerCase())).toBe(false);
    }
  });
});
