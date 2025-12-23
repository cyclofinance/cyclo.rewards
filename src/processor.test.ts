import { describe, it, expect, beforeEach } from "vitest";
import { Processor } from "./processor";
import { LiquidityChange, LiquidityChangeType, Transfer } from "./types";
import { CYTOKENS } from "./config";

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
          timestamp: 1000,
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
          timestamp: 1000,
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
});
