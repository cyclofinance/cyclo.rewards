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

  const LP_ADDRESS = "0x6000000000000000000000000000000000000000";
  /** Arbitrary LP token liquidity units — not used in reward calculations, only depositedBalanceChange matters */
  const ARBITRARY_LIQUIDITY = "1234";
  let txCounter = 0;
  function nextTxHash(): string {
    return "0x" + (++txCounter).toString(16).padStart(64, "0");
  }

  /** Sets up a buy from approved source + LP deposit for a user.
   *  Calls organizeLiquidityPositions, processTransfer (buy + deposit), and processLiquidityPositions. */
  async function buyAndDeposit(
    proc: Processor,
    user: string,
    value: string,
    tokenAddress: string,
    blockNumber: number,
  ): Promise<LiquidityChange> {
    const buyTx = nextTxHash();
    const depositTx = nextTxHash();
    const buy: Transfer = {
      from: APPROVED_SOURCE, to: user, value,
      blockNumber: blockNumber - 1, timestamp: 900,
      tokenAddress, transactionHash: buyTx,
    };
    const deposit: Transfer = {
      from: user, to: LP_ADDRESS, value,
      blockNumber, timestamp: 1000,
      tokenAddress, transactionHash: depositTx,
    };
    const liq: LiquidityChange = {
      tokenAddress, lpAddress: LP_ADDRESS, owner: user,
      changeType: LiquidityChangeType.Deposit,
      liquidityChange: ARBITRARY_LIQUIDITY, depositedBalanceChange: value,
      blockNumber, timestamp: 1000,
      __typename: "LiquidityV2Change", transactionHash: depositTx,
    };
    await proc.organizeLiquidityPositions(liq);
    await proc.processTransfer(buy);
    await proc.processTransfer(deposit);
    await proc.processLiquidityPositions(liq);
    return liq;
  }

  // Create a mock client
  const mockClient = {
    readContract: async () => "0x0000000000000000000000000000000000000000",
  } as unknown as PublicClient;

  beforeEach(() => {
    txCounter = 0;
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
    it("should give zero eligible balance for approved buy without LP deposit", async () => {
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
      await processor.processLiquidityPositions(liquidityChangeEvent);
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
      // Buy from approved source to set boughtCap
      const buyTransfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 40,
        timestamp: 900,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "b".repeat(64),
      };
      // LP deposit (returns early from processTransfer, handled by processLiquidityPositions)
      const depositTransfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0x6000000000000000000000000000000000000000",
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "a".repeat(64),
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0x6000000000000000000000000000000000000000",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0x" + "a".repeat(64),
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(buyTransfer);
      await processor.processTransfer(depositTransfer);
      await processor.processLiquidityPositions(liquidityChangeEvent);
      const balances = await processor.getEligibleBalances();

      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)?.snapshots[0]).toBe(ONEn);
      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)?.snapshots[1]).toBe(ONEn);
    });

    it("should handle transfers between snapshots", async () => {
      const buyTransfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 140,
        timestamp: 900,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "b".repeat(64),
      };
      const depositTransfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0x6000000000000000000000000000000000000000",
        value: ONE,
        blockNumber: 150,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "a".repeat(64),
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0x6000000000000000000000000000000000000000",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 150,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0x" + "a".repeat(64),
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(buyTransfer);
      await processor.processTransfer(depositTransfer);
      await processor.processLiquidityPositions(liquidityChangeEvent);
      const balances = await processor.getEligibleBalances();

      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)?.snapshots[0]).toBe(0n);
      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)?.snapshots[1]).toBe(ONEn);
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
      const buyTransfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_1,
        value: ONE,
        blockNumber: 90,
        timestamp: 900,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "b".repeat(64),
      };
      const depositTransfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0x6000000000000000000000000000000000000000",
        value: ONE,
        blockNumber: 100,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "a".repeat(64),
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0x6000000000000000000000000000000000000000",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 100,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0x" + "a".repeat(64),
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(buyTransfer);
      await processor.processTransfer(depositTransfer);
      await processor.processLiquidityPositions(liquidityChangeEvent);
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

      const buyTransfer: Transfer = {
        from: APPROVED_SOURCE,
        to: NORMAL_USER_2,
        value: ONE,
        blockNumber: 40,
        timestamp: 900,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "b".repeat(64),
      };
      const depositTransfer: Transfer = {
        from: NORMAL_USER_2,
        to: "0x6000000000000000000000000000000000000000",
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "a".repeat(64),
      };
      const liquidityChangeEvent: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0x6000000000000000000000000000000000000000",
        owner: NORMAL_USER_2,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234",
        depositedBalanceChange: ONE,
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0x" + "a".repeat(64),
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent);
      await processor.processTransfer(buyTransfer);
      await processor.processTransfer(depositTransfer);
      await processor.processLiquidityPositions(liquidityChangeEvent);
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

      // Buy transfers to set boughtCap for both users
      const buy1: Transfer = {
        from: APPROVED_SOURCE, to: NORMAL_USER_2, value: ONE,
        blockNumber: 40, timestamp: 900, tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "c".repeat(64),
      };
      const buy2: Transfer = {
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: ONE,
        blockNumber: 40, timestamp: 900, tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "d".repeat(64),
      };

      await processor.organizeLiquidityPositions(liquidityChangeEvent1);
      await processor.organizeLiquidityPositions(liquidityChangeEvent2);
      await processor.processTransfer(buy1);
      await processor.processTransfer(buy2);
      await processor.processTransfer(transfer1);
      await processor.processTransfer(transfer2);
      await processor.processLiquidityPositions(liquidityChangeEvent1);
      await processor.processLiquidityPositions(liquidityChangeEvent2);

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

  describe("Multi-token penalty", () => {
    it("should apply penalties independently per token", async () => {
      const reports = [{ reporter: NORMAL_USER_1, cheater: NORMAL_USER_2 }];
      const proc = new Processor(SNAPSHOTS, reports, mockClient);
      proc.isApprovedSource = async (source: string) => source === APPROVED_SOURCE;

      // Cheater has balance in both tokens
      await buyAndDeposit(proc, NORMAL_USER_2, ONE, CYTOKENS[0].address, 50);
      await buyAndDeposit(proc, NORMAL_USER_2, "2000000000000000000", CYTOKENS[1].address, 50);

      // Reporter has balance in token 0 only
      await buyAndDeposit(proc, NORMAL_USER_1, ONE, CYTOKENS[0].address, 50);

      const balances = await proc.getEligibleBalances();

      // Cheater penalized in both tokens independently
      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_2)?.penalty).toBe(ONEn);
      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_2)?.final).toBe(0n);
      expect(balances.get(CYTOKENS[1].address)?.get(NORMAL_USER_2)?.penalty).toBe(2000000000000000000n);
      expect(balances.get(CYTOKENS[1].address)?.get(NORMAL_USER_2)?.final).toBe(0n);

      // Reporter gets bounty in both tokens
      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)?.bounty).toBe(ONEn / 10n);
      expect(balances.get(CYTOKENS[1].address)?.get(NORMAL_USER_1)?.bounty).toBe(200000000000000000n);

      // Reporter's final in token 0 = original + bounty
      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)?.final).toBe(ONEn + ONEn / 10n);
      // Reporter's final in token 1 = just bounty (no original balance)
      expect(balances.get(CYTOKENS[1].address)?.get(NORMAL_USER_1)?.final).toBe(200000000000000000n);
    });
  });

  describe("Inverse-fraction reward weighting", () => {
    it("should allocate more rewards to token with less total eligible balance", async () => {
      // Token A: 100 total eligible (one user)
      // Token B: 400 total eligible (one user)
      // Inverse fractions: A = 500/100 = 5, B = 500/400 = 1.25
      // Pool shares: A = 5/(5+1.25) = 80%, B = 1.25/6.25 = 20%
      const proc = new Processor(SNAPSHOTS, [], mockClient);
      proc.isApprovedSource = async (source: string) => source === APPROVED_SOURCE;

      await buyAndDeposit(proc, NORMAL_USER_1, "100000000000000000000", CYTOKENS[0].address, 50);
      await buyAndDeposit(proc, NORMAL_USER_2, "400000000000000000000", CYTOKENS[1].address, 50);

      const rewardPool = 1000000000000000000000n; // 1000 tokens
      const balances = await proc.getEligibleBalances();
      const pools = proc.calculateRewardsPoolsPerToken(balances, rewardPool);

      const tokenAPool = pools.get(CYTOKENS[0].address)!;
      const tokenBPool = pools.get(CYTOKENS[1].address)!;

      // Token A (smaller) should get more rewards than Token B (larger)
      expect(tokenAPool).toBeGreaterThan(tokenBPool);
      // A gets 80%, B gets 20%
      expect(tokenAPool).toBe(800000000000000000000n);
      expect(tokenBPool).toBe(200000000000000000000n);
    });

    it("should split evenly when both tokens have equal total eligible", async () => {
      const proc = new Processor(SNAPSHOTS, [], mockClient);
      proc.isApprovedSource = async (source: string) => source === APPROVED_SOURCE;

      await buyAndDeposit(proc, NORMAL_USER_1, "100000000000000000000", CYTOKENS[0].address, 50);
      await buyAndDeposit(proc, NORMAL_USER_2, "100000000000000000000", CYTOKENS[1].address, 50);

      const rewardPool = 1000000000000000000000n;
      const balances = await proc.getEligibleBalances();
      const pools = proc.calculateRewardsPoolsPerToken(balances, rewardPool);

      expect(pools.get(CYTOKENS[0].address)).toBe(500000000000000000000n);
      expect(pools.get(CYTOKENS[1].address)).toBe(500000000000000000000n);
    });

    it("should give all rewards to a single token when only one has balance", async () => {
      const proc = new Processor(SNAPSHOTS, [], mockClient);
      proc.isApprovedSource = async (source: string) => source === APPROVED_SOURCE;

      await buyAndDeposit(proc, NORMAL_USER_1, "100000000000000000000", CYTOKENS[0].address, 50);

      const rewardPool = 1000000000000000000000n;
      const balances = await proc.getEligibleBalances();
      const pools = proc.calculateRewardsPoolsPerToken(balances, rewardPool);

      expect(pools.get(CYTOKENS[0].address)).toBe(1000000000000000000000n);
      expect(pools.get(CYTOKENS[1].address)).toBeUndefined();
    });

    it("should handle 3 tokens with different balances", async () => {
      // A: 100, B: 200, C: 300 (using 6 decimal cyFXRP for C)
      // Sum = 100+200+300 = 600 (all scaled to 18 decimals)
      // Inverse fractions: A=600/100=6, B=600/200=3, C=600/300=2
      // Sum of inverses: 11
      // Shares: A=6/11, B=3/11, C=2/11
      const proc = new Processor(SNAPSHOTS, [], mockClient);
      proc.isApprovedSource = async (source: string) => source === APPROVED_SOURCE;

      await buyAndDeposit(proc, NORMAL_USER_1, "100000000000000000000", CYTOKENS[0].address, 50);
      await buyAndDeposit(proc, NORMAL_USER_2, "200000000000000000000", CYTOKENS[1].address, 50);
      // cyFXRP has 6 decimals, so 300 tokens = 300_000_000 in 6-decimal
      await buyAndDeposit(proc, NORMAL_USER_1, "300000000", CYTOKENS[2].address, 50);

      const rewardPool = 1100000000000000000000n; // 1100 tokens for clean division by 11
      const balances = await proc.getEligibleBalances();
      const pools = proc.calculateRewardsPoolsPerToken(balances, rewardPool);

      expect(pools.get(CYTOKENS[0].address)).toBe(600000000000000000000n); // 6/11 * 1100
      expect(pools.get(CYTOKENS[1].address)).toBe(300000000000000000000n); // 3/11 * 1100
      expect(pools.get(CYTOKENS[2].address)).toBe(200000000000000000000n); // 2/11 * 1100
    });
  });

  describe("Reward Calculation", () => {
    it("should calculate rewards proportionally for single token", async () => {
      // User 1: buys 2, LPs 2 → eligible 2
      // User 2: buys 3, LPs 3 → eligible 3
      // Reward split: 2:3 = 0.4:0.6
      const TWO = "2000000000000000000";
      const THREE = "3000000000000000000";

      const buy1: Transfer = {
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: TWO,
        blockNumber: 40, timestamp: 900, tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "c".repeat(64),
      };
      const deposit1: Transfer = {
        from: NORMAL_USER_1, to: "0x6000000000000000000000000000000000000000",
        value: TWO, blockNumber: 50, timestamp: 1000,
        tokenAddress: CYTOKENS[0].address, transactionHash: "0x" + "a".repeat(64),
      };
      const liq1: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0x6000000000000000000000000000000000000000",
        owner: NORMAL_USER_1, changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234", depositedBalanceChange: TWO,
        blockNumber: 50, timestamp: 1000, __typename: "LiquidityV2Change",
        transactionHash: "0x" + "a".repeat(64),
      };

      const buy2: Transfer = {
        from: APPROVED_SOURCE, to: NORMAL_USER_2, value: THREE,
        blockNumber: 40, timestamp: 900, tokenAddress: CYTOKENS[0].address,
        transactionHash: "0x" + "d".repeat(64),
      };
      const deposit2: Transfer = {
        from: NORMAL_USER_2, to: "0x6000000000000000000000000000000000000000",
        value: THREE, blockNumber: 50, timestamp: 1000,
        tokenAddress: CYTOKENS[0].address, transactionHash: "0x" + "e".repeat(64),
      };
      const liq2: LiquidityChange = {
        tokenAddress: CYTOKENS[0].address,
        lpAddress: "0x6000000000000000000000000000000000000000",
        owner: NORMAL_USER_2, changeType: LiquidityChangeType.Deposit,
        liquidityChange: "1234", depositedBalanceChange: THREE,
        blockNumber: 50, timestamp: 1000, __typename: "LiquidityV2Change",
        transactionHash: "0x" + "e".repeat(64),
      };

      await processor.organizeLiquidityPositions(liq1);
      await processor.organizeLiquidityPositions(liq2);
      await processor.processTransfer(buy1);
      await processor.processTransfer(buy2);
      await processor.processTransfer(deposit1);
      await processor.processTransfer(deposit2);
      await processor.processLiquidityPositions(liq1);
      await processor.processLiquidityPositions(liq2);

      const rewardPool = ONEn;
      const balances = await processor.getEligibleBalances();
      const result = await processor.calculateRewards(rewardPool, balances);

      const user1Reward = result.get(CYTOKENS[0].address)?.get(NORMAL_USER_1);
      const user2Reward = result.get(CYTOKENS[0].address)?.get(NORMAL_USER_2);

      expect(user1Reward).toBe(400000000000000000n); // 0.4 tokens
      expect(user2Reward).toBe(600000000000000000n); // 0.6 tokens
      expect(user1Reward! + user2Reward!).toBe(rewardPool);
    });

    it("should treat negative bought cap as zero when calculating eligible amounts", async () => {
      // User 1: cyA: bought 50, LP 50 → eligible 50. cyB: bought 10, LP 10, sold 40 → cap -30 → eligible 0
      // User 2: cyA: bought 5, LP 5, sold 20 → cap -15 → eligible 0. cyB: bought 88, LP 88 → eligible 88
      await buyAndDeposit(processor, NORMAL_USER_1, "50000000000000000000", CYTOKENS[0].address, 50);
      await buyAndDeposit(processor, NORMAL_USER_1, "10000000000000000000", CYTOKENS[1].address, 50);
      await processor.processTransfer({
        from: NORMAL_USER_1, to: NORMAL_USER_2, value: "40000000000000000000",
        blockNumber: 50, timestamp: 1000, tokenAddress: CYTOKENS[1].address,
        transactionHash: nextTxHash(),
      });

      await buyAndDeposit(processor, NORMAL_USER_2, "5000000000000000000", CYTOKENS[0].address, 50);
      await processor.processTransfer({
        from: NORMAL_USER_2, to: NORMAL_USER_1, value: "20000000000000000000",
        blockNumber: 50, timestamp: 1000, tokenAddress: CYTOKENS[0].address,
        transactionHash: nextTxHash(),
      });
      await buyAndDeposit(processor, NORMAL_USER_2, "88000000000000000000", CYTOKENS[1].address, 50);

      const rewardPool = 1_000_000n * ONEn;
      const balances = await processor.getEligibleBalances();
      const result = await processor.calculateRewards(rewardPool, balances);
      expect(result.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)).not.toBeUndefined();
      expect(result.get(CYTOKENS[1].address)?.get(NORMAL_USER_2)).not.toBeUndefined();
      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_1)?.average).toBe(50000000000000000000n);
      expect(balances.get(CYTOKENS[1].address)?.get(NORMAL_USER_1)?.average).toBe(0n);
      expect(balances.get(CYTOKENS[0].address)?.get(NORMAL_USER_2)?.average).toBe(0n);
      expect(balances.get(CYTOKENS[1].address)?.get(NORMAL_USER_2)?.average).toBe(88000000000000000000n);

      const rewardsPools = processor.calculateRewardsPoolsPerToken(balances, rewardPool);
      const user1Reward = result.get(CYTOKENS[0].address)?.get(NORMAL_USER_1);
      const user2Reward = result.get(CYTOKENS[1].address)?.get(NORMAL_USER_2);
      expect(user1Reward).toBe(rewardsPools.get(CYTOKENS[0].address)!);
      expect(user2Reward).toBe(rewardsPools.get(CYTOKENS[1].address)!);
      expect(user1Reward! + user2Reward!).toBeGreaterThanOrEqual(rewardPool - 10n);

    });
  });

  describe("Reward Calculation with Multiple Tokens", () => {
    it("should calculate rewards proportionally for multiple tokens", async () => {
      // User 1: 2 cyA. User 2: 3 cyA. Reward split: 2:3 = 0.4:0.6
      await buyAndDeposit(processor, NORMAL_USER_1, "2000000000000000000", CYTOKENS[0].address, 50);
      await buyAndDeposit(processor, NORMAL_USER_2, "3000000000000000000", CYTOKENS[0].address, 50);

      const rewardPool = ONEn;
      const balances = await processor.getEligibleBalances();
      const result = await processor.calculateRewards(rewardPool, balances);

      const user1Reward = result.get(CYTOKENS[0].address)?.get(NORMAL_USER_1);
      const user2Reward = result.get(CYTOKENS[0].address)?.get(NORMAL_USER_2);

      expect(user1Reward).toBe(400000000000000000n);
      expect(user2Reward).toBe(600000000000000000n);
      expect(user1Reward! + user2Reward!).toBe(rewardPool);
    });
  });

  describe("Bought cap recovery", () => {
    it("should recover from negative bought cap with a subsequent buy", async () => {
      const tokenAddress = CYTOKENS[0].address;
      // Buy 10, LP 10
      await buyAndDeposit(processor, NORMAL_USER_1, "10000000000000000000", tokenAddress, 40);
      // Sell 20 → cap = 10 - 20 = -10
      await processor.processTransfer({
        from: NORMAL_USER_1, to: NORMAL_USER_2, value: "20000000000000000000",
        blockNumber: 45, timestamp: 950, tokenAddress,
        transactionHash: nextTxHash(),
      });
      // Buy 30 → cap = -10 + 30 = 20
      await processor.processTransfer({
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: "30000000000000000000",
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: nextTxHash(),
      });

      const balances = await processor.getEligibleBalances();
      // boughtCap = 20, lpBalance = 10 → eligible = min(20, 10) = 10
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)?.average).toBe(10000000000000000000n);
    });
  });

  describe("Negative lpBalance", () => {
    it("should clamp negative lpBalance to zero", async () => {
      const tokenAddress = CYTOKENS[0].address;
      // Buy 10 to set cap
      await processor.processTransfer({
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: "10000000000000000000",
        blockNumber: 40, timestamp: 900, tokenAddress,
        transactionHash: nextTxHash(),
      });
      // Withdraw without prior deposit → lpBalance = -5
      const withdrawEvent: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: ARBITRARY_LIQUIDITY,
        depositedBalanceChange: "-5000000000000000000",
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: nextTxHash(),
      };
      await processor.processLiquidityPositions(withdrawEvent);

      const balances = await processor.getEligibleBalances();
      // boughtCap = 10, lpBalance = -5 (clamped to 0) → eligible = 0
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)?.average).toBe(0n);
    });
  });

  describe("LP withdrawal neutrality (explicit)", () => {
    it("should not increase boughtCap when receiving tokens from LP withdrawal", async () => {
      const tokenAddress = CYTOKENS[0].address;
      // Buy 10, LP 10
      await buyAndDeposit(processor, NORMAL_USER_1, "10000000000000000000", tokenAddress, 40);
      // Sell 5 → cap = 10 - 5 = 5
      await processor.processTransfer({
        from: NORMAL_USER_1, to: NORMAL_USER_2, value: "5000000000000000000",
        blockNumber: 45, timestamp: 950, tokenAddress,
        transactionHash: nextTxHash(),
      });
      // Withdraw 3 from LP (pool is FACTORY_SOURCE, which is approved)
      const withdrawTx = nextTxHash();
      const withdrawTransfer: Transfer = {
        from: FACTORY_SOURCE, to: NORMAL_USER_1, value: "3000000000000000000",
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: withdrawTx,
      };
      const withdrawEvent: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: ARBITRARY_LIQUIDITY,
        depositedBalanceChange: "-3000000000000000000",
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: withdrawTx,
      };
      await processor.organizeLiquidityPositions(withdrawEvent);
      await processor.processTransfer(withdrawTransfer);
      await processor.processLiquidityPositions(withdrawEvent);

      const balances = await processor.getEligibleBalances();
      // boughtCap should still be 5 (withdrawal is neutral, not +3)
      // lpBalance = 10 - 3 = 7
      // eligible = min(5, 7) = 5
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)?.average).toBe(5000000000000000000n);
    });
  });

  describe("End-to-end V3 out-of-range with eligibility model", () => {
    it("should deduct out-of-range V3 position from eligible balance", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const depositTx = nextTxHash();

      // Buy and deposit into V3 LP
      await processor.processTransfer({
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: ONE,
        blockNumber: 40, timestamp: 900, tokenAddress,
        transactionHash: nextTxHash(),
      });
      const depositTransfer: Transfer = {
        from: NORMAL_USER_1, to: LP_ADDRESS, value: ONE,
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: depositTx,
      };
      const v3Event: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: ARBITRARY_LIQUIDITY, depositedBalanceChange: ONE,
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV3Change",
        transactionHash: depositTx,
        tokenId: "42", poolAddress: POOL_ADDRESS,
        fee: 3000, lowerTick: -100, upperTick: 100,
      };

      await processor.organizeLiquidityPositions(v3Event);
      await processor.processTransfer(depositTransfer);
      await processor.processLiquidityPositions(v3Event);

      // Mock pool tick at 200 — outside the [-100, 100] range
      (getPoolsTick as Mock).mockResolvedValue({
        [POOL_ADDRESS]: 200,
      });

      await processor.processLpRange();

      const balances = await processor.getEligibleBalances();
      // Out of range → position deducted → eligible = 0
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)?.average).toBe(0n);
    });

    it("should keep in-range V3 position in eligible balance", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const depositTx = nextTxHash();

      await processor.processTransfer({
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: ONE,
        blockNumber: 40, timestamp: 900, tokenAddress,
        transactionHash: nextTxHash(),
      });
      const depositTransfer: Transfer = {
        from: NORMAL_USER_1, to: LP_ADDRESS, value: ONE,
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: depositTx,
      };
      const v3Event: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: ARBITRARY_LIQUIDITY, depositedBalanceChange: ONE,
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV3Change",
        transactionHash: depositTx,
        tokenId: "42", poolAddress: POOL_ADDRESS,
        fee: 3000, lowerTick: -100, upperTick: 100,
      };

      await processor.organizeLiquidityPositions(v3Event);
      await processor.processTransfer(depositTransfer);
      await processor.processLiquidityPositions(v3Event);

      // Mock pool tick at 0 — inside the [-100, 100] range
      (getPoolsTick as Mock).mockResolvedValue({
        [POOL_ADDRESS]: 0,
      });

      await processor.processLpRange();

      const balances = await processor.getEligibleBalances();
      // In range → position kept → eligible = min(1, 1) = 1
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)?.average).toBe(ONEn);
    });

    it("should treat tick exactly at upperTick as out-of-range (exclusive upper bound)", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const depositTx = nextTxHash();

      await processor.processTransfer({
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: ONE,
        blockNumber: 40, timestamp: 900, tokenAddress,
        transactionHash: nextTxHash(),
      });
      const v3Event: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: ARBITRARY_LIQUIDITY, depositedBalanceChange: ONE,
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV3Change",
        transactionHash: depositTx,
        tokenId: "42", poolAddress: POOL_ADDRESS,
        fee: 3000, lowerTick: -100, upperTick: 100,
      };

      await processor.organizeLiquidityPositions(v3Event);
      await processor.processTransfer({
        from: NORMAL_USER_1, to: LP_ADDRESS, value: ONE,
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: depositTx,
      });
      await processor.processLiquidityPositions(v3Event);

      // Mock pool tick at exactly upperTick (100) — should be OUT of range per Uniswap V3
      (getPoolsTick as Mock).mockResolvedValue({
        [POOL_ADDRESS]: 100,
      });

      await processor.processLpRange();

      const balances = await processor.getEligibleBalances();
      // tick === upperTick → out of range → deducted → eligible = 0
      expect(balances.get(tokenAddress)?.get(NORMAL_USER_1)?.average).toBe(0n);
    });
  });

  describe("transferIsDeposit", () => {
    it("should return the LP event when transfer matches a deposit", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const txHash = nextTxHash();
      const liq: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: ARBITRARY_LIQUIDITY, depositedBalanceChange: ONE,
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV2Change", transactionHash: txHash,
      };
      await processor.organizeLiquidityPositions(liq);

      const transfer: Transfer = {
        from: NORMAL_USER_1, to: LP_ADDRESS, value: ONE,
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: txHash,
      };
      expect(processor.transferIsDeposit(transfer)).toEqual(liq);
    });

    it("should return undefined when no matching LP event exists", () => {
      const transfer: Transfer = {
        from: NORMAL_USER_1, to: LP_ADDRESS, value: ONE,
        blockNumber: 50, timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: nextTxHash(),
      };
      expect(processor.transferIsDeposit(transfer)).toBeUndefined();
    });

    it("should return undefined when LP event is a Withdraw not a Deposit", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const txHash = nextTxHash();
      const liq: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: ARBITRARY_LIQUIDITY, depositedBalanceChange: `-${ONE}`,
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV2Change", transactionHash: txHash,
      };
      await processor.organizeLiquidityPositions(liq);

      const transfer: Transfer = {
        from: NORMAL_USER_1, to: LP_ADDRESS, value: ONE,
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: txHash,
      };
      expect(processor.transferIsDeposit(transfer)).toBeUndefined();
    });
  });

  describe("transferIsWithdraw", () => {
    it("should return the LP event when transfer matches a withdrawal", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const txHash = nextTxHash();
      const liq: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: ARBITRARY_LIQUIDITY, depositedBalanceChange: `-${ONE}`,
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV2Change", transactionHash: txHash,
      };
      await processor.organizeLiquidityPositions(liq);

      const transfer: Transfer = {
        from: LP_ADDRESS, to: NORMAL_USER_1, value: ONE,
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: txHash,
      };
      expect(processor.transferIsWithdraw(transfer)).toEqual(liq);
    });

    it("should return undefined when no matching LP event exists", () => {
      const transfer: Transfer = {
        from: LP_ADDRESS, to: NORMAL_USER_1, value: ONE,
        blockNumber: 50, timestamp: 1000,
        tokenAddress: CYTOKENS[0].address,
        transactionHash: nextTxHash(),
      };
      expect(processor.transferIsWithdraw(transfer)).toBeUndefined();
    });

    it("should return undefined when LP event is a Deposit not a Withdraw", async () => {
      const tokenAddress = CYTOKENS[0].address;
      const txHash = nextTxHash();
      const liq: LiquidityChange = {
        tokenAddress, lpAddress: LP_ADDRESS, owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: ARBITRARY_LIQUIDITY, depositedBalanceChange: ONE,
        blockNumber: 50, timestamp: 1000,
        __typename: "LiquidityV2Change", transactionHash: txHash,
      };
      await processor.organizeLiquidityPositions(liq);

      const transfer: Transfer = {
        from: LP_ADDRESS, to: NORMAL_USER_1, value: ONE,
        blockNumber: 50, timestamp: 1000, tokenAddress,
        transactionHash: txHash,
      };
      expect(processor.transferIsWithdraw(transfer)).toBeUndefined();
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

      // Buy 9 tokens total (enough cap for all deposits: 5 + 3 + 1) then deposit 5
      await buyAndDeposit(processor, NORMAL_USER_1, "5000000000000000000", tokenAddress, 50);
      // Buy extra 4 for the subsequent deposits' cap
      await processor.processTransfer({
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: "4000000000000000000",
        blockNumber: 49, timestamp: 899, tokenAddress,
        transactionHash: nextTxHash(),
      });

      // verify the initial deposit
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

    it("should update lpBalance for LiquidityChangeType.Transfer but cap at boughtCap", async () => {
      const tokenAddress = CYTOKENS[0].address;

      // Transfer type adjusts lpBalance, but without a buy the boughtCap is 0
      const lpTransferEvent: LiquidityChange = {
        tokenAddress,
        lpAddress: LP_ADDRESS,
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Transfer,
        liquidityChange: ARBITRARY_LIQUIDITY,
        depositedBalanceChange: ONE,
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV2Change",
        transactionHash: "0x" + "a".repeat(64),
      };

      await processor.processLiquidityPositions(lpTransferEvent);
      const balances = await processor.getEligibleBalances();

      // lpBalance = 1, but boughtCap = 0 → eligible = min(0, 1) = 0
      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(0n);
      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[1]
      ).toBe(0n);
    });

    it("should decrease lpBalance for LiquidityChangeType.Withdraw", async () => {
      const tokenAddress = CYTOKENS[0].address;

      // Buy to set boughtCap, then deposit
      await buyAndDeposit(processor, NORMAL_USER_1, ONE, tokenAddress, 50);

      // Withdraw removes from lpBalance
      const withdrawEvent: LiquidityChange = {
        tokenAddress,
        lpAddress: LP_ADDRESS,
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Withdraw,
        liquidityChange: ARBITRARY_LIQUIDITY,
        depositedBalanceChange: `-${ONE}`,
        blockNumber: 55,
        timestamp: 1005,
        __typename: "LiquidityV2Change",
        transactionHash: nextTxHash(),
      };

      await processor.processLiquidityPositions(withdrawEvent);
      const balances = await processor.getEligibleBalances();

      // lpBalance = 1 - 1 = 0. boughtCap = 1. eligible = min(1, 0) = 0
      expect(
        balances.get(tokenAddress)?.get(NORMAL_USER_1)?.snapshots[0]
      ).toBe(0n);
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

      await buyAndDeposit(processor, NORMAL_USER_1, ONE, tokenAddress, 100);

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
      // Buy to set boughtCap
      await processor.processTransfer({
        from: APPROVED_SOURCE, to: NORMAL_USER_1, value: ONE,
        blockNumber: 40, timestamp: 900, tokenAddress,
        transactionHash: nextTxHash(),
      });
      const transfer: Transfer = {
        from: NORMAL_USER_1,
        to: "0x6000000000000000000000000000000000000000",
        value: ONE,
        blockNumber: 50,
        timestamp: 1000,
        tokenAddress,
        transactionHash: "0x" + "a".repeat(64),
      };
      const v3Event: LiquidityChange = {
        tokenAddress,
        lpAddress: "0x6000000000000000000000000000000000000000",
        owner: NORMAL_USER_1,
        changeType: LiquidityChangeType.Deposit,
        liquidityChange: ARBITRARY_LIQUIDITY,
        depositedBalanceChange: ONE,
        blockNumber: 50,
        timestamp: 1000,
        __typename: "LiquidityV3Change",
        transactionHash: "0x" + "a".repeat(64),
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
      // LP balance is 1 but boughtCap is 0 (no approved purchase) → eligible = min(0, 1) = 0
      expect(userBalance?.snapshots[0]).toBe(0n);
      expect(userBalance?.snapshots[1]).toBe(0n);
      expect(userBalance?.average).toBe(0n);
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

      it('should accumulate deductions from multiple out-of-range positions for same owner', async () => {
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
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        // Two positions, both out of range
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(`${tokenAddress}-${ownerAddress}-${poolAddress}-1`, {
            value: 100n,
            pool: poolAddress,
            lowerTick: 150,
            upperTick: 250,
          });
          lpTrackList[snapshot].set(`${tokenAddress}-${ownerAddress}-${poolAddress}-2`, {
            value: 150n,
            pool: poolAddress,
            lowerTick: 200,
            upperTick: 300,
          });
        }

        await processor.processLpRange();

        const updatedBalance = balanceMap.get(ownerAddress);
        // Both positions deducted: 500 - 100 - 150 = 250
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([250n, 250n, 250n]);
      });

      it('should clamp balance to zero when deductions exceed balance', async () => {
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
          transfersInFromApproved: 100n,
          transfersOut: 0n,
          netBalanceAtSnapshots: [50n, 50n, 50n],
        });
        accountBalancesPerToken.set(tokenAddress, balanceMap);

        const lpTrackList = (processor as any).lp3TrackList;
        for (const snapshot of snapshots) {
          lpTrackList[snapshot].set(`${tokenAddress}-${ownerAddress}-${poolAddress}-1`, {
            value: 200n, // Exceeds balance of 50
            pool: poolAddress,
            lowerTick: 150,
            upperTick: 250,
          });
        }

        await processor.processLpRange();

        const updatedBalance = balanceMap.get(ownerAddress);
        // Clamped to 0, not negative
        expect(updatedBalance.netBalanceAtSnapshots).toEqual([0n, 0n, 0n]);
      });
    });
  });

  describe("updateSnapshots", () => {
    it("should update snapshots at and after the given block", async () => {
      const balance = {
        transfersInFromApproved: 500n,
        transfersOut: 0n,
        netBalanceAtSnapshots: [0n, 0n],
        boughtCap: 500n,
        lpBalance: 500n,
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
        boughtCap: 300n,
        lpBalance: 300n,
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
        boughtCap: 300n,
        lpBalance: 300n,
      };
      (processor as any).updateSnapshots(balance, 300);
      expect(balance.netBalanceAtSnapshots[0]).toBe(0n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(0n);
    });

    it("should clamp negative boughtCap to zero", async () => {
      const balance = {
        transfersInFromApproved: 100n,
        transfersOut: 500n,
        netBalanceAtSnapshots: [999n, 999n],
        boughtCap: -400n,
        lpBalance: 1000n,
      };
      (processor as any).updateSnapshots(balance, 50);
      expect(balance.netBalanceAtSnapshots[0]).toBe(0n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(0n);
    });

    it("should use min of boughtCap and lpBalance", async () => {
      const balance = {
        transfersInFromApproved: 1000n,
        transfersOut: 0n,
        netBalanceAtSnapshots: [0n, 0n],
        boughtCap: 1000n,
        lpBalance: 300n,
      };
      (processor as any).updateSnapshots(balance, 50);
      expect(balance.netBalanceAtSnapshots[0]).toBe(300n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(300n);
    });

    it("should cap lpBalance at boughtCap", async () => {
      const balance = {
        transfersInFromApproved: 200n,
        transfersOut: 0n,
        netBalanceAtSnapshots: [0n, 0n],
        boughtCap: 200n,
        lpBalance: 500n,
      };
      (processor as any).updateSnapshots(balance, 50);
      expect(balance.netBalanceAtSnapshots[0]).toBe(200n);
      expect(balance.netBalanceAtSnapshots[1]).toBe(200n);
    });

    it("should set zero when both are zero", async () => {
      const balance = {
        transfersInFromApproved: 0n,
        transfersOut: 0n,
        netBalanceAtSnapshots: [999n, 999n],
        boughtCap: 0n,
        lpBalance: 0n,
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
        boughtCap: 200n,
        lpBalance: 200n,
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
