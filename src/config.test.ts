import { EPOCHS_LIST, Epoch } from './constants';
import { describe, it, expect } from 'vitest';
import { generateSnapshotTimestampForEpoch } from './config';

describe('Test generateSnapshotTimestampForEpoch', () => {
  const testEpoch: Epoch = EPOCHS_LIST[4];

  it('should generate correct number of timestamps', () => {
    const timestamps = generateSnapshotTimestampForEpoch('test-seed', testEpoch);
    expect(timestamps).toHaveLength(testEpoch.length);
  });

  it('should be deterministic - same seed produces same results', () => {
    const seed = 'deterministic-test';
    const timestamps1 = generateSnapshotTimestampForEpoch(seed, testEpoch);
    const timestamps2 = generateSnapshotTimestampForEpoch(seed, testEpoch);
    
    expect(timestamps1).toEqual(timestamps2);
  });

  it('should produce different results with different seeds', () => {
    const timestamps1 = generateSnapshotTimestampForEpoch('seed1', testEpoch);
    const timestamps2 = generateSnapshotTimestampForEpoch('seed2', testEpoch);
    
    expect(timestamps1).not.toEqual(timestamps2);
  });

  it('should return timestamps in ascending order', () => {
    const timestamps = generateSnapshotTimestampForEpoch('test-seed', testEpoch);
    
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });

  it('should generate timestamps within the epoch range', () => {
    const timestamps = generateSnapshotTimestampForEpoch('test-seed', testEpoch);
    const epochStartTimestamp = testEpoch.timestamp - (testEpoch.length * 24 * 60 * 60);
    
    timestamps.forEach(timestamp => {
      expect(timestamp).toBeGreaterThan(epochStartTimestamp);
      expect(timestamp).toBeLessThan(testEpoch.timestamp);
    });
  });

  it('should work with different epoch lengths', () => {
    const shortEpoch: Epoch = { length: 7, timestamp: 1735819200 };
    const longEpoch: Epoch = { length: 60, timestamp: 1735819200 };
    
    const shortTimestamps = generateSnapshotTimestampForEpoch('test', shortEpoch);
    const longTimestamps = generateSnapshotTimestampForEpoch('test', longEpoch);
    
    expect(shortTimestamps).toHaveLength(7);
    expect(longTimestamps).toHaveLength(60);
  });
});
