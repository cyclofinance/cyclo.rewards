import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSnapshotBlocks, scaleTo18, parseEnv, isSameAddress, REWARDS_SOURCES, FACTORIES, CYTOKENS } from './config';
import { VALID_ADDRESS_REGEX, EPOCHS, CURRENT_EPOCH, SNAPSHOT_COUNT } from './constants';

describe('generateSnapshotBlocks', () => {
  
  const start = 5000;
  const end = 9000;
  it('should generate correct number of blocks', () => {
    const blocks = generateSnapshotBlocks('test-seed', start, end);
    expect(blocks).toHaveLength(SNAPSHOT_COUNT);
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
    // Range of exactly SNAPSHOT_COUNT — pigeonhole principle means SNAPSHOT_COUNT unique blocks
    // are possible but random draws will almost certainly collide.
    const blocks = generateSnapshotBlocks('test-seed', 5000, 5000 + SNAPSHOT_COUNT - 1);
    const unique = new Set(blocks);
    expect(unique.size).toBe(blocks.length);
  });

  it(`should error if range is less than ${SNAPSHOT_COUNT}`, () => {
    expect(() => generateSnapshotBlocks('test-seed', 5000, 5000 + SNAPSHOT_COUNT - 2)).toThrow();
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
    expect(blocks).toHaveLength(SNAPSHOT_COUNT);
    const unique = new Set(blocks);
    expect(unique.size).toBe(SNAPSHOT_COUNT);
    blocks.forEach(block => {
      expect(block).toBeGreaterThanOrEqual(52_974_045);
      expect(block).toBeLessThanOrEqual(54_474_045);
    });
  });

  it('should error on empty seed', () => {
    expect(() => generateSnapshotBlocks('', start, end)).toThrow();
  });

  it('should reject non-integer start', () => {
    expect(() => generateSnapshotBlocks('test-seed', 5000.5, 9000)).toThrow();
  });

  it('should reject non-integer end', () => {
    expect(() => generateSnapshotBlocks('test-seed', 5000, 9000.5)).toThrow();
  });

  it('should reject NaN start', () => {
    expect(() => generateSnapshotBlocks('test-seed', NaN, 9000)).toThrow();
  });

  it('should reject negative start', () => {
    expect(() => generateSnapshotBlocks('test-seed', -1, 9000)).toThrow();
  });

  it(`should terminate quickly with minimum range of exactly ${SNAPSHOT_COUNT}`, () => {
    const start = Date.now();
    const blocks = generateSnapshotBlocks('test-seed', 100, 100 + SNAPSHOT_COUNT - 1);
    const elapsed = Date.now() - start;
    expect(blocks).toHaveLength(SNAPSHOT_COUNT);
    // Must contain every value in [100, 100 + SNAPSHOT_COUNT - 1]
    expect(new Set(blocks).size).toBe(SNAPSHOT_COUNT);
    for (let i = 100; i <= 100 + SNAPSHOT_COUNT - 1; i++) {
      expect(blocks).toContain(i);
    }
    // Should complete in well under 1 second (shuffle is O(n))
    expect(elapsed).toBeLessThan(1000);
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
  it("should return seed and block range from CURRENT_EPOCH", () => {
    const epoch = EPOCHS[CURRENT_EPOCH - 1];
    const result = parseEnv();
    expect(result.seed).toBe(epoch.seed);
    expect(result.startSnapshot).toBe(epoch.startBlock);
    expect(result.endSnapshot).toBe(epoch.endBlock);
  });
});

describe("isSameAddress", () => {
  const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ADDR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  it("matches identical addresses", () => {
    expect(isSameAddress(ADDR_A, ADDR_A)).toBe(true);
  });

  it("matches addresses with different casing", () => {
    expect(isSameAddress("0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa", ADDR_A)).toBe(true);
  });

  it("returns false for different addresses", () => {
    expect(isSameAddress(ADDR_A, ADDR_B)).toBe(false);
  });

  it("should throw on invalid first address", () => {
    expect(() => isSameAddress("not-an-address", ADDR_A)).toThrow();
  });

  it("should throw on invalid second address", () => {
    expect(() => isSameAddress(ADDR_A, "0xshort")).toThrow();
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

  it("should throw on negative decimals", () => {
    expect(() => scaleTo18(100n, -1)).toThrow("decimals");
  });

  it("should throw on NaN decimals", () => {
    expect(() => scaleTo18(100n, NaN)).toThrow("decimals");
  });

  it("should throw on non-integer decimals", () => {
    expect(() => scaleTo18(100n, 1.5)).toThrow("decimals");
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

  it("should all be lowercase", () => {
    for (const addr of REWARDS_SOURCES) {
      expect(addr).toBe(addr.toLowerCase());
    }
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

  it("should all be lowercase", () => {
    for (const addr of FACTORIES) {
      expect(addr).toBe(addr.toLowerCase());
    }
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

  it("should have all addresses lowercase", () => {
    for (const token of CYTOKENS) {
      expect(token.address).toBe(token.address.toLowerCase());
      expect(token.underlyingAddress).toBe(token.underlyingAddress.toLowerCase());
      expect(token.receiptAddress).toBe(token.receiptAddress.toLowerCase());
    }
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
