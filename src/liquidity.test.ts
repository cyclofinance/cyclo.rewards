import { PublicClient } from 'viem';
import { getPoolsTickMulticall } from './liquidity';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock PublicClient
const mockClient = {
  multicall: vi.fn()
} as unknown as PublicClient;

describe('getPoolsTickMulticall', () => {
  const mockPools = [
    '0x1234567890123456789012345678901234567890',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    '0x9876543210987654321098765432109876543210'
  ] as `0x${string}`[];

  const blockNumber = 12345678n;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy paths', () => {
    it('should return correct ticks for successful multicall results', async () => {
      const mockResults = [
        {
          status: 'success' as const,
          result: [
            160000000000000000000000000000000000000n, // sqrtPriceX96
            100, // tick
            1, // observationIndex
            1, // observationCardinality
            1, // observationCardinalityNext
            0, // feeProtocol
            true // unlocked
          ]
        },
        {
          status: 'success' as const,
          result: [
            150000000000000000000000000000000000000n,
            -200, // tick
            2,
            2,
            2,
            0,
            true
          ]
        },
        {
          status: 'success' as const,
          result: [
            170000000000000000000000000000000000000n,
            300, // tick
            3,
            3,
            3,
            0,
            true
          ]
        }
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(mockClient, mockPools, blockNumber);

      expect(result).toEqual({
        '0x1234567890123456789012345678901234567890': 100,
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd': -200,
        '0x9876543210987654321098765432109876543210': 300
      });
    });

    it('should call multicall with correct parameters', async () => {
      const mockResults = [
        {
          status: 'success' as const,
          result: [0n, 100, 1, 1, 1, 0, true]
        }
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      await getPoolsTickMulticall(mockClient, mockPools, blockNumber);

      expect(mockClient.multicall).toHaveBeenCalledTimes(1);
      expect(mockClient.multicall).toHaveBeenCalledWith({
        blockNumber,
        allowFailure: true,
        multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
        contracts: mockPools.map(address => ({
          abi: expect.any(Array),
          address,
          functionName: "slot0"
        }))
      });
    });

    it('should handle empty pools array', async () => {
      (mockClient.multicall as any).mockResolvedValue([]);

      const result = await getPoolsTickMulticall(mockClient, [], blockNumber);

      expect(result).toEqual({});
      expect(mockClient.multicall).toHaveBeenCalledWith(
        expect.objectContaining({
          contracts: []
        })
      );
    });

    it('should handle single pool', async () => {
      const singlePool = ['0x1234567890123456789012345678901234567890'] as `0x${string}`[];
      const mockResults = [
        {
          status: 'success' as const,
          result: [0n, 42, 1, 1, 1, 0, true]
        }
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(mockClient, singlePool, blockNumber);

      expect(result).toEqual({
        '0x1234567890123456789012345678901234567890': 42
      });
    });

    it('should convert pool addresses to lowercase', async () => {
      const upperCasePools = [
        '0x1234567890123456789012345678901234567890',
        '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD'
      ] as `0x${string}`[];

      const mockResults = [
        {
          status: 'success' as const,
          result: [0n, 100, 1, 1, 1, 0, true]
        },
        {
          status: 'success' as const,
          result: [0n, 200, 1, 1, 1, 0, true]
        }
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(mockClient, upperCasePools, blockNumber);

      expect(result).toEqual({
        '0x1234567890123456789012345678901234567890': 100,
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd': 200
      });
    });
  });

  describe('Error handling', () => {
    it('should skip pools with failed multicall results', async () => {
      const mockResults = [
        {
          status: 'success' as const,
          result: [0n, 100, 1, 1, 1, 0, true]
        },
        {
          status: 'failure' as const,
          error: new Error('Pool call failed')
        },
        {
          status: 'success' as const,
          result: [0n, 300, 1, 1, 1, 0, true]
        }
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(mockClient, mockPools, blockNumber);

      expect(result).toEqual({
        '0x1234567890123456789012345678901234567890': 100,
        '0x9876543210987654321098765432109876543210': 300
        // Middle pool should be omitted due to failure
      });
    });

    it('should handle all calls failing', async () => {
      const mockResults = [
        {
          status: 'failure' as const,
          error: new Error('Pool 1 failed')
        },
        {
          status: 'failure' as const,
          error: new Error('Pool 2 failed')
        },
        {
          status: 'failure' as const,
          error: new Error('Pool 3 failed')
        }
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(mockClient, mockPools, blockNumber);

      expect(result).toEqual({});
    });

    it('should propagate multicall errors', async () => {
      const multicallError = new Error('Multicall failed');
      (mockClient.multicall as any).mockRejectedValue(multicallError);

      await expect(getPoolsTickMulticall(mockClient, mockPools, blockNumber))
        .rejects
        .toThrow('Multicall failed');
    });
  });
});
