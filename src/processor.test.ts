import { CYTOKENS } from "./config";
import { Processor } from "./processor";
import { getPoolsTick } from "./liquidity";
import { LiquidityChange, LiquidityChangeType, Transfer } from "./types";
import { describe, it, expect, beforeEach, vi, afterEach, Mock } from "vitest";

// Mock the liquidity module
vi.mock('./liquidity', () => ({
  getPoolsTick: vi.fn()
}));

describe("Processor", () => {
  let processor: Processor;
  const SNAPSHOTS = [100, 200];

  // Test addresses
  const APPROVED_SOURCE = "0x1000000000000000000000000000000000000000";
  const FACTORY_SOURCE = "0x2000000000000000000000000000000000000000";
  const NORMAL_USER_1 = "0x3000000000000000000000000000000000000000";
  const NORMAL_USER_2 = "0x4000000000000000000000000000000000000000";

  const ONE = "1000000000000000000";
  const ONEn = 1000000000000000000n;

  // Create a mock client
  const mockClient = {
    readContract: async () => "0x0000000000000000000000000000000000000000",
  };

  beforeEach(() => {
    processor = new Processor(SNAPSHOTS, SNAPSHOTS.length, [], mockClient);
    processor.isApprovedSource = async (source: string) => {
      return (
        source.toLowerCase() === APPROVED_SOURCE.toLowerCase() ||
        source.toLowerCase() === FACTORY_SOURCE.toLowerCase()
      );
    };
  });

  describe("Basic Transfer Processing", () => {
    it("should track approved transfers correctly", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_1)
      ).toBeDefined();
      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_1)
          ?.snapshots[0]
      ).toBe(ONEn);
      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_1)
          ?.snapshots[1]
      ).toBe(ONEn);
      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_1)
          ?.average
      ).toBe(ONEn);
    });

    it("should not track unapproved transfers", async () => {
      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: NORMAL_USER_2,
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_1)
          ?.average
      ).toBe(0n);
    });
  });

  describe("Snapshot Timing", () => {
    it("should handle transfers before snapshot 1", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 50, // Before snapshot 1
        timestamp: 1000, // Before snapshot 1
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_1)?.snapshots[0];
      expect(index).toBe(ONEn);
      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_1)
          ?.snapshots[1]
      ).toBe(ONEn);
    });

    it("should handle transfers between snapshots", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 150, // Between snapshots
        timestamp: 1000, // Between snapshots
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances
          .get(CYTOKENS[0].address.toLowerCase())
          ?.get(NORMAL_USER_1.toLowerCase())?.snapshots[0]
      ).toBe(0n);
      expect(
        balances
          .get(CYTOKENS[0].address.toLowerCase())
          ?.get(NORMAL_USER_1.toLowerCase())?.snapshots[1]
      ).toBe(ONEn);
    });

    it("should handle transfers after snapshot 2", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 250, // After snapshot 2
        timestamp: 1000, // After snapshot 2
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances
          .get(CYTOKENS[0].address.toLowerCase())
          ?.get(NORMAL_USER_1.toLowerCase())?.snapshots[0]
      ).toBe(0n);

      expect(
        balances
          .get(CYTOKENS[0].address.toLowerCase())
          ?.get(NORMAL_USER_1.toLowerCase())?.snapshots[1]
      ).toBe(0n);
    });
  });

  describe("Blocklist", () => {
    it("should include blocklisted addresses with penalties", async () => {
      const processor = new Processor(SNAPSHOTS, SNAPSHOTS.length, [
        { reporter: NORMAL_USER_1, cheater: NORMAL_USER_2 },
      ]);
      processor.isApprovedSource = async (source: string) =>
        source.toLowerCase() === APPROVED_SOURCE.toLowerCase();

      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_2,
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_2)?.average;
      expect(index).not.toBe(0n);
      expect(index).toBe(ONEn);
      const penalty = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_2)?.penalty;
      expect(penalty).toBe(ONEn);
      const final = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_2)?.final;
      expect(final).toBe(0n);
    });
  });

  describe("Blocklist Penalties", () => {
    it("should calculate bounties for reporters", async () => {
      const reports = [
        {
          reporter: NORMAL_USER_1,
          cheater: NORMAL_USER_2,
        },
      ];

      // Need to include NORMAL_USER_2 in the blocklist since they're reported
      const processor = new Processor(SNAPSHOTS, SNAPSHOTS.length, reports, mockClient);

      processor.isApprovedSource = async (source: string) =>
        source.toLowerCase() === APPROVED_SOURCE.toLowerCase();

      // Give NORMAL_USER_2 some balance to be penalized
      const transfer1: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_2,
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      // Give NORMAL_USER_1 (reporter) some balance too
      const transfer2: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer1);
      await processor.processTransfer(transfer2);

      const balances = await processor.getEligibleBalances();

      const reporterBounty = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_1)?.bounty;
      const cheaterPenalty = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_2)?.penalty;

      expect(reporterBounty).toBe(ONEn / 10n); // 10% bounty
      expect(cheaterPenalty).toBe(ONEn); // Full penalty

      const final = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_2)?.final;
      expect(final).toBe(0n);

      const reporterFinal = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_1)?.final;
      expect(reporterFinal).toBe(ONEn + ONEn / 10n); // Original balance + bounty
    });
  });

  describe("Reward Calculation", () => {
    it("should calculate rewards proportionally for single token", async () => {
      // Setup two accounts with different balances
      const transfer1: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "2000000000000000000", // 2 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      const transfer2: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_2,
        value: "3000000000000000000", // 3 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      // we need at least one transfer for the second token so we don't divide by 0 later
      const transfer3: Transfer = {
        from: NORMAL_USER_1,
        to: NORMAL_USER_2,
        value: "3000000000000000000", // 3 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[1].address.toLowerCase(),
      };

      await processor.processTransfer(transfer1);
      await processor.processTransfer(transfer2);
      await processor.processTransfer(transfer3);

      const rewardPool = ONEn; // 1 token reward pool
      const result = await processor.calculateRewards(rewardPool);

      const user1Reward = result
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_1);
      const user2Reward = result
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_2);

      expect(user1Reward).toBe(400000000000000000n); // 0.4 tokens
      expect(user2Reward).toBe(600000000000000000n); // 0.6 tokens

      // Total should equal reward pool
      expect(user1Reward! + user2Reward!).toBe(rewardPool);
    });

    it("should treat negative balances as zero when calculating eligible amounts", async () => {
      // User 1: cyA: 50, cyB: -30 (should count as 50 total)
      const transfers1 = [
        {
          from: APPROVED_SOURCE,
          to: NORMAL_USER_1,
          value: "50000000000000000000", // 50 tokens
          blockNumber: 50,
          timestamp: 1000,
          tokenAddress: CYTOKENS[0].address.toLowerCase(),
        },
        {
          from: APPROVED_SOURCE,
          to: NORMAL_USER_1,
          value: "10000000000000000000", // 10 tokens initial
          blockNumber: 50,
          timestamp: 1000,
          tokenAddress: CYTOKENS[1].address.toLowerCase(),
        },
        {
          from: NORMAL_USER_1,
          to: APPROVED_SOURCE,
          value: "40000000000000000000", // Withdraw 40 tokens (making -30 balance)
          blockNumber: 50,
          timestamp: 2000,
          tokenAddress: CYTOKENS[1].address.toLowerCase(),
        },
      ];

      // User 2: cyA: -10, cyB: 88 (should count as 88 total)
      const transfers2 = [
        {
          from: APPROVED_SOURCE,
          to: NORMAL_USER_2,
          value: "5000000000000000000", // 5 tokens initial
          blockNumber: 50,
          timestamp: 1000,
          tokenAddress: CYTOKENS[0].address.toLowerCase(),
        },
        {
          from: NORMAL_USER_2,
          to: APPROVED_SOURCE,
          value: "15000000000000000000", // Withdraw 15 tokens (making -10 balance)
          blockNumber: 50,
          timestamp: 2000,
          tokenAddress: CYTOKENS[0].address.toLowerCase(),
        },
        {
          from: APPROVED_SOURCE,
          to: NORMAL_USER_2,
          value: "88000000000000000000", // 88 tokens
          blockNumber: 50,
          timestamp: 1000,
          tokenAddress: CYTOKENS[1].address.toLowerCase(),
        },
      ];

      // Process all transfers
      for (const transfer of [...transfers1, ...transfers2]) {
        await processor.processTransfer(transfer);
      }

      const rewardPool = 1_000_000n * ONEn; // 1m token reward pool
      const result = await processor.calculateRewards(rewardPool);

      const user1Reward = result
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_1);
      const user2Reward = result
        .get(CYTOKENS[1].address.toLowerCase())
        ?.get(NORMAL_USER_2);

      // Both users should be included in results
      expect(user1Reward).not.toBeUndefined();
      expect(user2Reward).not.toBeUndefined();

      // Check eligible balances
      const balances = await processor.getEligibleBalances();
      console.log("balances", balances);
      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_1)
      ).toBeDefined();
      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_2)
      ).toBeDefined();

      // Verify User 1 has 50 tokens in cyA and 0 in cyB (negative balance treated as 0)
      const user1CyABalance = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_1)?.average;
      const user1CyBBalance = balances
        .get(CYTOKENS[1].address.toLowerCase())
        ?.get(NORMAL_USER_1)?.average;
      expect(user1CyABalance).toBe(50000000000000000000n);
      expect(user1CyBBalance).toBe(0n); // -30 treated as 0

      // Verify User 2 has 0 tokens in cyA (negative balance treated as 0) and 88 in cyB
      const user2CyABalance = balances
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_2)?.average;
      const user2CyBBalance = balances
        .get(CYTOKENS[1].address.toLowerCase())
        ?.get(NORMAL_USER_2)?.average;
      expect(user2CyABalance).toBe(0n); // -10 treated as 0
      expect(user2CyBBalance).toBe(88000000000000000000n);

      // Verify total balances
      expect(
        balances.get(CYTOKENS[0].address.toLowerCase())?.get(NORMAL_USER_1)
          ?.average
      ).toBe(50000000000000000000n);
      expect(
        balances.get(CYTOKENS[1].address.toLowerCase())?.get(NORMAL_USER_2)
          ?.average
      ).toBe(88000000000000000000n);

      // Calculate the rewards pool for each token
      const rewardsPools = processor.calculateRewardsPoolsPertoken(
        balances,
        rewardPool
      );

      console.log("rewardsPools", rewardsPools);

      //
      const expectedUser1Reward = rewardsPools.get(
        CYTOKENS[0].address.toLowerCase()
      )!;
      const expectedUser2Reward = rewardsPools.get(
        CYTOKENS[1].address.toLowerCase()
      )!;

      // Check that rewards match expected values
      expect(user1Reward).toBe(expectedUser1Reward);
      expect(user2Reward).toBe(expectedUser2Reward);

      // Total should equal reward pool
      expect(user1Reward! + user2Reward!).toBeGreaterThanOrEqual(
        rewardPool - 10n
      );
    });
  });

  describe("Reward Calculation with Multiple Tokens", () => {
    it("should calculate rewards proportionally for multiple tokens", async () => {
      // Setup two accounts with different balances
      const transfer1: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "2000000000000000000", // 2 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      const transfer2: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_2,
        value: "3000000000000000000", // 3 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer1);
      await processor.processTransfer(transfer2);

      const rewardPool = ONEn; // 1 token reward pool
      const result = await processor.calculateRewards(rewardPool);

      const user1Reward = result
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_1);
      const user2Reward = result
        .get(CYTOKENS[0].address.toLowerCase())
        ?.get(NORMAL_USER_2);

      expect(user1Reward).toBe(400000000000000000n); // 0.4 tokens
      expect(user2Reward).toBe(600000000000000000n); // 0.6 tokens

      // Total should equal reward pool
      expect(user1Reward! + user2Reward!).toBe(rewardPool);
    });
  });

  describe("Process Liquidity Position", () => {
    it("should correctly factor in liquidity changes", async () => {
      const tokenAddress = CYTOKENS[0].address.toLowerCase();

      // Setup an account with balance
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "5000000000000000000", // 5 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress,
      };
      await processor.processTransfer(transfer);

      // verify the transfer is calculated correctly
      let balances = await processor.getEligibleBalances();
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)).toEqual({
        snapshots: [5000000000000000000n, 5000000000000000000n],
        average: 5000000000000000000n,
        penalty: 0n,
        bounty: 0n,
        final: 5000000000000000000n,
      });

      // deposit event before snapshot 1
      const liquidityChangeEvent1: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: "3000000000000000000", // 3 token deposit
        blockNumber: 55,
        timestamp: 1005,
        __typename: "LiquidityV2Change",
      };
      await processor.processLiquidityPositions(liquidityChangeEvent1);

      // validate balances after the first liquidity deposit
      balances = await processor.getEligibleBalances();
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)).toEqual({
        snapshots: [
          8000000000000000000n, // 5 + 3
          8000000000000000000n, // 5 + 3
        ],
        average: 8000000000000000000n,
        penalty: 0n,
        bounty: 0n,
        final: 8000000000000000000n,
      });

      // deposit event between snapshot 1 and 2
      const liquidityChangeEvent2: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: "1000000000000000000", // 1 token deposit
        blockNumber: 150,
        timestamp: 1105,
        __typename: "LiquidityV2Change"
      };
      await processor.processLiquidityPositions(liquidityChangeEvent2);

      // validate balances after the second liquidity deposit
      balances = await processor.getEligibleBalances();
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)).toEqual({
        snapshots: [
          8000000000000000000n, // 5 + 3
          9000000000000000000n, // 5 + 3 + 1
        ],
        average: 8500000000000000000n,
        penalty: 0n,
        bounty: 0n,
        final: 8500000000000000000n,
      });

      // withdraw event between snapshot 1 and 2
      const liquidityChangeEvent3: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: "1234",
        depositedBalanceChange: "-2000000000000000000", // 2 token withdraw
        blockNumber: 155,
        timestamp: 1155,
        __typename: "LiquidityV2Change"
      };
      await processor.processLiquidityPositions(liquidityChangeEvent3);

      // validate balances after the liquidity withdraw
      balances = await processor.getEligibleBalances();
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)).toEqual({
        snapshots: [
          8000000000000000000n, // 5 + 3
          7000000000000000000n, // 5 + 3 + 1 - 2
        ],
        average: 7500000000000000000n,
        penalty: 0n,
        bounty: 0n,
        final: 7500000000000000000n,
      });

      // transfer event after snapshot 2
      const liquidityChangeEvent4: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: "1234",
        depositedBalanceChange: "-1000000000000000000", // 1 token transfer
        blockNumber: 250,
        timestamp: 1250,
        __typename: "LiquidityV2Change"
      };
      await processor.processLiquidityPositions(liquidityChangeEvent4);

      // validate balances after the liquidity transfer which is in effective since its out of snapshot range
      balances = await processor.getEligibleBalances();
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)).toEqual({
        snapshots: [
          8000000000000000000n, // 5 + 3
         7000000000000000000n, // 5 + 3 + 1 - 2
        ],
        average: 7500000000000000000n,
        penalty: 0n,
        bounty: 0n,
        final: 7500000000000000000n,
      });
    });
  });

  describe('Test processLpRange() method', () => {
    let processor: Processor;
    const mockClient = {
      readContract: vi.fn(),
      multicall: vi.fn()
    };
    
    const snapshots = [1000, 2000, 3000];
    const epochLength = 3;
    const pools = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222'
    ] as `0x${string}`[];

    beforeEach(() => {
      vi.clearAllMocks();
      processor = new Processor(snapshots, epochLength, [], mockClient, pools);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('Happy', () => {
      it('should process LP positions correctly when they are out of range', async () => {
        // Setup mock pool ticks
        const poolTicks = {
          '0x1111111111111111111111111111111111111111': 100, // Pool tick at 100
          '0x2222222222222222222222222222222222222222': 200  // Pool tick at 200
        };
        (getPoolsTick as Mock).mockResolvedValue(poolTicks);

        // Setup initial account balance
        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        const poolAddress = '0x1111111111111111111111111111111111111111';
        
        // Access private property for testing
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress.toLowerCase(), {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n], // Initial balances
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress.toLowerCase(), balanceMap);

        // Setup LP position that's out of range (tick 100, position range 150-250)
        const lpTrackList = (processor as any).lp3TrackList;
        const lpId = `${tokenAddress.toLowerCase()}-${ownerAddress.toLowerCase()}-${poolAddress.toLowerCase()}-123`;
        
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(lpId, {
            value: 200n,
            pool: poolAddress.toLowerCase(),
            lowerTick: 150, // Out of range (tick is 100)
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // Verify getPoolsTick was called for each snapshot
        expect(getPoolsTick).toHaveBeenCalledTimes(3);
        expect(getPoolsTick).toHaveBeenCalledWith(mockClient, pools, 1000);
        expect(getPoolsTick).toHaveBeenCalledWith(mockClient, pools, 2000);
        expect(getPoolsTick).toHaveBeenCalledWith(mockClient, pools, 3000);

        // Verify balance was deducted for out-of-range position
        const updatedBalance = balanceMap.get(ownerAddress.toLowerCase());
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([300n, 300n, 300n]); // 500n - 200n
      });

      it('should not deduct balance when LP position is in range', async () => {
        const poolTicks = {
          '0x1111111111111111111111111111111111111111': 200, // Pool tick at 200
        };
        (getPoolsTick as Mock).mockResolvedValue(poolTicks);

        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        const poolAddress = '0x1111111111111111111111111111111111111111';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress.toLowerCase(), {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress.toLowerCase(), balanceMap);

        // Setup LP position that's in range (tick 200, position range 150-250)
        const lpTrackList = (processor as any).lp3TrackList;
        const lpId = `${tokenAddress.toLowerCase()}-${ownerAddress.toLowerCase()}-${poolAddress.toLowerCase()}-123`;
        
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(lpId, {
            value: 200n,
            pool: poolAddress.toLowerCase(),
            lowerTick: 150, // In range (tick is 200)
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // Verify balance was NOT deducted for in-range position
        const updatedBalance = balanceMap.get(ownerAddress.toLowerCase());
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([500n, 500n, 500n]); // Unchanged
      });

      it('should handle multiple LP positions for same account', async () => {
        const poolTicks = {
          '0x1111111111111111111111111111111111111111': 100,
          '0x2222222222222222222222222222222222222222': 300,
        };
        (getPoolsTick as Mock).mockResolvedValue(poolTicks);

        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress.toLowerCase(), {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress.toLowerCase(), balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        
        // Two LP positions: one in range, one out of range
        const lpId1 = `${tokenAddress.toLowerCase()}-${ownerAddress.toLowerCase()}-0x1111111111111111111111111111111111111111-123`;
        const lpId2 = `${tokenAddress.toLowerCase()}-${ownerAddress.toLowerCase()}-0x2222222222222222222222222222222222222222-456`;
        
        for (const snapshot of snapshots) {
          // Out of range position (tick 100, range 150-250)
          lpTrackList[snapshot].set(lpId1, {
            value: 200n,
            pool: '0x1111111111111111111111111111111111111111',
            lowerTick: 150,
            upperTick: 250,
          });
          
          // In range position (tick 300, range 250-350)
          lpTrackList[snapshot].set(lpId2, {
            value: 100n,
            pool: '0x2222222222222222222222222222222222222222',
            lowerTick: 250,
            upperTick: 350,
          });
        }

        await processor.processLpRange();

        // Only the out-of-range position should be deducted
        const updatedBalance = balanceMap.get(ownerAddress.toLowerCase());
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([300n, 300n, 300n]); // 500n - 200n
      });

      it('should handle multiple tokens and accounts', async () => {
        const poolTicks = {
          '0x1111111111111111111111111111111111111111': 100,
        };
        (getPoolsTick as Mock).mockResolvedValue(poolTicks);

        const token1 = '0xtoken1';
        const token2 = '0xtoken2';
        const owner1 = '0xowner1';
        const owner2 = '0xowner2';
        const poolAddress = '0x1111111111111111111111111111111111111111';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        
        // Setup two tokens with two owners each
        for (const token of [token1, token2]) {
          const balanceMap = new Map();
          for (const owner of [owner1, owner2]) {
            balanceMap.set(owner.toLowerCase(), {
              transfersInFromApproved: 1000n,
              transfersOut: 0n,
              netBalanceAtSnapshots: [500n, 500n, 500n],
              currentNetBalance: 1000n,
            });
          }
          accountBalancesPerToken.set(token.toLowerCase(), balanceMap);
        }

        const lpTrackList = (processor as any).lp3TrackList;
        
        // Add out-of-range positions for all combinations
        for (const token of [token1, token2]) {
          for (const owner of [owner1, owner2]) {
            const lpId = `${token.toLowerCase()}-${owner.toLowerCase()}-${poolAddress.toLowerCase()}-123`;
            for (const snapshot of snapshots) {
              lpTrackList[snapshot].set(lpId, {
                value: 100n,
                pool: poolAddress.toLowerCase(),
                lowerTick: 150, // Out of range (tick is 100)
                upperTick: 250,
              });
            }
          }
        }

        await processor.processLpRange();

        // All balances should be deducted
        for (const token of [token1, token2]) {
          const balanceMap = accountBalancesPerToken.get(token.toLowerCase());
          for (const owner of [owner1, owner2]) {
            const balance = balanceMap.get(owner.toLowerCase());
            expect(balance.netBalanceAtSnapshots).toEqual([400n, 400n, 400n]); // 500n - 100n
          }
        }
      });
    });

    describe('Unhappy', () => {
      it('should skip processing when pool tick is undefined', async () => {
        const poolTicks = {
          // Missing tick for pool 0x1111111111111111111111111111111111111111
        };
        (getPoolsTick as Mock).mockResolvedValue(poolTicks);

        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        const poolAddress = '0x1111111111111111111111111111111111111111';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress.toLowerCase(), {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress.toLowerCase(), balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        const lpId = `${tokenAddress.toLowerCase()}-${ownerAddress.toLowerCase()}-${poolAddress.toLowerCase()}-123`;
        
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(lpId, {
            value: 200n,
            pool: poolAddress.toLowerCase(),
            lowerTick: 150,
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // Balance should remain unchanged due to undefined tick
        const updatedBalance = balanceMap.get(ownerAddress.toLowerCase());
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([500n, 500n, 500n]);
      });

      it('should skip LP positions with zero or negative value', async () => {
        const poolTicks = {
          '0x1111111111111111111111111111111111111111': 100,
        };
        (getPoolsTick as Mock).mockResolvedValue(poolTicks);

        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        const poolAddress = '0x1111111111111111111111111111111111111111';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress.toLowerCase(), {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress.toLowerCase(), balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        const lpId1 = `${tokenAddress.toLowerCase()}-${ownerAddress.toLowerCase()}-${poolAddress.toLowerCase()}-123`;
        const lpId2 = `${tokenAddress.toLowerCase()}-${ownerAddress.toLowerCase()}-${poolAddress.toLowerCase()}-456`;
        
        for (const snapshot of snapshots) {
          // Zero value position
          lpTrackList[snapshot].set(lpId1, {
            value: 0n,
            pool: poolAddress.toLowerCase(),
            lowerTick: 150, // Out of range
            upperTick: 250,
          });
          
          // Negative value position
          lpTrackList[snapshot].set(lpId2, {
            value: -100n,
            pool: poolAddress.toLowerCase(),
            lowerTick: 150, // Out of range
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // No deductions should happen due to zero/negative values
        const updatedBalance = balanceMap.get(ownerAddress.toLowerCase());
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([500n, 500n, 500n]);
      });

      it('should skip non related LP positions', async () => {
        const poolTicks = {
          '0x1111111111111111111111111111111111111111': 100,
        };
        (getPoolsTick as Mock).mockResolvedValue(poolTicks);

        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress.toLowerCase(), {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress.toLowerCase(), balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        
        // LP position for different owner
        const wrongLpId = `${tokenAddress.toLowerCase()}-0xdifferentowner-0x1111111111111111111111111111111111111111-123`;
        
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(wrongLpId, {
            value: 200n,
            pool: '0x1111111111111111111111111111111111111111',
            lowerTick: 150, // Out of range
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // No deductions should happen due to mismatched owner
        const updatedBalance = balanceMap.get(ownerAddress.toLowerCase());
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([500n, 500n, 500n]);
      });

      it('should handle getPoolsTick failures gracefully', async () => {
        // Mock getPoolsTick to throw an error
        (getPoolsTick as Mock).mockRejectedValue(new Error('Network error'));

        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress.toLowerCase(), {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress.toLowerCase(), balanceMap);

        // Should throw the error from getPoolsTick
        await expect(processor.processLpRange()).rejects.toThrow('Network error');
      });

      it('should process different snapshots independently', async () => {
        // Different ticks for different snapshots
        (getPoolsTick as Mock)
          .mockResolvedValueOnce({ '0x1111111111111111111111111111111111111111': 100 }) // Snapshot 1000
          .mockResolvedValueOnce({ '0x1111111111111111111111111111111111111111': 200 }) // Snapshot 2000
          .mockResolvedValueOnce({ '0x1111111111111111111111111111111111111111': 300 }); // Snapshot 3000

        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        const poolAddress = '0x1111111111111111111111111111111111111111';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress.toLowerCase(), {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress.toLowerCase(), balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        const lpId = `${tokenAddress.toLowerCase()}-${ownerAddress.toLowerCase()}-${poolAddress.toLowerCase()}-123`;
        
        for (const snapshot of snapshots) {
          // Position range 150-250
          // Tick 100 (out of range), Tick 200 (in range), Tick 300 (out of range)
          lpTrackList[snapshot].set(lpId, {
            value: 100n,
            pool: poolAddress.toLowerCase(),
            lowerTick: 150,
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // Only snapshots 0 and 2 should have deductions (ticks 100 and 300 are out of range)
        const updatedBalance = balanceMap.get(ownerAddress.toLowerCase());
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([400n, 500n, 400n]); // Deduct 100n for snapshots 0 and 2
      });
    });
  });
});
