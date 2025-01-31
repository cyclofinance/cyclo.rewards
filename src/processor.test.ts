import { describe, it, expect, beforeEach } from "vitest";
import { Processor } from "./processor";
import { Transfer } from "./types";

describe("Processor", () => {
  let processor: Processor;
  // Jan-16-2025 23:45:56 UTC
  const SNAPSHOT_1 = 36184881;
  // Jan-30-2025 05:56:43 UTC
  const SNAPSHOT_2 = 36784881;

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
    processor = new Processor(SNAPSHOT_1, SNAPSHOT_2, [], [], mockClient);
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
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      expect(balances.addresses).toContain(NORMAL_USER_1);
      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(balances.snapshot1Balances[index]).toBe(ONEn);
      expect(balances.snapshot2Balances[index]).toBe(ONEn);
      expect(balances.averageBalances[index]).toBe(ONEn);
    });

    it("should not track unapproved transfers", async () => {
      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: NORMAL_USER_2,
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
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
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(balances.snapshot1Balances[index]).toBe(ONEn);
      expect(balances.snapshot2Balances[index]).toBe(ONEn);
    });

    it("should handle transfers between snapshots", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 150, // Between snapshots
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(balances.snapshot1Balances[index]).toBe(0n);
      expect(balances.snapshot2Balances[index]).toBe(ONEn);
    });

    it("should handle transfers after snapshot 2", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 250, // After snapshot 2
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(balances.snapshot1Balances[index]).toBe(0n);
      expect(balances.snapshot2Balances[index]).toBe(ONEn); // Should match current balance
    });
  });

  describe("Blocklist", () => {
    it("should include blocklisted addresses with penalties", async () => {
      const processor = new Processor(100, 200, [NORMAL_USER_1.toLowerCase()]);
      processor.isApprovedSource = async (source: string) =>
        source.toLowerCase() === APPROVED_SOURCE.toLowerCase();

      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const balances = await processor.getEligibleBalances();

      const index = balances.addresses.indexOf(NORMAL_USER_1);
      expect(index).not.toBe(-1);
      expect(balances.averageBalances[index]).toBe(ONEn);
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
      const processor = new Processor(
        100,
        200,
        [NORMAL_USER_2.toLowerCase()], // Add the cheater to blocklist
        reports,
        mockClient
      );

      processor.isApprovedSource = async (source: string) =>
        source.toLowerCase() === APPROVED_SOURCE.toLowerCase();

      // Give NORMAL_USER_2 some balance to be penalized
      const transfer1: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_2,
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
      };

      // Give NORMAL_USER_1 (reporter) some balance too
      const transfer2: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE, // 1 token
        blockNumber: 50,
        timestamp: 1000,
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
      };

      const transfer2: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_2,
        value: "3000000000000000000", // 3 tokens
        blockNumber: 50,
        timestamp: 1000,
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
