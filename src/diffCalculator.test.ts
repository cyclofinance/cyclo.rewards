import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fakeCsv, mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => {
  const header = 'recipient address,amount wei';
  const fakeRows = Array.from({length: 200}, (_, i) =>
    `0x${i.toString(16).padStart(40, '0')},${i + 1}`
  );
  const fakeCsv = [header, ...fakeRows].join('\n');
  const mockReadFileSync = vi.fn().mockReturnValue(fakeCsv);
  const mockWriteFileSync = vi.fn();
  return { fakeCsv, mockReadFileSync, mockWriteFileSync };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  };
});

import { readCsv, calculateDiff, RewardEntry } from './diffCalculator';
import { REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD, DIFF_CSV_COLUMN_HEADER_OLD, DIFF_CSV_COLUMN_HEADER_NEW, DIFF_CSV_COLUMN_HEADER_DIFF } from './constants';

describe('readCsv', () => {
  beforeEach(() => {
    mockReadFileSync.mockReturnValue(fakeCsv);
  });

  it('should throw on empty file', () => {
    mockReadFileSync.mockReturnValue('');
    expect(() => readCsv('empty.csv')).toThrowError(
      'CSV file is empty: empty.csv'
    );
  });

  it('should throw on header-only file', () => {
    mockReadFileSync.mockReturnValue('recipient address,amount wei\n');
    expect(() => readCsv('header-only.csv')).toThrowError(
      'CSV file has no data rows (only header): header-only.csv'
    );
  });

  it('should throw on line with fewer than 2 columns', () => {
    mockReadFileSync.mockReturnValue(
      'recipient address,amount wei\n0xabc123\n'
    );
    expect(() => readCsv('bad.csv')).toThrowError(
      'CSV line 2 has fewer than 2 columns in bad.csv: "0xabc123"'
    );
  });

  it('should throw on line with more than 2 columns', () => {
    mockReadFileSync.mockReturnValue(
      'recipient address,amount wei\n0xabc123,1000,extra\n'
    );
    expect(() => readCsv('bad.csv')).toThrowError(
      'CSV line 2 has more than 2 columns in bad.csv: "0xabc123,1000,extra"'
    );
  });

  it('should throw on empty address', () => {
    mockReadFileSync.mockReturnValue(
      'recipient address,amount wei\n,1000\n'
    );
    expect(() => readCsv('bad.csv')).toThrowError(
      'CSV line 2 has empty address in bad.csv: ",1000"'
    );
  });

  it('should throw on empty reward', () => {
    mockReadFileSync.mockReturnValue(
      'recipient address,amount wei\n0xabc123,\n'
    );
    expect(() => readCsv('bad.csv')).toThrowError(
      'CSV line 2 has empty reward in bad.csv: "0xabc123,"'
    );
  });

  it('should lowercase addresses', () => {
    mockReadFileSync.mockReturnValue(
      'recipient address,amount wei\n0xAaBbCcDdEeFf,1000\n'
    );
    const result = readCsv('valid.csv');
    expect(result[0].address).toBe('0xaabbccddeeff');
  });

  it('should parse valid CSV', () => {
    mockReadFileSync.mockReturnValue(
      'recipient address,amount wei\n0xABC123,1000\n0xDEF456,2000\n'
    );
    const result = readCsv('valid.csv');
    expect(result).toEqual([
      { address: '0xabc123', reward: 1000n },
      { address: '0xdef456', reward: 2000n },
    ]);
  });
});

