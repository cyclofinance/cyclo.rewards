import { EPOCHS_LIST } from './constants';
import { generateSnapshotTimestampForEpoch, getBlockNumberByTimestamp } from './config';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

describe('Test generateSnapshotTimestampForEpoch', () => {
  const testEpoch = EPOCHS_LIST[4];

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
    const shortEpoch = { length: 7, timestamp: 1735819200 };
    const longEpoch = { length: 60, timestamp: 1735819200 };
    
    const shortTimestamps = generateSnapshotTimestampForEpoch('test', shortEpoch);
    const longTimestamps = generateSnapshotTimestampForEpoch('test', longEpoch);
    
    expect(shortTimestamps).toHaveLength(7);
    expect(longTimestamps).toHaveLength(60);
  });
});

describe('getBlockNumberByTimestamp', () => {
  // Mock fetch globally
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // Happy path tests
  describe('Happy paths', () => {
    it('should return correct block number for valid timestamp', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: '1',
          message: 'OK',
          result: '12345678'
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await getBlockNumberByTimestamp(1672531200); // Jan 1, 2023 00:00:00 UTC
      
      expect(result).toBe(12345678);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.routescan.io/v2/network/mainnet/evm/14/etherscan/api?module=block&action=getblocknobytime&timestamp=1672531200&closest=before&apikey=YourApiKeyToken',
        { headers: { 'Content-Type': 'application/json' } }
      );
    });
  });

  // Unhappy path tests
  describe('Unhappy paths', () => {
    it('should throw error when API response is not ok', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Internal Server Error'
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(getBlockNumberByTimestamp(1672531200))
        .rejects
        .toThrow('API request failed: Internal Server Error');
    });

    it('should throw error when API returns 404', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Not Found'
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(getBlockNumberByTimestamp(1672531200))
        .rejects
        .toThrow('API request failed: Not Found');
    });

    it('should throw error when API returns rate limit error', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Too Many Requests'
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(getBlockNumberByTimestamp(1672531200))
        .rejects
        .toThrow('API request failed: Too Many Requests');
    });

    it('should throw error when fetch throws network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(getBlockNumberByTimestamp(1672531200))
        .rejects
        .toThrow('Network error');
    });

    it('should throw error when response.json() fails', async () => {
      const mockResponse = {
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(getBlockNumberByTimestamp(1672531200))
        .rejects
        .toThrow('Invalid JSON');
    });

    it('should handle malformed response structure', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          // Missing result field
          status: '1',
          message: 'OK'
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(getBlockNumberByTimestamp(1672531200))
        .rejects
        .toThrow('Expected integer result but got: undefined');
    });

    it('should handle non-numeric result', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: '1',
          message: 'OK',
          result: 'invalid-number'
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(getBlockNumberByTimestamp(1672531200))
        .rejects
        .toThrow('Expected integer result but got: invalid-number');
    });
  });
});
