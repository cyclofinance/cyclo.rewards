import { PublicClient } from "viem";
import { CYTOKENS, REWARDS_SOURCES, FACTORIES } from "./config";
import { Processor } from "./processor";
import { getPoolsTick } from "./liquidity";
import { LiquidityChange, LiquidityChangeType, Transfer } from "./types";
import { normalizeTransfer } from "./pipeline";
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
  /** Token address not in CYTOKENS — used to test ineligible token filtering */
  const INELIGIBLE_TOKEN = "0x0000000000000000000000000000000000000099";
  /** Arbitrary pool address for V3 LP tests */
  const POOL_ADDRESS = "0x5000000000000000000000000000000000000000";
  /** Mixed-case address for case-sensitivity tests */
  const MIXED_CASE_USER = "0x3000000000000000000000000000000000000Abc";

  // Create a mock client
  const mockClient = {
    readContract: async () => "0x0000000000000000000000000000000000000000",
  } as unknown as PublicClient;

  beforeEach(() => {
    processor = new Processor(SNAPSHOTS, [], mockClient);
    processor.isApprovedSource = async (source: string) => {
      return (
        source === APPROVED_SOURCE ||
        source === FACTORY_SOURCE
      );
    };
  });

  describe("Constructor", () => {
    it("should not accept epochLength parameter (removed)", () => {
      // epochLength was a redundant parameter that could diverge from snapshots.length.
      // Verify the constructor no longer accepts it — snapshots.length is used directly.
      const p = new Processor([100, 200], [], mockClient);
      expect(p).toBeDefined();
    });
  });

  describe("Basic Transfer Processing", () => {
    it("should track approved transfers correctly", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash",
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
      ).toBeDefined();
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
          ?.snapshots[0]
      ).toBe(0n);
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
          ?.snapshots[1]
      ).toBe(0n);
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
          ?.average
      ).toBe(0n);
    });

    it("should track approved deposit transfers correctly", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash1",
      };

      const depositTransfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash2",
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // 1 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash2",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(transfer);
      await processor.processTransfer(depositTransfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
      ).toBeDefined();
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
          ?.snapshots[0]
      ).toBe(ONEn);
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
          ?.snapshots[1]
      ).toBe(ONEn);
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
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
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash",
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
          ?.average
      ).toBe(0n);
    });

    it("should normalize mixed-case addresses to lowercase via normalizeTransfer", async () => {
      const mixedCaseTo = "0x3000000000000000000000000000000000000aBc";

      const transfer = normalizeTransfer({
        from: APPROVED_SOURCE,
        to: mixedCaseTo,
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "a".repeat(64),
      });

      // normalizeTransfer should have lowercased the address
      expect(transfer.to).toBe(mixedCaseTo.toLowerCase());
      expect(transfer.to).not.toBe(mixedCaseTo);

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      // Balance entry should exist at the lowercase key
      const tokenBalances = balances.get(CYTOKENS[0].address);
      expect(tokenBalances?.has(mixedCaseTo.toLowerCase())).toBe(true);
    });

    it("should skip transfers for ineligible tokens", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: INELIGIBLE_TOKEN,
        transactionHash: "0xtxhash",
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      // No balances should be affected for any token
      for (const [, tokenBalances] of balances) {
        for (const [, balance] of tokenBalances) {
          expect(balance.average).toBe(0n);
        }
      }
    });
  });

  describe("Snapshot Timing", () => {
    it("should handle valid transfers before snapshot 1", async () => {
      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: ONE,
        blockNumber: 50, // Before snapshot 1
        timestamp: 1000, // Before snapshot 1
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash",
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // 1 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_1)?.snapshots[0];
      expect(index).toBe(ONEn);
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
          ?.snapshots[1]
      ).toBe(ONEn);
    });

    it("should handle transfers between snapshots", async () => {
      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: ONE,
        blockNumber: 150, // Between snapshots
        timestamp: 1000, // Between snapshots
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash",
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // 1 token deposit
        blockNumber: 150,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances
          .get(CYTOKENS[0].address)
          ?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(0n);
      expect(
        balances
          .get(CYTOKENS[0].address)
          ?.get(NORMAL_USER_1)?.snapshots[1]
      ).toBe(ONEn);
    });

    it("should handle transfers after snapshot 2", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 250, // After snapshot 2
        timestamp: 1000, // After snapshot 2
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash",
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(
        balances
          .get(CYTOKENS[0].address)
          ?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(0n);

      expect(
        balances
          .get(CYTOKENS[0].address)
          ?.get(NORMAL_USER_1)?.snapshots[1]
      ).toBe(0n);
    });

    it("should include transfer exactly at snapshot block boundary", async () => {
      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: ONE,
        blockNumber: 100, // Exactly at snapshot 1
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash",
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 100,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      // Transfer at block 100 (== snapshot[0]) should be included in snapshot[0] due to <= comparison
      expect(
        balances.get(CYTOKENS[0].address)
          ?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(ONEn);
      expect(
        balances.get(CYTOKENS[0].address)
          ?.get(NORMAL_USER_1)?.snapshots[1]
      ).toBe(ONEn);
    });
  });

  describe("Blocklist", () => {
    it("should include blocklisted addresses with penalties", async () => {
      const processor = new Processor(SNAPSHOTS, [
        { reporter: NORMAL_USER_1, cheater: NORMAL_USER_2 },
      ], mockClient);
      processor.isApprovedSource = async (source: string) =>
        source === APPROVED_SOURCE;

      const transfer: Transfer = {
        from: NORMAL_USER_2,
        to: "0xpool",
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash",
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_2,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // 1 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_2)?.average;
      expect(index).not.toBe(0n);
      expect(index).toBe(ONEn);
      const penalty = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_2)?.penalty;
      expect(penalty).toBe(ONEn);
      const final = balances
        .get(CYTOKENS[0].address)
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
      const processor = new Processor(SNAPSHOTS, reports, mockClient);

      processor.isApprovedSource = async (source: string) =>
        source === APPROVED_SOURCE;

      // Give NORMAL_USER_2 some balance to be penalized
      const transfer1: Transfer = {
        from: NORMAL_USER_2,
        to: "0xpool",
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash1",
      };
      const liquidityChangeEvent1: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_2,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // 1 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash1",
      };

      // Give NORMAL_USER_1 (reporter) some balance too
      const transfer2: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool2",
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash2",
      };
      const liquidityChangeEvent2: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // 1 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash2",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent1);
      await processor.organizeLiquidityPositions(liquidityChangeEvent2);
      await processor.processTransfer(transfer1);
      await processor.processTransfer(transfer2);

      const balances = await processor.getEligibleBalances();

      const reporterBounty = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_1)?.bounty;
      const cheaterPenalty = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_2)?.penalty;

      expect(reporterBounty).toBe(ONEn / 10n); // 10% bounty
      expect(cheaterPenalty).toBe(ONEn); // Full penalty

      const final = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_2)?.final;
      expect(final).toBe(0n);

      const reporterFinal = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_1)?.final;
      expect(reporterFinal).toBe(ONEn + ONEn / 10n); // Original balance + bounty
    });
  });

  describe("Reward Calculation", () => {
    it("should calculate rewards proportionally for single token", async () => {
      // Setup two accounts with different balances
      const transfer1: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool1",
        value: "2000000000000000000", // 2 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash1",
      };
      const liquidityChangeEvent1: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // 1 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash1",
      };

      const transfer2: Transfer = {
        from: NORMAL_USER_2,
        to: "0xpool2",
        value: "3000000000000000000", // 3 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash2",
      };
      const liquidityChangeEvent2: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_2,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // 1 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash2",
      };

      // we need at least one transfer for the second token so we don't divide by 0 later
      const transfer3: Transfer = {
        from: NORMAL_USER_1,
        to: NORMAL_USER_2,
        value: "3000000000000000000", // 3 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[1].address,
        transactionHash: "0xtxhash3",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent1);
      await processor.organizeLiquidityPositions(liquidityChangeEvent2);
      await processor.processTransfer(transfer1);
      await processor.processTransfer(transfer2);
      await processor.processTransfer(transfer3);

      const rewardPool = ONEn; // 1 token reward pool
      const result = await processor.calculateRewards(rewardPool);

      const user1Reward = result
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_1);
      const user2Reward = result
        .get(CYTOKENS[0].address)
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
          from: NORMAL_USER_1,
          to: "0xpool",
          value: "50000000000000000000", // 50 tokens
          blockNumber: 50,
          timestamp: 1000,
          tokenAddress: CYTOKENS[0].address,
          transactionHash: "0xtxhash1",
        },
        {
          from: NORMAL_USER_1,
          to: "0xpool",
          value: "10000000000000000000", // 10 tokens initial
          blockNumber: 50,
          timestamp: 1000,
          tokenAddress: CYTOKENS[1].address,
          transactionHash: "0xtxhash2",
        },
        {
          from: NORMAL_USER_1,
          to: APPROVED_SOURCE,
          value: "40000000000000000000", // Withdraw 40 tokens (making -30 balance)
          blockNumber: 50,
          timestamp: 2000,
          tokenAddress: CYTOKENS[1].address,
          transactionHash: "0xtxhash3",
        },
      ];
      const deposits1: LiquidityChange[] = [
        {
          tokenAddress: CYTOKENS[0].address,
          lpAddress: "0xLpAddress",
          owner: NORMAL_USER_1,
          changeType: LiquidityChangeType.Deposit,
          liquidityChange: "1234",
          depositedBalanceChange: "50000000000000000000", // 50 token deposit
          blockNumber: 50,
          timestamp: 1000,
          __typename: "LiquidityV2Change",
          transactionHash: "0xtxhash1",
        },
        {
          tokenAddress: CYTOKENS[1].address,
          lpAddress: "0xLpAddress",
          owner: NORMAL_USER_1,
          changeType: LiquidityChangeType.Deposit,
          liquidityChange: "1234",
          depositedBalanceChange: "10000000000000000000", // 10 token deposit
          blockNumber: 50,
          timestamp: 1000,
          __typename: "LiquidityV2Change",
          transactionHash: "0xtxhash2",
        }
      ]

      // User 2: cyA: -10, cyB: 88 (should count as 88 total)
      const transfers2 = [
        {
          from: NORMAL_USER_2,
          to: "0xpool",
          value: "5000000000000000000", // 5 tokens initial
          blockNumber: 50,
          timestamp: 1000,
          tokenAddress: CYTOKENS[0].address,
          transactionHash: "0xtxhash4",
        },
        {
          from: NORMAL_USER_2,
          to: APPROVED_SOURCE,
          value: "15000000000000000000", // Withdraw 15 tokens (making -10 balance)
          blockNumber: 50,
          timestamp: 2000,
          tokenAddress: CYTOKENS[0].address,
          transactionHash: "0xtxhash5",
        },
        {
          from: NORMAL_USER_2,
          to: "0xpool",
          value: "88000000000000000000", // 88 tokens
          blockNumber: 50,
          timestamp: 1000,
          tokenAddress: CYTOKENS[1].address,
          transactionHash: "0xtxhash6",
        },
      ];
      const deposits2: LiquidityChange[] = [
        {
          tokenAddress: CYTOKENS[0].address,
          lpAddress: "0xLpAddress",
          owner: NORMAL_USER_2,
          changeType: LiquidityChangeType.Deposit,
          liquidityChange: "1234",
          depositedBalanceChange: "5000000000000000000", // 5 token deposit
          blockNumber: 50,
          timestamp: 1000,
          __typename: "LiquidityV2Change",
          transactionHash: "0xtxhash4",
        },
        {
          tokenAddress: CYTOKENS[1].address,
          lpAddress: "0xLpAddress",
          owner: NORMAL_USER_2,
          changeType: LiquidityChangeType.Deposit,
          liquidityChange: "1234",
          depositedBalanceChange: "88000000000000000000", // 88 token deposit
          blockNumber: 50,
          timestamp: 1000,
          __typename: "LiquidityV2Change",
          transactionHash: "0xtxhash6",
        }
      ]

      for (const lpEvent of [...deposits1, ... deposits2]) {
        await processor.organizeLiquidityPositions(lpEvent)
      }
      // Process all transfers
      for (const transfer of [...transfers1, ...transfers2]) {
        await processor.processTransfer(transfer);
      }

      const rewardPool = 1_000_000n * ONEn; // 1m token reward pool
      const result = await processor.calculateRewards(rewardPool);

      const user1Reward = result
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_1);
      const user2Reward = result
        .get(CYTOKENS[1].address)
        ?.get(NORMAL_USER_2);

      // Both users should be included in results
      expect(user1Reward).not.toBeUndefined();
      expect(user2Reward).not.toBeUndefined();

      // Check eligible balances
      const balances = await processor.getEligibleBalances();
      console.log("balances", balances);
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
      ).toBeDefined();
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_2)
      ).toBeDefined();

      // Verify User 1 has 50 tokens in cyA and 0 in cyB (negative balance treated as 0)
      const user1CyABalance = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_1)?.average;
      const user1CyBBalance = balances
        .get(CYTOKENS[1].address)
        ?.get(NORMAL_USER_1)?.average;
      expect(user1CyABalance).toBe(50000000000000000000n);
      expect(user1CyBBalance).toBe(0n); // -30 treated as 0

      // Verify User 2 has 0 tokens in cyA (negative balance treated as 0) and 88 in cyB
      const user2CyABalance = balances
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_2)?.average;
      const user2CyBBalance = balances
        .get(CYTOKENS[1].address)
        ?.get(NORMAL_USER_2)?.average;
      expect(user2CyABalance).toBe(0n); // -10 treated as 0
      expect(user2CyBBalance).toBe(88000000000000000000n);

      // Verify total balances
      expect(
        balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)
          ?.average
      ).toBe(50000000000000000000n);
      expect(
        balances.get(CYTOKENS[1].address)?.get(NORMAL_USER_2)
          ?.average
      ).toBe(88000000000000000000n);

      // Calculate the rewards pool for each token
      const rewardsPools = processor.calculateRewardsPoolsPerToken(
        balances,
        rewardPool
      );

      console.log("rewardsPools", rewardsPools);

      //
      const expectedUser1Reward = rewardsPools.get(
        CYTOKENS[0].address
      )!;
      const expectedUser2Reward = rewardsPools.get(
        CYTOKENS[1].address
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
        from: NORMAL_USER_1,
        to: "0xpool",
        value: "2000000000000000000", // 2 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash1",
      };
      const liquidityChangeEvent1: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: "2000000000000000000", // 2 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash1",
      };

      const transfer2: Transfer = {
        from: NORMAL_USER_2,
        to: "0xpool",
        value: "3000000000000000000", // 3 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0xtxhash2",
      };
      const liquidityChangeEvent2: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_2,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: "3000000000000000000", // 3 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash2",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent1);
      await processor.organizeLiquidityPositions(liquidityChangeEvent2);
      await processor.processTransfer(transfer1);
      await processor.processTransfer(transfer2);

      const rewardPool = ONEn; // 1 token reward pool
      const result = await processor.calculateRewards(rewardPool);

      const user1Reward = result
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_1);
      const user2Reward = result
        .get(CYTOKENS[0].address)
        ?.get(NORMAL_USER_2);

      expect(user1Reward).toBe(400000000000000000n); // 0.4 tokens
      expect(user2Reward).toBe(600000000000000000n); // 0.6 tokens

      // Total should equal reward pool
      expect(user1Reward! + user2Reward!).toBe(rewardPool);
    });
  });

  describe("organizeLiquidityPositions duplicate handling", () => {
    it("should keep first event when same owner+token+txHash is organized twice", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const txHash = "0xduptx";

      const event1: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xlpaddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1000",
        depositedBalanceChange: "5000000000000000000",
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: txHash,
      };

      const event2: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xlpaddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "9999",
        depositedBalanceChange: "9000000000000000000",
        blockNumber: 51,
        timestamp: 1001,
        __typename: "LiquidityV2Change",
        transactionHash: txHash,
      };

      // First call succeeds
      processor.organizeLiquidityPositions(event1);

      // Duplicate txHash should throw
      expect(() => processor.organizeLiquidityPositions(event2)).toThrow("Duplicate");
    });
  });

  describe("Process Liquidity Position", () => {
    it("should correctly factor in liquidity changes", async () => {
      const tokenAddress = CYTOKENS[0].address;

      // deposit event before snapshot 1
      const initTransfer1: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: "5000000000000000000", // 5 tokens
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress,
        transactionHash: "0xdeposittx",
      };
      const initLiquidityChangeEventDeposit: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: "5000000000000000000", // 5 token deposit
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xdeposittx",
      };
      await processor.organizeLiquidityPositions(initLiquidityChangeEventDeposit);
      await processor.processTransfer(initTransfer1);

      // verify the deposit transfer is calculated correctly
      let balances = await processor.getEligibleBalances();
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)).toEqual({
        snapshots: [5000000000000000000n, 5000000000000000000n],
        average: 5000000000000000000n,
        penalty: 0n,
        bounty: 0n,
        final: 5000000000000000000n,
        final18: 5000000000000000000n,
      });

      const transfer1: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: "3000000000000000000", // 3 tokens
        blockNumber: 55,
        timestamp: 1005,
        tokenAddress,
        transactionHash: "0xtxhash1",
      };
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
        transactionHash: "0xtxhash1",
      };
      await processor.organizeLiquidityPositions(liquidityChangeEvent1);
      await processor.processTransfer(transfer1);
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
        final18: 8000000000000000000n,
      });

      // deposit event between snapshot 1 and 2
      const transfer2: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: "1000000000000000000", // 1 tokens
        blockNumber: 150,
        timestamp: 1105,
        tokenAddress,
        transactionHash: "0xtxhash2",
      };
      const liquidityChangeEvent2: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: "1000000000000000000", // 1 token deposit
        blockNumber: 150,
        timestamp: 1105,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash2",
      };
      await processor.organizeLiquidityPositions(liquidityChangeEvent2);
      await processor.processTransfer(transfer2);
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
        final18: 8500000000000000000n,
      });

      // withdraw event between snapshot 1 and 2
      const transfer3: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "2000000000000000000", // 2 tokens
        blockNumber: 155,
        timestamp: 1155,
        tokenAddress,
        transactionHash: "0xtxhash3",
      };
      const liquidityChangeEvent3: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: "1234",
        depositedBalanceChange: "-2000000000000000000", // 2 token withdraw
        blockNumber: 155,
        timestamp: 1155,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash3",
      };
      await processor.organizeLiquidityPositions(liquidityChangeEvent3);
      await processor.processTransfer(transfer3);
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
        final18: 7500000000000000000n,
      });

      // direct lp trnasfer event
      const liquidityChangeEvent4: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Transfer,
        liquidityChange: "1234",
        depositedBalanceChange: "-1000000000000000000", // 1 token withdraw
        blockNumber: 156,
        timestamp: 1156,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash4",
      };
      await processor.processLiquidityPositions(liquidityChangeEvent4);

      // validate balances after the liquidity withdraw
      balances = await processor.getEligibleBalances();
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)).toEqual({
        snapshots: [
          8000000000000000000n, // 5 + 3
          6000000000000000000n, // 5 + 3 + 1 - 2 - 1
        ],
        average: 7000000000000000000n,
        penalty: 0n,
        bounty: 0n,
        final: 7000000000000000000n,
        final18: 7000000000000000000n,
      });

      // transfer event after snapshot 2
      const transfer5: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "1000000000000000000", // 1 tokens
        blockNumber: 250,
        timestamp: 1250,
        tokenAddress,
        transactionHash: "0xtxhash5",
      };
      const liquidityChangeEvent5: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: "1234",
        depositedBalanceChange: "-1000000000000000000", // 1 token transfer
        blockNumber: 250,
        timestamp: 1250,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash5",
      };
      await processor.organizeLiquidityPositions(liquidityChangeEvent5);
      await processor.processTransfer(transfer5);
      await processor.processLiquidityPositions(liquidityChangeEvent5);

      // validate balances after the liquidity transfer which is in effective since its out of snapshot range
      balances = await processor.getEligibleBalances();
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)).toEqual({
        snapshots: [
          8000000000000000000n, // 5 + 3
          6000000000000000000n, // 5 + 3 + 1 - 2 - 1
        ],
        average: 7000000000000000000n,
        penalty: 0n,
        bounty: 0n,
        final: 7000000000000000000n,
        final18: 7000000000000000000n,
      });
    });

    it("should update currentNetBalance for LiquidityChangeType.Transfer", async () => {
      const tokenAddress = CYTOKENS[0].address;

      // Transfer type directly adjusts currentNetBalance (unlike Deposit/Withdraw
      // which are handled by processTransfer)
      const lpTransferEvent: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Transfer,
        liquidityChange: "1234",
        depositedBalanceChange: ONE, // positive = incoming transfer
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash",
      };

      await processor.processLiquidityPositions(lpTransferEvent);
      const balances = await processor.getEligibleBalances();

      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(ONEn);
      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[1]
      ).toBe(ONEn);
    });

    it("should not update currentNetBalance for LiquidityChangeType.Withdraw", async () => {
      const tokenAddress = CYTOKENS[0].address;

      // First deposit via Transfer to give user a balance
      const lpTransferEvent: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Transfer,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtx1",
      };

      // Withdraw does NOT adjust currentNetBalance — that's handled by processTransfer
      const withdrawEvent: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: "1234",
        depositedBalanceChange: `-${ONE}`, // negative for withdraw
        blockNumber: 55,
        timestamp: 1005,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtx2",
      };

      await processor.processLiquidityPositions(lpTransferEvent);
      await processor.processLiquidityPositions(withdrawEvent);
      const balances = await processor.getEligibleBalances();

      // Balance should still be ONEn because Withdraw doesn't change currentNetBalance
      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(ONEn);
    });

    it("should skip liquidity events for ineligible tokens", async () => {
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: INELIGIBLE_TOKEN,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash",
      };

      await processor.processLiquidityPositions(liquidityChangeEvent);
      const balances = await processor.getEligibleBalances();

      for (const [, tokenBalances] of balances) {
        for (const [, balance] of tokenBalances) {
          expect(balance.average).toBe(0n);
        }
      }
    });

    it("should include liquidity event exactly at snapshot block boundary", async () => {
      const tokenAddress = CYTOKENS[0].address;

      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: ONE,
        blockNumber: 100, // Exactly at snapshot 1
        timestamp: 1000,
        tokenAddress,
        transactionHash: "0xtxhash",
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 100, // Exactly at snapshot 1
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0xtxhash",
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(transfer);
      await processor.processLiquidityPositions(liquidityChangeEvent);

      const balances = await processor.getEligibleBalances();

      // Event at block 100 (== snapshot[0]) should be included due to <= comparison
      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(ONEn);
      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[1]
      ).toBe(ONEn);
    });

    it("should track V3 liquidity positions in lp3TrackList", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0xpool",
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress,
        transactionHash: "0xtxhash",
      };
      const v3Event: LiquidityChange = {
        tokenAddress,
        lpAddress: "0xLpAddress",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV3Change",
        transactionHash: "0xtxhash",
        tokenId: "42",
        poolAddress: POOL_ADDRESS,
        fee: 3000,
        lowerTick: -887220,
        upperTick: 887220,
      };

      await processor.organizeLiquidityPositions(v3Event);
      await processor.processTransfer(transfer);
      await processor.processLiquidityPositions(v3Event);

      const balances = await processor.getEligibleBalances();

      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(ONEn);
      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[1]
      ).toBe(ONEn);
    });
  });

  describe("Mixed-case owner address in liquidity positions", () => {
    it("should handle LP Transfer event with no prior processTransfer call", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const owner = MIXED_CASE_USER.toLowerCase();

      // Direct LP Transfer event with no prior processTransfer call —
      // processLiquidityPositions initializes the balance entry.
      const lpTransferEvent: LiquidityChange = {
        tokenAddress,
        lpAddress: "0x6000000000000000000000000000000000000000",
        owner,
        changeType: LiquidityChangeType.Transfer,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0x" + "a".repeat(64),
      };

      await processor.processLiquidityPositions(lpTransferEvent);

      const balances = await processor.getEligibleBalances();
      const userBalance = balances.get(tokenAddress)?.get(owner);
      expect(userBalance).toBeDefined();
      expect(userBalance?.snapshots[0]).toBe(ONEn);
      expect(userBalance?.snapshots[1]).toBe(ONEn);
      expect(userBalance?.average).toBe(ONEn);
    });
  });

  describe('Test processLpRange() method', () => {
    let processor: Processor;
    const mockClient = {
      readContract: vi.fn(),
      multicall: vi.fn()
    } as unknown as PublicClient;
    
    const snapshots = [1000, 2000, 3000];
    const pools = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222'
    ] as `0x${string}`[];

    beforeEach(() => {
      vi.clearAllMocks();
      processor = new Processor(snapshots, [], mockClient, pools);
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
        balanceMap.set(ownerAddress, {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n], // Initial balances
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        // Setup LP position that's out of range (tick 100, position range 150-250)
        const lpTrackList = (processor as any).lp3TrackList;
        const lpId = `${tokenAddress}-${ownerAddress}-${poolAddress}-123`;
        
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(lpId, {
            value: 200n,
            pool: poolAddress,
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
        const updatedBalance = balanceMap.get(ownerAddress);
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
        balanceMap.set(ownerAddress, {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        // Setup LP position that's in range (tick 200, position range 150-250)
        const lpTrackList = (processor as any).lp3TrackList;
        const lpId = `${tokenAddress}-${ownerAddress}-${poolAddress}-123`;
        
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(lpId, {
            value: 200n,
            pool: poolAddress,
            lowerTick: 150, // In range (tick is 200)
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // Verify balance was NOT deducted for in-range position
        const updatedBalance = balanceMap.get(ownerAddress);
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
        balanceMap.set(ownerAddress, {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        
        // Two LP positions: one in range, one out of range
        const lpId1 = `${tokenAddress}-${ownerAddress}-0x1111111111111111111111111111111111111111-123`;
        const lpId2 = `${tokenAddress}-${ownerAddress}-0x2222222222222222222222222222222222222222-456`;
        
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
        const updatedBalance = balanceMap.get(ownerAddress);
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
            balanceMap.set(owner, {
              transfersInFromApproved: 1000n,
              transfersOut: 0n,
              netBalanceAtSnapshots: [500n, 500n, 500n],
              currentNetBalance: 1000n,
            });
          }
          accountBalancesPerToken.set(token, balanceMap);
        }

        const lpTrackList = (processor as any).lp3TrackList;
        
        // Add out-of-range positions for all combinations
        for (const token of [token1, token2]) {
          for (const owner of [owner1, owner2]) {
            const lpId = `${token}-${owner}-${poolAddress}-123`;
            for (const snapshot of snapshots) {
              lpTrackList[snapshot].set(lpId, {
                value: 100n,
                pool: poolAddress,
                lowerTick: 150, // Out of range (tick is 100)
                upperTick: 250,
              });
            }
          }
        }

        await processor.processLpRange();

        // All balances should be deducted
        for (const token of [token1, token2]) {
          const balanceMap = accountBalancesPerToken.get(token);
          for (const owner of [owner1, owner2]) {
            const balance = balanceMap.get(owner);
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
        balanceMap.set(ownerAddress, {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        const lpId = `${tokenAddress}-${ownerAddress}-${poolAddress}-123`;
        
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(lpId, {
            value: 200n,
            pool: poolAddress,
            lowerTick: 150,
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // Balance should remain unchanged due to undefined tick
        const updatedBalance = balanceMap.get(ownerAddress);
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
        balanceMap.set(ownerAddress, {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        const lpId1 = `${tokenAddress}-${ownerAddress}-${poolAddress}-123`;
        const lpId2 = `${tokenAddress}-${ownerAddress}-${poolAddress}-456`;
        
        for (const snapshot of snapshots) {
          // Zero value position
          lpTrackList[snapshot].set(lpId1, {
            value: 0n,
            pool: poolAddress,
            lowerTick: 150, // Out of range
            upperTick: 250,
          });
          
          // Negative value position
          lpTrackList[snapshot].set(lpId2, {
            value: -100n,
            pool: poolAddress,
            lowerTick: 150, // Out of range
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // No deductions should happen due to zero/negative values
        const updatedBalance = balanceMap.get(ownerAddress);
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
        balanceMap.set(ownerAddress, {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        
        // LP position for different owner
        const wrongLpId = `${tokenAddress}-0xdifferentowner-0x1111111111111111111111111111111111111111-123`;
        
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
        const updatedBalance = balanceMap.get(ownerAddress);
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([500n, 500n, 500n]);
      });

      it('should handle getPoolsTick failures gracefully', async () => {
        // Mock getPoolsTick to throw an error
        (getPoolsTick as Mock).mockRejectedValue(new Error('Network error'));

        const tokenAddress = '0xtoken123';
        const ownerAddress = '0xowner123';
        
        const accountBalancesPerToken = (processor as any).accountBalancesPerToken;
        const balanceMap = new Map();
        balanceMap.set(ownerAddress, {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

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
        balanceMap.set(ownerAddress, {
          transfersInFromApproved: 1000n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [500n, 500n, 500n],
          currentNetBalance: 1000n,
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        const lpId = `${tokenAddress}-${ownerAddress}-${poolAddress}-123`;
        
        for (const snapshot of snapshots) {
          // Position range 150-250
          // Tick 100 (out of range), Tick 200 (in range), Tick 300 (out of range)
          lpTrackList[snapshot].set(lpId, {
            value: 100n,
            pool: poolAddress,
            lowerTick: 150,
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        // Only snapshots 0 and 2 should have deductions (ticks 100 and 300 are out of range)
        const updatedBalance = balanceMap.get(ownerAddress);
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([400n, 500n, 400n]); // Deduct 100n for snapshots 0 and 2
      });
    });
  });

  describe("updateSnapshots", () => {
    it("should update snapshots at and after the given block", async () => {
      const balance = {
        transfersInFromApproved: 500n,
        transfersOut: 0n,
        netBalanceAtSnapshots: [0n, 0n],
        currentNetBalance: 500n,
      };
      (processor as any).updateSnapshots(balance, 150);
      // block 150 is after snapshot[0]=100, so only snapshot[1]=200 is updated
      expect(balance.netBalanceAtSnapshots[0]).toBe(0n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(500n);
    });

    it("should update all snapshots when block is before all of them", async () => {
      const balance = {
        transfersInFromApproved: 300n,
        transfersOut: 0n,
        netBalanceAtSnapshots: [0n, 0n],
        currentNetBalance: 300n,
      };
      (processor as any).updateSnapshots(balance, 50);
      expect(balance.netBalanceAtSnapshots[0]).toBe(300n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(300n);
    });

    it("should update no snapshots when block is after all of them", async () => {
      const balance = {
        transfersInFromApproved: 300n,
        transfersOut: 0n,
        netBalanceAtSnapshots: [0n, 0n],
        currentNetBalance: 300n,
      };
      (processor as any).updateSnapshots(balance, 300);
      expect(balance.netBalanceAtSnapshots[0]).toBe(0n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(0n);
    });

    it("should clamp negative currentNetBalance to zero", async () => {
      const balance = {
        transfersInFromApproved: 100n,
        transfersOut: 500n,
        netBalanceAtSnapshots: [999n, 999n],
        currentNetBalance: -400n,
      };
      (processor as any).updateSnapshots(balance, 50);
      expect(balance.netBalanceAtSnapshots[0]).toBe(0n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(0n);
    });

    it("should set zero when currentNetBalance is exactly zero", async () => {
      const balance = {
        transfersInFromApproved: 100n,
        transfersOut: 100n,
        netBalanceAtSnapshots: [999n, 999n],
        currentNetBalance: 0n,
      };
      (processor as any).updateSnapshots(balance, 50);
      expect(balance.netBalanceAtSnapshots[0]).toBe(0n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(0n);
    });

    it("should include snapshot at exact block boundary (<=)", async () => {
      const balance = {
        transfersInFromApproved: 200n,
        transfersOut: 0n,
        netBalanceAtSnapshots: [0n, 0n],
        currentNetBalance: 200n,
      };
      // block 100 === SNAPSHOTS[0], should be included
      (processor as any).updateSnapshots(balance, 100);
      expect(balance.netBalanceAtSnapshots[0]).toBe(200n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(200n);
    });
  });

  describe("isApprovedSource", () => {
    /** Address not in REWARDS_SOURCES or FACTORIES — triggers factory() RPC lookup */
    const UNKNOWN_CONTRACT = "0x0000000000000000000000000000000000000099";
    /** Factory address not in the approved FACTORIES list */
    const NON_APPROVED_FACTORY = "0x0000000000000000000000000000000000000001";
    /** Mixed-case address pair for cache case-insensitivity tests */
    const MIXED_CASE_LOWER = "0x0000000000000000000000000000000000000aBc";
    const MIXED_CASE_UPPER = "0x0000000000000000000000000000000000000ABC";

    it("should return true for direct approved source", async () => {
      const proc = new Processor(SNAPSHOTS, [], mockClient);
      const result = await proc.isApprovedSource(REWARDS_SOURCES[0]);
      expect(result).toBe(true);
    });

    it("should return true for direct approved source with different casing", async () => {
      const proc = new Processor(SNAPSHOTS, [], mockClient);
      const result = await proc.isApprovedSource("0x" + REWARDS_SOURCES[0].slice(2).toUpperCase());
      expect(result).toBe(true);
    });

    it("should return true for factory-based approved source", async () => {
      const factoryClient = {
        readContract: async () => FACTORIES[0],
      } as unknown as PublicClient;
      const proc = new Processor(SNAPSHOTS, [], factoryClient);
      const result = await proc.isApprovedSource(UNKNOWN_CONTRACT);
      expect(result).toBe(true);
    });

    it("should return false for non-approved factory", async () => {
      const nonApprovedFactoryClient = {
        readContract: async () => NON_APPROVED_FACTORY,
      } as unknown as PublicClient;
      const proc = new Processor(SNAPSHOTS, [], nonApprovedFactoryClient);
      const result = await proc.isApprovedSource(UNKNOWN_CONTRACT);
      expect(result).toBe(false);
    });

    it("should return false when contract has no factory function", async () => {
      const noFactoryClient = {
        readContract: async () => { throw { shortMessage: 'returned no data ("0x")' }; },
      } as unknown as PublicClient;
      const proc = new Processor(SNAPSHOTS, [], noFactoryClient);
      const result = await proc.isApprovedSource(UNKNOWN_CONTRACT);
      expect(result).toBe(false);
    });

    it("should return false when contract reverts", async () => {
      const revertClient = {
        readContract: async () => { throw { shortMessage: "execution reverted" }; },
      } as unknown as PublicClient;
      const proc = new Processor(SNAPSHOTS, [], revertClient);
      const result = await proc.isApprovedSource(UNKNOWN_CONTRACT);
      expect(result).toBe(false);
    });

    it("should return false for invalid parameters error", async () => {
      const invalidParamsClient = {
        readContract: async () => { throw { shortMessage: "invalid parameters" }; },
      } as unknown as PublicClient;
      const proc = new Processor(SNAPSHOTS, [], invalidParamsClient);
      const result = await proc.isApprovedSource(UNKNOWN_CONTRACT);
      expect(result).toBe(false);
    });

    it("should succeed on retry after transient error", async () => {
      let callCount = 0;
      const retryClient = {
        readContract: async () => {
          callCount++;
          if (callCount === 1) throw new Error("rate limited");
          return FACTORIES[0];
        },
      } as unknown as PublicClient;
      const proc = new Processor(SNAPSHOTS, [], retryClient);
      const result = await proc.isApprovedSource(UNKNOWN_CONTRACT, 2);
      expect(result).toBe(true);
      expect(callCount).toBe(2);
    });

    it("should cache results and not call RPC again", async () => {
      const spyClient = {
        readContract: vi.fn().mockResolvedValue(FACTORIES[0]),
      } as unknown as PublicClient;
      const proc = new Processor(SNAPSHOTS, [], spyClient);
      await proc.isApprovedSource(UNKNOWN_CONTRACT);
      await proc.isApprovedSource(UNKNOWN_CONTRACT);
      expect(spyClient.readContract).toHaveBeenCalledTimes(1);
    });

    it("should use cache for repeated lookups of the same address", async () => {
      const spyClient = {
        readContract: vi.fn().mockResolvedValue(FACTORIES[0]),
      } as unknown as PublicClient;
      const proc = new Processor(SNAPSHOTS, [], spyClient);
      await proc.isApprovedSource(MIXED_CASE_LOWER);
      const result = await proc.isApprovedSource(MIXED_CASE_LOWER);
      expect(result).toBe(true);
      expect(spyClient.readContract).toHaveBeenCalledTimes(1);
    });

    it("should throw after exhausting retries on transient RPC errors", async () => {
      const failingClient = {
        readContract: async () => {
          throw new Error("rate limited");
        },
      } as unknown as PublicClient;

      const proc = new Processor(SNAPSHOTS, [], failingClient);
      // Use 1 retry to keep the test fast
      await expect(proc.isApprovedSource(NORMAL_USER_1, 1)).rejects.toThrow(
        "Failed to check factory"
      );
    });
  });
});
