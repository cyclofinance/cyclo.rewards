import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { REWARD_POOL, VALID_ADDRESS_REGEX, REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD, EPOCHS, CURRENT_EPOCH } from './constants';
import { REWARDS_SOURCES, FACTORIES, CYTOKENS } from './config';

const epoch = EPOCHS[CURRENT_EPOCH - 1];
const REWARDS_FILE = `./output/rewards-${epoch.startBlock}-${epoch.endBlock}.csv`;
const BALANCES_FILE = `./output/balances-${epoch.startBlock}-${epoch.endBlock}.csv`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function parseCsv(filePath: string): { header: string; entries: Array<{address: string; reward: bigint}> } {
  const data = readFileSync(filePath, 'utf8');
  const lines = data.split('\n').filter(Boolean);
  const header = lines[0];
  const entries = lines.slice(1).map(line => {
    const [address, reward] = line.split(',').map(v => v.trim());
    return { address, reward: BigInt(reward) };
  });
  return { header, entries };
}

function parseBalancesCsv(filePath: string): { header: string; columns: string[]; addresses: string[] } {
  const data = readFileSync(filePath, 'utf8');
  const lines = data.split('\n').filter(Boolean);
  const header = lines[0];
  const columns = header.split(',');
  const addresses = lines.slice(1).map(line => line.split(',')[0]);
  return { header, columns, addresses };
}

describe('current epoch rewards output', () => {
  const { header, entries } = parseCsv(REWARDS_FILE);
  const rewardAddresses = new Set(entries.map(r => r.address));

  it('has correct CSV header', () => {
    expect(header).toBe(`${REWARDS_CSV_COLUMN_HEADER_ADDRESS},${REWARDS_CSV_COLUMN_HEADER_REWARD}`);
  });

  it('has at least one reward entry', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('all rewards are positive', () => {
    const nonPositive = entries.filter(r => r.reward <= 0n);
    expect(nonPositive).toEqual([]);
  });

  it('no negative reward values', () => {
    const negatives = entries.filter(r => r.reward < 0n);
    expect(negatives).toEqual([]);
  });

  it('no individual reward exceeds REWARD_POOL', () => {
    for (const entry of entries) {
      expect(entry.reward).toBeLessThanOrEqual(REWARD_POOL);
    }
  });

  it('no duplicate addresses', () => {
    const addresses = entries.map(r => r.address);
    expect(addresses.length).toBe(new Set(addresses).size);
  });

  it('all addresses are valid format', () => {
    for (const entry of entries) {
      expect(entry.address).toMatch(VALID_ADDRESS_REGEX);
    }
  });

  it('all addresses are lowercase', () => {
    for (const entry of entries) {
      expect(entry.address).toBe(entry.address.toLowerCase());
    }
  });

  it('no zero address in rewards', () => {
    expect(rewardAddresses.has(ZERO_ADDRESS)).toBe(false);
  });

  it('no REWARDS_SOURCE addresses in rewards', () => {
    for (const source of REWARDS_SOURCES) {
      expect(rewardAddresses.has(source.toLowerCase())).toBe(false);
    }
  });

  it('no FACTORY addresses in rewards', () => {
    for (const factory of FACTORIES) {
      expect(rewardAddresses.has(factory.toLowerCase())).toBe(false);
    }
  });

  it('no CYTOKEN addresses in rewards', () => {
    for (const token of CYTOKENS) {
      expect(rewardAddresses.has(token.address.toLowerCase())).toBe(false);
      expect(rewardAddresses.has(token.underlyingAddress.toLowerCase())).toBe(false);
      expect(rewardAddresses.has(token.receiptAddress.toLowerCase())).toBe(false);
    }
  });

  it('total rewards <= REWARD_POOL', () => {
    const total = entries.reduce((sum, r) => sum + r.reward, 0n);
    expect(total).toBeLessThanOrEqual(REWARD_POOL);
  });

  it('total rewards within 0.1% of REWARD_POOL (minimal rounding loss)', () => {
    const total = entries.reduce((sum, r) => sum + r.reward, 0n);
    const diff = REWARD_POOL - total;
    expect(diff).toBeGreaterThanOrEqual(0n);
    expect(diff).toBeLessThan(REWARD_POOL / 1000n);
  });

  it('rewards are sorted descending', () => {
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].reward).toBeLessThanOrEqual(entries[i - 1].reward);
    }
  });
});

describe('current epoch balances output', () => {
  const { columns, addresses } = parseBalancesCsv(BALANCES_FILE);
  const { entries: rewardEntries } = parseCsv(REWARDS_FILE);
  const rewardAddresses = new Set(rewardEntries.map(r => r.address));

  it('has correct number of columns (address + 35 per token + total_rewards)', () => {
    // address + (30 snapshots + average + penalty + bounty + final + rewards) × 3 tokens + total_rewards
    const expected = 1 + (35 * CYTOKENS.length) + 1;
    expect(columns.length).toBe(expected);
  });

  it('first column is address', () => {
    expect(columns[0]).toBe('address');
  });

  it('last column is total_rewards', () => {
    expect(columns[columns.length - 1]).toBe('total_rewards');
  });

  it('has 30 snapshot columns per token', () => {
    for (const token of CYTOKENS) {
      for (let i = 1; i <= 30; i++) {
        expect(columns).toContain(`${token.name}_snapshot${i}`);
      }
    }
  });

  it('has average, penalty, bounty, final, rewards columns per token', () => {
    for (const token of CYTOKENS) {
      expect(columns).toContain(`${token.name}_average`);
      expect(columns).toContain(`${token.name}_penalty`);
      expect(columns).toContain(`${token.name}_bounty`);
      expect(columns).toContain(`${token.name}_final`);
      expect(columns).toContain(`${token.name}_rewards`);
    }
  });

  it('every rewarded address appears in balances', () => {
    const balanceAddresses = new Set(addresses);
    for (const addr of rewardAddresses) {
      expect(balanceAddresses.has(addr)).toBe(true);
    }
  });
});

describe('blocklist vs rewards', () => {
  const blocklistData = readFileSync('./data/blocklist.txt', 'utf8');
  const reports = blocklistData.split('\n').filter(Boolean).map(line => {
    const [reporter, cheater] = line.split(' ');
    return { reporter: reporter.toLowerCase(), cheater: cheater.toLowerCase() };
  });
  const { entries } = parseCsv(REWARDS_FILE);
  const rewardAddresses = new Set(entries.map(r => r.address));

  it('blocklisted cheaters do not receive rewards', () => {
    const cheaters = new Set(reports.map(r => r.cheater));
    for (const cheater of cheaters) {
      expect(rewardAddresses.has(cheater)).toBe(false);
    }
  });

  it('blocklist reporters with rewards have positive bounty (not zero)', () => {
    const reporters = new Set(reports.map(r => r.reporter));
    for (const entry of entries) {
      if (reporters.has(entry.address)) {
        expect(entry.reward).toBeGreaterThan(0n);
      }
    }
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

  it('all blocklist addresses are valid format', () => {
    for (const report of reports) {
      expect(report.reporter).toMatch(VALID_ADDRESS_REGEX);
      expect(report.cheater).toMatch(VALID_ADDRESS_REGEX);
    }
  });

  it('reporter and cheater are never the same address', () => {
    for (const report of reports) {
      expect(report.reporter).not.toBe(report.cheater);
    }
  });
});
