import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { DISTRIBUTED_COUNT } from './diffCalculator';
import { DEC25_REWARD_POOL } from './constants';

function parseCsv(filePath: string): Array<{address: string; reward: bigint}> {
  const data = readFileSync(filePath, 'utf8');
  const lines = data.split('\n').filter(Boolean);
  return lines.slice(1).map(line => {
    const [address, reward] = line.split(',').map(v => v.trim());
    return { address: address.toLowerCase(), reward: BigInt(reward) };
  });
}

function parseDiffCsv(filePath: string): Array<{address: string; old: bigint; new: bigint; diff: bigint}> {
  const data = readFileSync(filePath, 'utf8');
  const lines = data.split('\n').filter(Boolean);
  return lines.slice(1).map(line => {
    const [address, old, newVal, diff] = line.split(',').map(v => v.trim());
    return { address: address.toLowerCase(), old: BigInt(old), new: BigInt(newVal), diff: BigInt(diff) };
  });
}

describe('diffCalculator output', () => {
  const newRewards = parseCsv('./output/dispersed/rewards-51504517-52994045.csv');
  const oldRewards = parseCsv('./output/dispersed/rewards-51504517-52994045-old.csv');
  const covered = parseCsv('./output/dispersed/rewards-51504517-52994045-remainingCovered.csv');
  const uncovered = parseCsv('./output/dispersed/rewards-51504517-52994045-remainingUncovered.csv');
  const diff = parseDiffCsv('./output/dispersed/rewards-51504517-52994045-diff.csv');

  const distributedAddresses = new Set(
    oldRewards.slice(0, DISTRIBUTED_COUNT).map(r => r.address)
  );
  const remaining = newRewards.filter(r => !distributedAddresses.has(r.address));

  it('covered + uncovered addresses = remaining undistributed addresses', () => {
    const combinedAddresses = [...covered, ...uncovered]
      .map(r => r.address).sort();
    const remainingAddresses = remaining
      .map(r => r.address).sort();

    expect(combinedAddresses).toEqual(remainingAddresses);
  });

  it('covered + uncovered rewards = remaining undistributed rewards', () => {
    const combinedTotal = [...covered, ...uncovered]
      .reduce((sum, r) => sum + r.reward, 0n);
    const remainingTotal = remaining
      .reduce((sum, r) => sum + r.reward, 0n);

    expect(combinedTotal).toEqual(remainingTotal);
  });

  it('new rewards has no negative values', () => {
    const negatives = newRewards.filter(r => r.reward < 0n);
    expect(negatives).toEqual([]);
  });

  it('new rewards total is at most DEC25_REWARD_POOL (within rounding)', () => {
    const total = newRewards.reduce((sum, r) => sum + r.reward, 0n);
    expect(total).toBeLessThanOrEqual(DEC25_REWARD_POOL);
    // rounding loss from integer division should be negligible relative to pool
    expect(DEC25_REWARD_POOL - total).toBeLessThan(DEC25_REWARD_POOL / 1000000n);
  });

  it('all new rewards are positive', () => {
    const nonPositive = newRewards.filter(r => r.reward <= 0n);
    expect(nonPositive).toEqual([]);
  });

  it('no duplicate addresses in new rewards', () => {
    const addresses = newRewards.map(r => r.address);
    expect(addresses.length).toBe(new Set(addresses).size);
  });

  it('no duplicate addresses in old rewards', () => {
    const addresses = oldRewards.map(r => r.address);
    expect(addresses.length).toBe(new Set(addresses).size);
  });

  it('no duplicate addresses in covered', () => {
    const addresses = covered.map(r => r.address);
    expect(addresses.length).toBe(new Set(addresses).size);
  });

  it('no duplicate addresses in uncovered', () => {
    const addresses = uncovered.map(r => r.address);
    expect(addresses.length).toBe(new Set(addresses).size);
  });

  it('every underpaid address exists in both old distributed and new rewards', () => {
    const newAddresses = new Set(newRewards.map(r => r.address));
    for (const entry of diff) {
      expect(distributedAddresses.has(entry.address)).toBe(true);
      expect(newAddresses.has(entry.address)).toBe(true);
    }
  });

  it('diff old values match actual old rewards', () => {
    const oldMap = new Map(oldRewards.map(r => [r.address, r.reward]));
    for (const entry of diff) {
      expect(entry.old).toBe(oldMap.get(entry.address));
    }
  });

  it('diff new values match actual new rewards', () => {
    const newMap = new Map(newRewards.map(r => [r.address, r.reward]));
    for (const entry of diff) {
      expect(entry.new).toBe(newMap.get(entry.address));
    }
  });

  it('no duplicate addresses in diff', () => {
    const addresses = diff.map(r => r.address);
    expect(addresses.length).toBe(new Set(addresses).size);
  });

  it('underpaid addresses are not in covered or uncovered', () => {
    const coveredSet = new Set(covered.map(r => r.address));
    const uncoveredSet = new Set(uncovered.map(r => r.address));
    for (const entry of diff) {
      expect(coveredSet.has(entry.address)).toBe(false);
      expect(uncoveredSet.has(entry.address)).toBe(false);
    }
  });

  it('diff entries have correct arithmetic and positive diffs', () => {
    for (const entry of diff) {
      expect(entry.diff).toBe(entry.new - entry.old);
      expect(entry.diff).toBeGreaterThan(0n);
    }
  });

  it('covered rewards total <= remaining pool after distributed payments', () => {
    const totalDistributed = oldRewards.slice(0, DISTRIBUTED_COUNT)
      .reduce((sum, r) => sum + r.reward, 0n);
    const remainingPool = DEC25_REWARD_POOL - totalDistributed;
    const coveredTotal = covered.reduce((sum, r) => sum + r.reward, 0n);
    expect(coveredTotal).toBeLessThanOrEqual(remainingPool);
  });

  it('old distributed total + covered total <= DEC25_REWARD_POOL', () => {
    const totalDistributed = oldRewards.slice(0, DISTRIBUTED_COUNT)
      .reduce((sum, r) => sum + r.reward, 0n);
    const coveredTotal = covered.reduce((sum, r) => sum + r.reward, 0n);
    expect(totalDistributed + coveredTotal).toBeLessThanOrEqual(DEC25_REWARD_POOL);
  });

  it('all covered rewards are positive', () => {
    const nonPositive = covered.filter(r => r.reward <= 0n);
    expect(nonPositive).toEqual([]);
  });

  it('all uncovered rewards are positive', () => {
    const nonPositive = uncovered.filter(r => r.reward <= 0n);
    expect(nonPositive).toEqual([]);
  });

  it('old rewards has at least DISTRIBUTED_COUNT entries', () => {
    expect(oldRewards.length).toBeGreaterThanOrEqual(DISTRIBUTED_COUNT);
  });

  it('all old distributed rewards are positive', () => {
    const distributed = oldRewards.slice(0, DISTRIBUTED_COUNT);
    const nonPositive = distributed.filter(r => r.reward <= 0n);
    expect(nonPositive).toEqual([]);
  });

  it('covered and uncovered have no overlapping addresses', () => {
    const coveredSet = new Set(covered.map(r => r.address));
    const uncoveredSet = new Set(uncovered.map(r => r.address));
    const overlap = [...coveredSet].filter(a => uncoveredSet.has(a));

    expect(overlap).toEqual([]);
  });
});

