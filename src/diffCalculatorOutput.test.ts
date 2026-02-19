import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const DISTRIBUTED_COUNT = 101;

function parseCsv(filePath: string): Array<{address: string; reward: bigint}> {
  const data = readFileSync(filePath, 'utf8');
  const lines = data.split('\n').filter(Boolean);
  return lines.slice(1).map(line => {
    const [address, reward] = line.split(',').map(v => v.trim());
    return { address: address.toLowerCase(), reward: BigInt(reward) };
  });
}

describe('diffCalculator output', () => {
  const newRewards = parseCsv('./output/rewards-51504517-52994045.csv');
  const oldRewards = parseCsv('./output/rewards-51504517-52994045-old.csv');
  const covered = parseCsv('./output/rewards-51504517-52994045-remainingCovered.csv');
  const uncovered = parseCsv('./output/rewards-51504517-52994045-remainingUncovered.csv');

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

  it('covered and uncovered have no overlapping addresses', () => {
    const coveredSet = new Set(covered.map(r => r.address));
    const uncoveredSet = new Set(uncovered.map(r => r.address));
    const overlap = [...coveredSet].filter(a => uncoveredSet.has(a));

    expect(overlap).toEqual([]);
  });
});
