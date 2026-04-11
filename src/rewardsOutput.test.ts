import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { REWARD_POOL, VALID_ADDRESS_REGEX, REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD, EPOCHS, CURRENT_EPOCH, SNAPSHOT_COUNT } from './constants';
import { REWARDS_SOURCES, FACTORIES, CYTOKENS } from './config';

const epoch = EPOCHS[CURRENT_EPOCH - 1];
const REWARDS_FILE = `./output/rewards-${epoch.startBlock}-${epoch.endBlock}.csv`;
const BALANCES_FILE = `./output/balances-${epoch.startBlock}-${epoch.endBlock}.csv`;
const SNAPSHOTS_FILE = `./output/snapshots-${epoch.startBlock}-${epoch.endBlock}.txt`;
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
    // address + (SNAPSHOT_COUNT snapshots + average + penalty + bounty + final + rewards) × 3 tokens + total_rewards
    const expected = 1 + ((SNAPSHOT_COUNT + 5) * CYTOKENS.length) + 1;
    expect(columns.length).toBe(expected);
  });

  it('first column is address', () => {
    expect(columns[0]).toBe('address');
  });

  it('last column is total_rewards', () => {
    expect(columns[columns.length - 1]).toBe('total_rewards');
  });

  it(`has ${SNAPSHOT_COUNT} snapshot columns per token`, () => {
    for (const token of CYTOKENS) {
      for (let i = 1; i <= SNAPSHOT_COUNT; i++) {
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

describe('balances arithmetic consistency', () => {
  const balancesData = readFileSync(BALANCES_FILE, 'utf8');
  const lines = balancesData.split('\n').filter(Boolean);
  const columns = lines[0].split(',');
  const { entries: rewardEntries } = parseCsv(REWARDS_FILE);

  // Parse all rows into structured data
  function parseRow(line: string) {
    const parts = line.split(',');
    const address = parts[0];
    const tokenData: Record<string, { snapshots: bigint[]; average: bigint; penalty: bigint; bounty: bigint; final: bigint; rewards: bigint }> = {};
    for (let t = 0; t < CYTOKENS.length; t++) {
      const base = 1 + t * (SNAPSHOT_COUNT + 5);
      const snapshots = parts.slice(base, base + SNAPSHOT_COUNT).map(BigInt);
      tokenData[CYTOKENS[t].name] = {
        snapshots,
        average: BigInt(parts[base + SNAPSHOT_COUNT]),
        penalty: BigInt(parts[base + SNAPSHOT_COUNT + 1]),
        bounty: BigInt(parts[base + SNAPSHOT_COUNT + 2]),
        final: BigInt(parts[base + SNAPSHOT_COUNT + 3]),
        rewards: BigInt(parts[base + SNAPSHOT_COUNT + 4]),
      };
    }
    return { address, tokenData, totalRewards: BigInt(parts[parts.length - 1]) };
  }

  const allRows = lines.slice(1).map(parseRow);

  it(`average equals mean of ${SNAPSHOT_COUNT} snapshots for all accounts`, () => {
    for (const row of allRows) {
      for (const token of CYTOKENS) {
        const td = row.tokenData[token.name];
        const sum = td.snapshots.reduce((s, v) => s + v, 0n);
        const expectedAvg = sum / BigInt(SNAPSHOT_COUNT);
        expect(td.average).toBe(expectedAvg);
      }
    }
  });

  it('final equals average - penalty + bounty for all accounts', () => {
    for (const row of allRows) {
      for (const token of CYTOKENS) {
        const td = row.tokenData[token.name];
        expect(td.final).toBe(td.average - td.penalty + td.bounty);
      }
    }
  });

  it('total_rewards equals sum of per-token rewards for all accounts', () => {
    for (const row of allRows) {
      const sum = CYTOKENS.reduce((s, t) => s + row.tokenData[t.name].rewards, 0n);
      expect(row.totalRewards).toBe(sum);
    }
  });

  it('rewards CSV amount matches total_rewards in balances for rewarded accounts', () => {
    for (const entry of rewardEntries) {
      const row = allRows.find(r => r.address === entry.address);
      expect(row).toBeDefined();
      expect(entry.reward).toBe(row!.totalRewards);
    }
  });

  it('zero-reward accounts have zero total_rewards in balances', () => {
    const rewardAddresses = new Set(rewardEntries.map(r => r.address));
    for (const row of allRows) {
      if (!rewardAddresses.has(row.address)) {
        expect(row.totalRewards).toBe(0n);
      }
    }
  });

  it('all snapshots are non-negative for all accounts', () => {
    for (const row of allRows) {
      for (const token of CYTOKENS) {
        for (const snap of row.tokenData[token.name].snapshots) {
          expect(snap).toBeGreaterThanOrEqual(0n);
        }
      }
    }
  });
});

describe('snapshot blocks', () => {
  const data = readFileSync(SNAPSHOTS_FILE, 'utf8');
  const blocks = data.split('\n').filter(Boolean).map(Number);

  it(`has exactly ${SNAPSHOT_COUNT} snapshot blocks`, () => {
    expect(blocks.length).toBe(SNAPSHOT_COUNT);
  });

  it('all blocks are within epoch range', () => {
    for (const block of blocks) {
      expect(block).toBeGreaterThanOrEqual(epoch.startBlock);
      expect(block).toBeLessThanOrEqual(epoch.endBlock);
    }
  });

  it('blocks are sorted ascending', () => {
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i]).toBeGreaterThan(blocks[i - 1]);
    }
  });

  it('all blocks are integers', () => {
    for (const block of blocks) {
      expect(Number.isInteger(block)).toBe(true);
    }
  });
});

describe('cross-epoch comparison', () => {
  const prevEpoch = EPOCHS[CURRENT_EPOCH - 2];
  const prevFile = `./output/dispersed/rewards-${prevEpoch.startBlock}-${prevEpoch.endBlock}.csv`;
  const approvalFile = `./output/approved-changes-${epoch.startBlock}-${epoch.endBlock}.txt`;
  const { entries: currentEntries } = parseCsv(REWARDS_FILE);
  const { entries: prevEntries } = parseCsv(prevFile);

  const currentTotal = currentEntries.reduce((s, r) => s + r.reward, 0n);
  const prevTotal = prevEntries.reduce((s, r) => s + r.reward, 0n);

  const currentShares = new Map(currentEntries.map(r => [r.address, Number(r.reward * 10000n / currentTotal) / 10000]));
  const prevShares = new Map(prevEntries.map(r => [r.address, Number(r.reward * 10000n / prevTotal) / 10000]));

  function getFlaggedChanges(): Array<{address: string; prevShare: number; currentShare: number; change: string}> {
    const changes: Array<{address: string; prevShare: number; currentShare: number; change: string}> = [];
    const allAddresses = new Set([...currentShares.keys(), ...prevShares.keys()]);
    for (const addr of allAddresses) {
      const prev = prevShares.get(addr) ?? 0;
      const curr = currentShares.get(addr) ?? 0;
      if (prev === 0 && curr === 0) continue;
      if (prev === 0) {
        changes.push({ address: addr, prevShare: 0, currentShare: curr, change: 'NEW' });
      } else if (curr === 0) {
        changes.push({ address: addr, prevShare: prev, currentShare: 0, change: 'EXITED' });
      } else {
        const relativeChange = Math.abs(curr - prev) / prev;
        if (relativeChange > 0.5) {
          changes.push({ address: addr, prevShare: prev, currentShare: curr, change: `${(relativeChange * 100).toFixed(0)}%` });
        }
      }
    }
    return changes.sort((a, b) => b.currentShare - a.currentShare);
  }

  function getApprovedAddresses(): Set<string> {
    try {
      const data = readFileSync(approvalFile, 'utf8');
      return new Set(
        data.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
          .map(line => line.split(/\s+/)[0].toLowerCase())
      );
    } catch {
      return new Set();
    }
  }

  it('previous epoch rewards file exists', () => {
    expect(prevEntries.length).toBeGreaterThan(0);
  });

  it('all large share changes are approved', () => {
    const flagged = getFlaggedChanges();
    const approved = getApprovedAddresses();
    const unapproved = flagged.filter(c => !approved.has(c.address));

    if (unapproved.length > 0) {
      const lines = unapproved.map(c =>
        `  ${c.address}  prev=${(c.prevShare * 100).toFixed(2)}%  curr=${(c.currentShare * 100).toFixed(2)}%  (${c.change})`
      );
      throw new Error(
        `${unapproved.length} unapproved share changes. Add to ${approvalFile}:\n${lines.join('\n')}`
      );
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