describe('on-chain distribution verification', () => {
  const onchain = parseCsv('./output/dispersed/dec-2025-distributed.csv');
  const oldRewards = parseCsv('./output/dispersed/rewards-51504517-52994045-old.csv');
  const covered = parseCsv('./output/dispersed/rewards-51504517-52994045-remainingCovered.csv');

  it('on-chain distributed exactly DISTRIBUTED_COUNT addresses', () => {
    expect(onchain.length).toBe(DISTRIBUTED_COUNT);
  });

  it('on-chain addresses match first DISTRIBUTED_COUNT of old rewards', () => {
    const oldDistributed = oldRewards.slice(0, DISTRIBUTED_COUNT);
    const onchainAddresses = onchain.map(r => r.address).sort();
    const oldAddresses = oldDistributed.map(r => r.address).sort();
    expect(onchainAddresses).toEqual(oldAddresses);
  });

  it('on-chain amounts match first DISTRIBUTED_COUNT of old rewards', () => {
    const oldMap = new Map(oldRewards.slice(0, DISTRIBUTED_COUNT).map(r => [r.address, r.reward]));
    for (const entry of onchain) {
      expect(entry.reward).toBe(oldMap.get(entry.address));
    }
  });

  it('on-chain addresses do not overlap with covered', () => {
    const onchainSet = new Set(onchain.map(r => r.address));
    const coveredSet = new Set(covered.map(r => r.address));
    const overlap = [...onchainSet].filter(a => coveredSet.has(a));
    expect(overlap).toEqual([]);
  });
});

describe('blocklist integrity', () => {
  const blocklistData = readFileSync('./data/blocklist.txt', 'utf8');
  const reports = blocklistData.split('\n').filter(Boolean).map(line => {
    const [reporter, cheater] = line.split(' ');
    return { reporter: reporter.toLowerCase(), cheater: cheater.toLowerCase() };
  });

  it('no duplicate cheater addresses in blocklist', () => {
    const cheaters = reports.map(r => r.cheater);
    expect(cheaters.length).toBe(new Set(cheaters).size);
  });
});
