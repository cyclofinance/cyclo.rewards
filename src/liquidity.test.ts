import { PublicClient } from "viem";
import {
  getPoolsTickMulticall,
  getPoolsTick,
  MULTICALL3_ADDRESS,
} from "./liquidity";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock PublicClient
const mockClient = {
  multicall: vi.fn(),
  getCode: vi.fn(),
} as unknown as PublicClient;

describe("getPoolsTickMulticall", () => {
  const mockPools = [
    "0x1234567890123456789012345678901234567890",
    "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    "0x9876543210987654321098765432109876543210",
  ] as `0x${string}`[];

  const blockNumber = 12345678n;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Happy paths", () => {
    it("should return correct ticks for successful multicall results", async () => {
      const mockResults = [
        {
          status: "success" as const,
          result: [
            160000000000000000000000000000000000000n, // sqrtPriceX96
            100, // tick
            1, // observationIndex
            1, // observationCardinality
            1, // observationCardinalityNext
            0, // feeProtocol
            true, // unlocked
          ],
        },
        {
          status: "success" as const,
          result: [
            150000000000000000000000000000000000000n,
            -200, // tick
            2,
            2,
            2,
            0,
            true,
          ],
        },
        {
          status: "success" as const,
          result: [
            170000000000000000000000000000000000000n,
            300, // tick
            3,
            3,
            3,
            0,
            true,
          ],
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(
        mockClient,
        mockPools,
        blockNumber,
      );

      expect(result).toEqual({
        "0x1234567890123456789012345678901234567890": 100,
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd": -200,
        "0x9876543210987654321098765432109876543210": 300,
      });
    });

    it("should call multicall with correct parameters", async () => {
      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 100, 1, 1, 1, 0, true],
        },
        {
          status: "success" as const,
          result: [0n, 200, 1, 1, 1, 0, true],
        },
        {
          status: "success" as const,
          result: [0n, 300, 1, 1, 1, 0, true],
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      await getPoolsTickMulticall(mockClient, mockPools, blockNumber);

      expect(mockClient.multicall).toHaveBeenCalledTimes(1);
      expect(mockClient.multicall).toHaveBeenCalledWith({
        blockNumber,
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
        contracts: mockPools.map((address) => ({
          abi: expect.any(Array),
          address,
          functionName: "slot0",
        })),
      });
    });

    it("should handle empty pools array", async () => {
      (mockClient.multicall as any).mockResolvedValue([]);

      const result = await getPoolsTickMulticall(mockClient, [], blockNumber);

      expect(result).toEqual({});
      expect(mockClient.multicall).toHaveBeenCalledWith(
        expect.objectContaining({
          contracts: [],
        }),
      );
    });

    it("should handle single pool", async () => {
      const singlePool = [
        "0x1234567890123456789012345678901234567890",
      ] as `0x${string}`[];
      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 42, 1, 1, 1, 0, true],
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(
        mockClient,
        singlePool,
        blockNumber,
      );

      expect(result).toEqual({
        "0x1234567890123456789012345678901234567890": 42,
      });
    });

    it("should preserve pool address case in output keys", async () => {
      const pools = [
        "0x1234567890123456789012345678901234567890",
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      ] as `0x${string}`[];

      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 100, 1, 1, 1, 0, true],
        },
        {
          status: "success" as const,
          result: [0n, 200, 1, 1, 1, 0, true],
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(
        mockClient,
        pools,
        blockNumber,
      );

      expect(result).toEqual({
        "0x1234567890123456789012345678901234567890": 100,
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd": 200,
      });
    });
  });

  describe("Error handling", () => {
    it("should skip pools not yet deployed (no code)", async () => {
      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 100, 1, 1, 1, 0, true],
        },
        {
          status: "failure" as const,
          error: new Error("Pool call failed"),
        },
        {
          status: "success" as const,
          result: [0n, 300, 1, 1, 1, 0, true],
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);
      (mockClient.getCode as any).mockResolvedValue("0x");

      const result = await getPoolsTickMulticall(
        mockClient,
        mockPools,
        blockNumber,
      );

      expect(result).toEqual({
        "0x1234567890123456789012345678901234567890": 100,
        "0x9876543210987654321098765432109876543210": 300,
      });
    });

    it("should throw for deployed pool with failed slot0", async () => {
      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 100, 1, 1, 1, 0, true],
        },
        {
          status: "failure" as const,
          error: new Error("Pool call failed"),
        },
        {
          status: "success" as const,
          result: [0n, 300, 1, 1, 1, 0, true],
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);
      (mockClient.getCode as any).mockResolvedValue("0x6080604052");

      await expect(
        getPoolsTickMulticall(mockClient, mockPools, blockNumber),
      ).rejects.toThrow("Failed to get ticks for pools");
    });

    it("should skip all pools when none are deployed", async () => {
      const mockResults = [
        {
          status: "failure" as const,
          error: new Error("Pool 1 failed"),
        },
        {
          status: "failure" as const,
          error: new Error("Pool 2 failed"),
        },
        {
          status: "failure" as const,
          error: new Error("Pool 3 failed"),
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);
      (mockClient.getCode as any).mockResolvedValue("0x");

      const result = await getPoolsTickMulticall(
        mockClient,
        mockPools,
        blockNumber,
      );

      expect(result).toEqual({});
    });

    it("should handle tick value of zero", async () => {
      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 0, 1, 1, 1, 0, true],
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(
        mockClient,
        ["0x1234567890123456789012345678901234567890"] as `0x${string}`[],
        blockNumber,
      );

      expect(result).toEqual({
        "0x1234567890123456789012345678901234567890": 0,
      });
    });

    it("should use last result when duplicate pool addresses are provided", async () => {
      const dupPools = [
        "0x1234567890123456789012345678901234567890",
        "0x1234567890123456789012345678901234567890",
      ] as `0x${string}`[];

      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 100, 1, 1, 1, 0, true],
        },
        {
          status: "success" as const,
          result: [0n, 200, 1, 1, 1, 0, true],
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);

      const result = await getPoolsTickMulticall(
        mockClient,
        dupPools,
        blockNumber,
      );

      // Last write wins since both map to the same lowercased key
      expect(result).toEqual({
        "0x1234567890123456789012345678901234567890": 200,
      });
    });

    it("should skip pool when getCode returns undefined", async () => {
      const twoPools = [
        "0x1234567890123456789012345678901234567890",
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      ] as `0x${string}`[];

      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 100, 1, 1, 1, 0, true],
        },
        {
          status: "failure" as const,
          error: new Error("Pool call failed"),
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);
      (mockClient.getCode as any).mockResolvedValue(undefined);

      const result = await getPoolsTickMulticall(
        mockClient,
        twoPools,
        blockNumber,
      );

      expect(result).toEqual({
        "0x1234567890123456789012345678901234567890": 100,
      });
    });

    it("should propagate getCode errors", async () => {
      const twoPools = [
        "0x1234567890123456789012345678901234567890",
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      ] as `0x${string}`[];

      const mockResults = [
        {
          status: "success" as const,
          result: [0n, 100, 1, 1, 1, 0, true],
        },
        {
          status: "failure" as const,
          error: new Error("Pool call failed"),
        },
      ];

      (mockClient.multicall as any).mockResolvedValue(mockResults);
      (mockClient.getCode as any).mockRejectedValue(new Error("RPC down"));

      await expect(
        getPoolsTickMulticall(mockClient, twoPools, blockNumber),
      ).rejects.toThrow("RPC down");
    });

    it("should propagate multicall errors", async () => {
      const multicallError = new Error("Multicall failed");
      (mockClient.multicall as any).mockRejectedValue(multicallError);

      await expect(
        getPoolsTickMulticall(mockClient, mockPools, blockNumber),
      ).rejects.toThrow("Multicall failed");
    });
  });
});

