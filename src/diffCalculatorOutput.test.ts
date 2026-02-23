import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { DISTRIBUTED_COUNT } from './diffCalculator';
import { REWARD_POOL } from './constants';

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
  const newRewards = parseCsv('./output/rewards-51504517-52994045.csv');
  const oldRewards = parseCsv('./output/rewards-51504517-52994045-old.csv');
  const covered = parseCsv('./output/rewards-51504517-52994045-remainingCovered.csv');
  const uncovered = parseCsv('./output/rewards-51504517-52994045-remainingUncovered.csv');
  const diff = parseDiffCsv('./output/rewards-51504517-52994045-diff.csv');

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

  it('new rewards total is at most REWARD_POOL (within rounding)', () => {
    const total = newRewards.reduce((sum, r) => sum + r.reward, 0n);
    expect(total).toBeLessThanOrEqual(REWARD_POOL);
    // rounding loss from integer division should be negligible relative to pool
    expect(REWARD_POOL - total).toBeLessThan(REWARD_POOL / 1000000n);
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

  it('diff entries have correct arithmetic and positive diffs', () => {
    for (const entry of diff) {
      expect(entry.diff).toBe(entry.new - entry.old);
      expect(entry.diff).toBeGreaterThan(0n);
    }
  });

  it('covered rewards total <= remaining pool after distributed payments', () => {
    const totalDistributed = oldRewards.slice(0, DISTRIBUTED_COUNT)
      .reduce((sum, r) => sum + r.reward, 0n);
    const remainingPool = REWARD_POOL - totalDistributed;
    const coveredTotal = covered.reduce((sum, r) => sum + r.reward, 0n);
    expect(coveredTotal).toBeLessThanOrEqual(remainingPool);
  });

  it('old distributed total + covered total <= REWARD_POOL', () => {
    const totalDistributed = oldRewards.slice(0, DISTRIBUTED_COUNT)
      .reduce((sum, r) => sum + r.reward, 0n);
    const coveredTotal = covered.reduce((sum, r) => sum + r.reward, 0n);
    expect(totalDistributed + coveredTotal).toBeLessThanOrEqual(REWARD_POOL);
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
