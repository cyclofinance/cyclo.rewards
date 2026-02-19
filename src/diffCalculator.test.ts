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

import { readCsv } from './diffCalculator';

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