describe("getPoolsTick", () => {
  const pools = [
    "0x1234567890123456789012345678901234567890",
  ] as `0x${string}`[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, "setTimeout").mockImplementation((fn: any) => {
      fn();
      return 0 as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns on first success without retry", async () => {
    (mockClient.multicall as any).mockResolvedValue([
      { status: "success" as const, result: [0n, 42, 1, 1, 1, 0, true] },
    ]);

    const result = await getPoolsTick(mockClient, pools, 100);
    expect(result).toEqual({
      "0x1234567890123456789012345678901234567890": 42,
    });
    expect(mockClient.multicall).toHaveBeenCalledTimes(1);
  });

  it("converts blockNumber to BigInt", async () => {
    (mockClient.multicall as any).mockResolvedValue([
      { status: "success" as const, result: [0n, 42, 1, 1, 1, 0, true] },
    ]);

    await getPoolsTick(mockClient, pools, 12345);
    expect(mockClient.multicall).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: 12345n }),
    );
  });

  it("retries and succeeds on second attempt", async () => {
    (mockClient.multicall as any)
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce([
        { status: "success" as const, result: [0n, 99, 1, 1, 1, 0, true] },
      ]);

    const result = await getPoolsTick(mockClient, pools, 100);

    expect(result).toEqual({
      "0x1234567890123456789012345678901234567890": 99,
    });
    expect(mockClient.multicall).toHaveBeenCalledTimes(2);
  });

  it("throws after 3 failures", async () => {
    (mockClient.multicall as any).mockRejectedValue(new Error("persistent"));

    await expect(getPoolsTick(mockClient, pools, 100)).rejects.toThrow(
      "persistent",
    );
    expect(mockClient.multicall).toHaveBeenCalledTimes(3);
  });

  it("succeeds on third (final) attempt", async () => {
    (mockClient.multicall as any)
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValueOnce([
        { status: "success" as const, result: [0n, 77, 1, 1, 1, 0, true] },
      ]);

    const result = await getPoolsTick(mockClient, pools, 100);
    expect(result).toEqual({
      "0x1234567890123456789012345678901234567890": 77,
    });
    expect(mockClient.multicall).toHaveBeenCalledTimes(3);
  });

  it("passes correct delay to setTimeout on retry", async () => {
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    (mockClient.multicall as any)
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce([
        { status: "success" as const, result: [0n, 42, 1, 1, 1, 0, true] },
      ]);

    await getPoolsTick(mockClient, pools, 100);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10_000);
  });

  it("throws on NaN blockNumber", async () => {
    await expect(getPoolsTick(mockClient, pools, NaN)).rejects.toThrow(
      "blockNumber",
    );
  });

  it("throws on negative blockNumber", async () => {
    await expect(getPoolsTick(mockClient, pools, -1)).rejects.toThrow(
      "blockNumber",
    );
  });

  it("throws on fractional blockNumber", async () => {
    await expect(getPoolsTick(mockClient, pools, 100.5)).rejects.toThrow(
      "blockNumber",
    );
  });

  it("throws on Infinity blockNumber", async () => {
    await expect(getPoolsTick(mockClient, pools, Infinity)).rejects.toThrow(
      "blockNumber",
    );
  });
});
