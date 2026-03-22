import { describe, it, expect, vi } from 'vitest';
import { DISTRIBUTED_COUNT } from './diff';
import { REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD, DIFF_CSV_COLUMN_HEADER_OLD, DIFF_CSV_COLUMN_HEADER_NEW, DIFF_CSV_COLUMN_HEADER_DIFF } from './constants';

const { mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => {
  const header = 'recipient address,amount wei';
  const fakeRows = Array.from({length: 200}, (_, i) =>
    `0x${i.toString(16).padStart(40, '0')},${i + 1}`
  );
  const fakeCsv = [header, ...fakeRows].join('\n');
  const mockReadFileSync = vi.fn().mockReturnValue(fakeCsv);
  const mockWriteFileSync = vi.fn();
  return { mockReadFileSync, mockWriteFileSync };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  };
});

// Importing diffCalculator triggers main() as a side effect
import './diffCalculator';

describe('diffCalculator main() CSV output', () => {
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
    expect(lines.length).toBe(200 - DISTRIBUTED_COUNT + 1);
    expect(lines[1]).toMatch(/^0x[0-9a-f]+,\d+$/);
  });

  it('should write remainingUncovered CSV with header only', () => {
    const [path, content] = mockWriteFileSync.mock.calls[1];
    expect(path).toBe('output/rewards-51504517-52994045-remainingUncovered.csv');
    const lines = content.split('\n');
    expect(lines[0]).toBe(rewardsHeader);
    expect(lines.length).toBe(1);
  });

  it('should write diff CSV with header only when old and new are identical', () => {
    const [path, content] = mockWriteFileSync.mock.calls[2];
    expect(path).toBe('output/rewards-51504517-52994045-diff.csv');
    const lines = content.split('\n');
    expect(lines[0]).toBe(diffHeader);
    expect(lines.length).toBe(1);
  });

  it('should only include non-distributed addresses in covered CSV', () => {
    const [, content] = mockWriteFileSync.mock.calls[0];
    const dataLines = content.split('\n').slice(1);
    const addresses = dataLines.map((l: string) => l.split(',')[0]);

    for (let i = 0; i < DISTRIBUTED_COUNT; i++) {
      const distributed = `0x${i.toString(16).padStart(40, '0')}`;
      expect(addresses).not.toContain(distributed);
    }
  });
});