describe('calculateDiff', () => {
  // Helper to make reward entries concisely
  const entry = (addr: string, reward: bigint): RewardEntry => ({ address: addr, reward });

  it('should split remaining into covered and uncovered based on budget', () => {
    // Pool is 100, old distributed 40 to 2 accounts, leaving 60 remaining
    const newRewards = [
      entry('0xold1', 20n),
      entry('0xold2', 20n),
      entry('0xnew1', 30n),
      entry('0xnew2', 25n),
      entry('0xnew3', 10n),
    ];
    const oldRewards = [
      entry('0xold1', 20n),
      entry('0xold2', 20n),
    ];

    const result = calculateDiff(newRewards, oldRewards, 2, 100n);

    expect(result.totalAlreadyPaid).toBe(40n);
    expect(result.remainingRewards).toBe(60n);
    // 0xnew1 (30) fits, 0xnew2 (25) fits (30+25=55), 0xnew3 (10) exceeds (55+10=65 > 60)
    expect(result.covered).toEqual([
      entry('0xnew1', 30n),
      entry('0xnew2', 25n),
    ]);
    expect(result.uncovered).toEqual([
      entry('0xnew3', 10n),
    ]);
    expect(result.totalNewDistribution).toBe(55n);
    expect(result.remainingRewardsDiff).toBe(5n);
    expect(result.totalRemainingUncovered).toBe(10n);
  });

  it('should identify underpaid accounts', () => {
    // Old account received 10 but new calculation says they deserve 25
    const newRewards = [
      entry('0xold1', 25n),
      entry('0xnew1', 50n),
    ];
    const oldRewards = [
      entry('0xold1', 10n),
    ];

    const result = calculateDiff(newRewards, oldRewards, 1, 100n);

    expect(result.underpaid).toEqual([{
      address: '0xold1',
      old: 10n,
      new: 25n,
      diff: 15n,
    }]);
    expect(result.totalUnderpaid).toBe(15n);
  });

  it('should not flag accounts that received more than or equal to new calculation', () => {
    const newRewards = [
      entry('0xold1', 10n),  // received exact amount
      entry('0xold2', 5n),   // received more than new calc
    ];
    const oldRewards = [
      entry('0xold1', 10n),
      entry('0xold2', 20n),
    ];

    const result = calculateDiff(newRewards, oldRewards, 2, 100n);

    expect(result.underpaid).toEqual([]);
    expect(result.totalUnderpaid).toBe(0n);
  });

  it('should remove distributed accounts from remaining', () => {
    const newRewards = [
      entry('0xold1', 10n),
      entry('0xnew1', 20n),
    ];
    const oldRewards = [
      entry('0xold1', 10n),
    ];

    const result = calculateDiff(newRewards, oldRewards, 1, 100n);

    // Only 0xnew1 should be in covered/uncovered, not 0xold1
    const allRemaining = [...result.covered, ...result.uncovered];
    expect(allRemaining.map(e => e.address)).toEqual(['0xnew1']);
  });

  it('should handle old account not found in new rewards', () => {
    const newRewards = [
      entry('0xnew1', 20n),
    ];
    const oldRewards = [
      entry('0xold1', 10n),  // not in newRewards
    ];

    const result = calculateDiff(newRewards, oldRewards, 1, 100n);

    // old1 is still counted in totalAlreadyPaid
    expect(result.totalAlreadyPaid).toBe(10n);
    expect(result.remainingRewards).toBe(90n);
    // new1 was never removed from remaining
    expect(result.covered).toEqual([entry('0xnew1', 20n)]);
    expect(result.underpaid).toEqual([]);
  });

  it('should handle zero distributed count', () => {
    const newRewards = [
      entry('0xnew1', 30n),
      entry('0xnew2', 20n),
    ];

    const result = calculateDiff(newRewards, [], 0, 100n);

    expect(result.totalAlreadyPaid).toBe(0n);
    expect(result.remainingRewards).toBe(100n);
    expect(result.covered).toEqual([entry('0xnew1', 30n), entry('0xnew2', 20n)]);
    expect(result.uncovered).toEqual([]);
    expect(result.underpaid).toEqual([]);
  });

  it('should handle all accounts fitting in budget exactly', () => {
    const newRewards = [
      entry('0xnew1', 50n),
      entry('0xnew2', 50n),
    ];

    const result = calculateDiff(newRewards, [], 0, 100n);

    expect(result.covered).toEqual([entry('0xnew1', 50n), entry('0xnew2', 50n)]);
    expect(result.uncovered).toEqual([]);
    expect(result.remainingRewardsDiff).toBe(0n);
  });

  it('should handle empty new rewards', () => {
    const result = calculateDiff([], [], 0, 100n);

    expect(result.covered).toEqual([]);
    expect(result.uncovered).toEqual([]);
    expect(result.underpaid).toEqual([]);
    expect(result.remainingRewards).toBe(100n);
    expect(result.remainingRewardsDiff).toBe(100n);
  });

  it('should not mutate input arrays', () => {
    const newRewards = [
      entry('0xold1', 10n),
      entry('0xnew1', 20n),
    ];
    const oldRewards = [
      entry('0xold1', 10n),
    ];
    const newRewardsCopy = structuredClone(newRewards);
    const oldRewardsCopy = structuredClone(oldRewards);

    calculateDiff(newRewards, oldRewards, 1, 100n);

    expect(newRewards).toEqual(newRewardsCopy);
    expect(oldRewards).toEqual(oldRewardsCopy);
  });

  it('covered + uncovered rewards should equal total remaining undistributed', () => {
    const newRewards = [
      entry('0xold1', 15n),
      entry('0xold2', 25n),
      entry('0xnew1', 30n),
      entry('0xnew2', 40n),
      entry('0xnew3', 50n),
    ];
    const oldRewards = [
      entry('0xold1', 10n),
      entry('0xold2', 20n),
    ];

    const result = calculateDiff(newRewards, oldRewards, 2, 200n);

    const coveredTotal = result.covered.reduce((s, e) => s + e.reward, 0n);
    const uncoveredTotal = result.uncovered.reduce((s, e) => s + e.reward, 0n);
    // The remaining undistributed accounts are those NOT in oldRewards
    const remainingTotal = newRewards
      .filter(n => !oldRewards.some(o => o.address === n.address))
      .reduce((s, e) => s + e.reward, 0n);

    expect(coveredTotal + uncoveredTotal).toBe(remainingTotal);
  });

  it('totalNewDistribution + remainingRewardsDiff should equal remainingRewards', () => {
    const newRewards = [
      entry('0xold1', 15n),
      entry('0xnew1', 30n),
      entry('0xnew2', 40n),
      entry('0xnew3', 50n),
    ];
    const oldRewards = [
      entry('0xold1', 10n),
    ];

    const result = calculateDiff(newRewards, oldRewards, 1, 100n);

    expect(result.totalNewDistribution + result.remainingRewardsDiff).toBe(result.remainingRewards);
  });

  it('should handle greedy ordering — large account first exhausts budget', () => {
    // Budget is 50, but a 45n account comes first, leaving only 5n for the rest
    const newRewards = [
      entry('0xbig', 45n),
      entry('0xsmall', 10n),
    ];

    const result = calculateDiff(newRewards, [], 0, 50n);

    // 0xbig (45) fits, remaining budget = 5, 0xsmall (10) does NOT fit
    expect(result.covered).toEqual([entry('0xbig', 45n)]);
    expect(result.uncovered).toEqual([entry('0xsmall', 10n)]);
  });

  it('should throw when distributedCount exceeds oldRewards length', () => {
    const newRewards = [entry('0xnew1', 10n)];
    const oldRewards = [entry('0xold1', 5n)];

    // distributedCount is 3 but oldRewards only has 1 entry
    expect(() => calculateDiff(newRewards, oldRewards, 3, 100n)).toThrow();
  });
});

