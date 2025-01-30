import { describe, it, expect, beforeEach } from "vitest";
import { Processor } from "./processor";
import { Transfer } from "./types";

describe("Processor", () => {
  let processor: Processor;
  const SNAPSHOT_1 = 100;
  const SNAPSHOT_2 = 200;

  // Test addresses
  const APPROVED_SOURCE = "0x1000000000000000000000000000000000000000";
  const FACTORY_SOURCE = "0x2000000000000000000000000000000000000000";
  const NORMAL_USER_1 = "0x3000000000000000000000000000000000000000";
  const NORMAL_USER_2 = "0x4000000000000000000000000000000000000000";

  beforeEach(() => {
    processor = new Processor(SNAPSHOT_1, SNAPSHOT_2);
    // Mock the isApprovedSource method
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
        value: "1000000000000000000", // 1 token
        blockNumber: 50,
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const [addresses, snapshot1Balances, snapshot2Balances, avgBalances] =
        await processor.getEligibleBalances([]);

      expect(addresses).toContain(NORMAL_USER_1);
      const index = addresses.indexOf(NORMAL_USER_1);
      expect(snapshot1Balances[index]).toBe(1000000000000000000n);
      expect(snapshot2Balances[index]).toBe(1000000000000000000n);
      expect(avgBalances[index]).toBe(1000000000000000000n);
    });

    it("should not track unapproved transfers", async () => {
      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: NORMAL_USER_2,
        value: "1000000000000000000",
        blockNumber: 50,
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const [addresses, snapshot1Balances, snapshot2Balances, avgBalances] =
        await processor.getEligibleBalances([]);

      expect(addresses).toHaveLength(0);
    });
  });

  describe("Snapshot Timing", () => {
    it("should handle transfers before snapshot 1", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "1000000000000000000",
        blockNumber: 50, // Before snapshot 1
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const [addresses, snapshot1Balances, snapshot2Balances] =
        await processor.getEligibleBalances([]);

      const index = addresses.indexOf(NORMAL_USER_1);
      expect(snapshot1Balances[index]).toBe(1000000000000000000n);
      expect(snapshot2Balances[index]).toBe(1000000000000000000n);
    });

    it("should handle transfers between snapshots", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "1000000000000000000",
        blockNumber: 150, // Between snapshots
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const [addresses, snapshot1Balances, snapshot2Balances] =
        await processor.getEligibleBalances([]);

      const index = addresses.indexOf(NORMAL_USER_1);
      expect(snapshot1Balances[index]).toBe(0n);
      expect(snapshot2Balances[index]).toBe(1000000000000000000n);
    });

    it("should handle transfers after snapshot 2", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "1000000000000000000",
        blockNumber: 250, // After snapshot 2
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const [addresses, snapshot1Balances, snapshot2Balances] =
        await processor.getEligibleBalances([]);

      const index = addresses.indexOf(NORMAL_USER_1);
      expect(snapshot1Balances[index]).toBe(0n);
      expect(snapshot2Balances[index]).toBe(1000000000000000000n); // Should match current balance
    });
  });

  describe("Blocklist", () => {
    it("should exclude blocklisted addresses", async () => {
      const transfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: "1000000000000000000",
        blockNumber: 50,
        timestamp: 1000,
      };

      await processor.processTransfer(transfer);
      const [addresses] = await processor.getEligibleBalances([
        NORMAL_USER_1.toLowerCase(),
      ]);

      expect(addresses).not.toContain(NORMAL_USER_1);
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

      const rewardPool = 1000000000000000000n; // 1 token reward pool
      const [addresses, rewards] = await processor.calculateRewards(rewardPool);

      // NORMAL_USER_1 should get 40% of rewards (2/(2+3))
      // NORMAL_USER_2 should get 60% of rewards (3/(2+3))
      const user1Index = addresses.indexOf(NORMAL_USER_1);
      const user2Index = addresses.indexOf(NORMAL_USER_2);

      expect(rewards[user1Index]).toBe(400000000000000000n); // 0.4 tokens
      expect(rewards[user2Index]).toBe(600000000000000000n); // 0.6 tokens

      // Total should equal reward pool
      expect(rewards.reduce((a, b) => a + b, 0n)).toBe(rewardPool);
    });
  });
});
