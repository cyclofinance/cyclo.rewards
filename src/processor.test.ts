import { describe, it, expect, beforeEach } from "vitest";
import { Processor } from "./processor";
import { Transfer } from "./types";
import { CYTOKENS } from "./config";

describe("Processor", () => {
  let processor: Processor;
  const SNAPSHOT_1 = 100;
  const SNAPSHOT_2 = 200;

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
    processor = new Processor(SNAPSHOT_1, SNAPSHOT_2, [], mockClient);
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

      expect(balances.addresses).toContain(NORMAL_USER_1);
      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
          .snapshot1
      ).toBe(ONEn);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
          .snapshot2
      ).toBe(ONEn);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
          .average
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
      expect(balances.addresses).toHaveLength(0);
    });
  });

  describe("Snapshot Timing", () => {
    it("should handle transfers before snapshot 1", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 50, // Before snapshot 1
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
          .snapshot1
      ).toBe(ONEn);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
          .snapshot2
      ).toBe(ONEn);
    });

    it("should handle transfers between snapshots", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 150, // Between snapshots
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
          .snapshot1
      ).toBe(0n);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
          .snapshot2
      ).toBe(ONEn);
    });

    it("should handle transfers after snapshot 2", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 250, // After snapshot 2
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address.toLowerCase(),
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
      ).toBeUndefined();
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
      ).toBeUndefined();
    });
  });

  describe("Blocklist", () => {
    it("should include blocklisted addresses with penalties", async () => {
      const processor = new Processor(100, 200, [
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

      const index = balances.addresses.indexOf(NORMAL_USER_2);
      expect(index).not.toBe(-1);
      expect(
        balances.balancesByToken.get(CYTOKENS[0].address.toLowerCase())?.[index]
          .average
      ).toBe(ONEn);
      expect(balances.penalties[index]).toBe(ONEn);
      expect(balances.finalBalances[index]).toBe(0n);
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
      const processor = new Processor(100, 200, reports, mockClient);

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

      const reporterIndex = balances.addresses.indexOf(NORMAL_USER_1);
      const cheaterIndex = balances.addresses.indexOf(NORMAL_USER_2);

      expect(balances.bounties[reporterIndex]).toBe(100000000000000000n); // 10% bounty
      expect(balances.penalties[cheaterIndex]).toBe(ONEn); // Full penalty
      expect(balances.finalBalances[cheaterIndex]).toBe(0n);
      expect(balances.finalBalances[reporterIndex]).toBe(1100000000000000000n); // Original balance + bounty
    });
  });

  describe("Reward Calculation", () => {
    it("should calculate rewards proportionally", async () => {
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

      const user1Index = result.addresses.indexOf(NORMAL_USER_1);
      const user2Index = result.addresses.indexOf(NORMAL_USER_2);

      expect(result.rewards[user1Index]).toBe(400000000000000000n); // 0.4 tokens
      expect(result.rewards[user2Index]).toBe(600000000000000000n); // 0.6 tokens

      // Total should equal reward pool
      expect(
        result.rewards.reduce((sum: bigint, reward: bigint) => sum + reward, 0n)
      ).toBe(rewardPool);
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

      const user1Index = result.addresses.indexOf(NORMAL_USER_1);
      const user2Index = result.addresses.indexOf(NORMAL_USER_2);

      // Both users should be included in results
      expect(user1Index).not.toBe(-1);
      expect(user2Index).not.toBe(-1);

      // Check eligible balances
      const balances = await processor.getEligibleBalances();
      console.log("balances", balances);
      expect(balances.addresses).toContain(NORMAL_USER_1);
      expect(balances.addresses).toContain(NORMAL_USER_2);

      // Verify User 1 has 50 tokens in cyA and 0 in cyB (negative balance treated as 0)
      const user1CyABalance = balances.balancesByToken.get(
        CYTOKENS[0].address.toLowerCase()
      )?.[balances.addresses.indexOf(NORMAL_USER_1)]?.average;
      const user1CyBBalance = balances.balancesByToken.get(
        CYTOKENS[1].address.toLowerCase()
      )?.[balances.addresses.indexOf(NORMAL_USER_1)]?.average;
      expect(user1CyABalance).toBe(50000000000000000000n);
      expect(user1CyBBalance).toBe(0n); // -30 treated as 0

      // Verify User 2 has 0 tokens in cyA (negative balance treated as 0) and 88 in cyB
      const user2CyABalance = balances.balancesByToken.get(
        CYTOKENS[0].address.toLowerCase()
      )?.[balances.addresses.indexOf(NORMAL_USER_2)]?.average;
      const user2CyBBalance = balances.balancesByToken.get(
        CYTOKENS[1].address.toLowerCase()
      )?.[balances.addresses.indexOf(NORMAL_USER_2)]?.average;
      expect(user2CyABalance).toBe(0n); // -10 treated as 0
      expect(user2CyBBalance).toBe(88000000000000000000n);

      // Verify total balances
      expect(
        balances.totalAverageBalances[balances.addresses.indexOf(NORMAL_USER_1)]
      ).toBe(50000000000000000000n);
      expect(
        balances.totalAverageBalances[balances.addresses.indexOf(NORMAL_USER_2)]
      ).toBe(88000000000000000000n);

      // Calculate expected rewards based on the proportion of balances
      const totalEligible = 50n + 88n; // 138 tokens
      const expectedUser1Reward = (rewardPool * 50n) / totalEligible;
      const expectedUser2Reward = (rewardPool * 88n) / totalEligible;

      // Check that rewards match expected values
      expect(result.rewards[user1Index]).toBe(expectedUser1Reward);
      expect(result.rewards[user2Index]).toBe(expectedUser2Reward);

      // Total should equal reward pool
      expect(
        result.rewards.reduce((sum: bigint, reward: bigint) => sum + reward, 0n)
      ).toBeGreaterThanOrEqual(rewardPool - 10n);
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

      const user1Index = result.addresses.indexOf(NORMAL_USER_1);
      const user2Index = result.addresses.indexOf(NORMAL_USER_2);

      expect(result.rewards[user1Index]).toBe(400000000000000000n); // 0.4 tokens
      expect(result.rewards[user2Index]).toBe(600000000000000000n); // 0.6 tokens

      // Total should equal reward pool
      expect(
        result.rewards.reduce((sum: bigint, reward: bigint) => sum + reward, 0n)
      ).toBe(rewardPool);
    });
  });
});