describe('main() CSV output', () => {
  // main() runs on import with mockReadFileSync returning 200 identical rows
  // for both old and new rewards. DISTRIBUTED_COUNT=101, so first 101 are
  // "already distributed" and the remaining 99 are new.
  // Since old and new are identical, no accounts are underpaid (all diffs <= 0).

  const rewardsHeader = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;
  const diffHeader = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + DIFF_CSV_COLUMN_HEADER_OLD + "," + DIFF_CSV_COLUMN_HEADER_NEW + "," + DIFF_CSV_COLUMN_HEADER_DIFF;

  it('should write three CSV files', () => {
    expect(mockWriteFileSync).toHaveBeenCalledTimes(3);
  });

  it('should write remainingCovered CSV with correct header and format', () => {
    const [path, content] = mockWriteFileSync.mock.calls[0];
    expect(path).toBe('output/rewards-51504517-52994045-remainingCovered.csv');
    const lines = content.split('\n');
    expect(lines[0]).toBe(rewardsHeader);
    // With identical old/new and huge reward pool, all 99 remaining should be covered
    expect(lines.length).toBe(100); // header + 99 data rows
    // Verify format of a data line
    expect(lines[1]).toMatch(/^0x[0-9a-f]+,\d+$/);
  });

  it('should write remainingUncovered CSV with header only', () => {
    const [path, content] = mockWriteFileSync.mock.calls[1];
    expect(path).toBe('output/rewards-51504517-52994045-remainingUncovered.csv');
    const lines = content.split('\n');
    expect(lines[0]).toBe(rewardsHeader);
    // No uncovered accounts since reward pool is massive
    expect(lines.length).toBe(1);
  });

  it('should write diff CSV with header only when old and new are identical', () => {
    const [path, content] = mockWriteFileSync.mock.calls[2];
    expect(path).toBe('output/rewards-51504517-52994045-diff.csv');
    const lines = content.split('\n');
    expect(lines[0]).toBe(diffHeader);
    // No underpaid accounts since old and new rewards are identical
    expect(lines.length).toBe(1);
  });

  it('should only include non-distributed addresses in covered CSV', () => {
    const [, content] = mockWriteFileSync.mock.calls[0];
    const dataLines = content.split('\n').slice(1);
    const addresses = dataLines.map((l: string) => l.split(',')[0]);

    // The mock generates addresses 0x00...00 through 0x00...c7 (0-199)
    // First 101 (0-100) are "distributed", remaining 99 (101-199) are new
    for (let i = 0; i < 101; i++) {
      const distributed = `0x${i.toString(16).padStart(40, '0')}`;
      expect(addresses).not.toContain(distributed);
    }
  });
});
