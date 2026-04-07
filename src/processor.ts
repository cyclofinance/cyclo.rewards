/**
 * Core reward calculation engine. Replays transfers and liquidity events to compute
 * per-account eligible balances at snapshot blocks, then distributes the reward pool.
 */

import { Address, PublicClient } from "viem";
import {
  REWARDS_SOURCES,
  FACTORIES,
  isSameAddress,
  CYTOKENS,
  scaleTo18,
} from "./config";
import {
  Transfer,
  AccountBalance,
  EligibleBalances,
  TokenBalances,
  RewardsPerToken,
  CyToken,
  LiquidityChange,
  LiquidityChangeType,
  LpV3Position,
  BlocklistReport,
} from "./types";
import { ONE_18, BOUNTY_PERCENT, RETRY_BASE_DELAY_MS } from "./constants";
import { getPoolsTick } from "./liquidity";

/** Clamp a bigint to a minimum of 0 */
function clamp0(val: bigint): bigint {
  return val < 0n ? 0n : val;
}

/** Build a V3 LP position ID from token, owner, pool, and tokenId */
function lpV3PositionId(token: string, owner: string, pool: string, tokenId: string): string {
  return `${token}-${owner}-${pool}-${tokenId}`;
}

/**
 * Processes on-chain transfer and liquidity events to calculate reward-eligible balances
 * and distribute the reward pool across accounts proportionally.
 */
export class Processor {
  /** Cache of isApprovedSource results keyed by lowercase address */
  private approvedSourceCache = new Map<string, boolean>();
  /** Token address → account address → running balance state */
  private accountBalancesPerToken = new Map<
    string,
    Map<string, AccountBalance>
  >();
  /** Viem client for on-chain RPC calls (factory checks, tick queries) */
  private client: PublicClient;
  /** Snapshot block → position ID → V3 LP position for in-range checks */
  private lp3TrackList: Record<number, Map<string, LpV3Position>> = {};
  /** Owner → token → txHash → liquidity event, for deposit/withdraw matching */
  private liquidityEvents: Map<string, Map<string, Map<string, LiquidityChange>>> = new Map();

  /**
   * @param snapshots - Sorted array of 30 block numbers to sample balances at
   * @param reports - Blocklist entries mapping reporters to cheaters
   * @param client - Viem PublicClient for on-chain queries
   * @param pools - V3 pool addresses for in-range tick calculations
   */
  constructor(
    private snapshots: number[],
    private reports: BlocklistReport[] = [],
    client: PublicClient,
    private pools: `0x${string}`[] = [],
  ) {
    this.client = client;

    // Initialize token balances maps
    for (const token of CYTOKENS) {
      const balanceMap = new Map<string, AccountBalance>();
      this.accountBalancesPerToken.set(token.address, balanceMap);
    }

    // start empty list
    for (const snp of snapshots) {
      this.lp3TrackList[snp] = new Map();
    }
  }

  /**
   * Checks whether an address is an approved transfer source (DEX router or factory-deployed pool).
   * Results are cached. Retries with exponential backoff on transient RPC errors.
   * @param source - Address to check
   * @param retries - Maximum retry attempts for RPC calls
   * @returns true if the source is a known router or deployed by a known factory
   */
  async isApprovedSource(source: string, retries = 8): Promise<boolean> {
    // Check cache first
    if (this.approvedSourceCache.has(source)) {
      return this.approvedSourceCache.get(source)!;
    }

    // Check direct sources
    if (REWARDS_SOURCES.some((addr) => isSameAddress(addr, source))) {
      this.approvedSourceCache.set(source, true);
      return true;
    }

    // Check factory sources
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const factory = (await this.client.readContract({
          address: source as Address,
          abi: [
            {
              name: "factory",
              type: "function",
              stateMutability: "view",
              inputs: [],
              outputs: [{ type: "address" }],
            },
          ],
          functionName: "factory",
        })) as Address;

        const isApproved = FACTORIES.some((addr) =>
          isSameAddress(addr, factory)
        );
        this.approvedSourceCache.set(source, isApproved);
        return isApproved;
      } catch (e: any) {
        // Check if this is a "no data returned" error (contract doesn't have factory function)
        if (
          e.shortMessage &&
          (e.shortMessage.includes('returned no data ("0x")') ||
            e.shortMessage.includes("reverted") ||
            e.shortMessage.includes("invalid parameters"))
        ) {
          this.approvedSourceCache.set(source, false);
          return false;
        }

        // For other errors (like rate limits), retry if we have attempts left
        if (attempt < retries - 1) {
          // Add exponential backoff
          const delay = Math.pow(2, attempt) * RETRY_BASE_DELAY_MS;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If we've exhausted all retries, abort rather than silently under-crediting
        throw new Error(`Failed to check factory for ${source} after ${retries} attempts: ${e.message}`);
      }
    }

    return false;
  }

  /**
   * Updates snapshot balances for an account at all snapshots at or after the given block.
   * Clamps negative balances to zero.
   */
  private updateSnapshots(balance: AccountBalance, blockNumber: number): void {
    const cap = clamp0(balance.boughtCap);
    const lp = clamp0(balance.lpBalance);
    const val = cap < lp ? cap : lp;
    for (let i = 0; i < this.snapshots.length; i++) {
      if (blockNumber <= this.snapshots[i]) {
        balance.netBalanceAtSnapshots[i] = val;
      }
    }
  }

  /**
   * Processes a single ERC-20 transfer, updating sender and receiver balances.
   * Only credits the receiver if the sender is an approved source.
   * Handles LP deposit/withdraw adjustments via linked liquidity events.
   * @param transfer - Transfer event to process
   */
  async processTransfer(transfer: Transfer) {
    // skip if the token is not in the eligible list
    if (!CYTOKENS.some((v) => v.address === transfer.tokenAddress)) {
      return;
    }

    const isApproved = await this.isApprovedSource(transfer.from);
    const value = BigInt(transfer.value);

    const accountBalances = this.accountBalancesPerToken.get(
      transfer.tokenAddress
    );

    if (!accountBalances) {
      throw new Error("No account balances found for token");
    }

    // Initialize balances if needed
    if (!accountBalances.has(transfer.to)) {
      accountBalances.set(transfer.to, {
        transfersInFromApproved: 0n,
        transfersOut: 0n,
        netBalanceAtSnapshots: new Array(this.snapshots.length).fill(0n),
        boughtCap: 0n,
        lpBalance: 0n,
      });
    }
    if (!accountBalances.has(transfer.from)) {
      accountBalances.set(transfer.from, {
        transfersInFromApproved: 0n,
        transfersOut: 0n,
        netBalanceAtSnapshots: new Array(this.snapshots.length).fill(0n),
        boughtCap: 0n,
        lpBalance: 0n,
      });
    }

    // LP deposits and withdrawals are neutral to the bought cap —
    // they just move tokens between wallet and pool.
    const isLpDeposit = this.transferIsDeposit(transfer);
    const isLpWithdraw = this.transferIsWithdraw(transfer);
    if (isLpDeposit || isLpWithdraw) {
      return;
    }

    // Bought cap: approved buys increase it, all non-LP transfers out decrease it.
    if (isApproved) {
      const toBalance = accountBalances.get(transfer.to)!;
      toBalance.transfersInFromApproved += value;
      toBalance.boughtCap =
        toBalance.transfersInFromApproved - toBalance.transfersOut;
      this.updateSnapshots(toBalance, transfer.blockNumber);
    }

    const fromBalance = accountBalances.get(transfer.from)!;
    fromBalance.transfersOut += value;
    fromBalance.boughtCap =
      fromBalance.transfersInFromApproved - fromBalance.transfersOut;
    this.updateSnapshots(fromBalance, transfer.blockNumber);
  }

  /**
   * Checks if a transfer corresponds to an LP deposit by matching against organized liquidity events.
   * @param transfer - Transfer to check (sender is the depositor)
   * @returns The matching deposit liquidity event, or undefined
   */
  transferIsDeposit(transfer: Transfer): LiquidityChange | undefined {
    const token = transfer.tokenAddress;
    const txhash = transfer.transactionHash;
    const owner = transfer.from;

    const ownerEvents = this.liquidityEvents.get(owner)
    if (!ownerEvents) return;

    const ownerTokenEvents = ownerEvents.get(token)
    if (!ownerTokenEvents) return;

    const ownerTokenTxEvent = ownerTokenEvents.get(txhash)
    if (!ownerTokenTxEvent) return;

    if (ownerTokenTxEvent.changeType === LiquidityChangeType.Deposit) return ownerTokenTxEvent;
    return;
  }

  /**
   * Checks if a transfer corresponds to an LP withdrawal by matching against organized liquidity events.
   * @param transfer - Transfer to check (receiver is the withdrawer)
   * @returns The matching withdrawal liquidity event, or undefined
   */
  transferIsWithdraw(transfer: Transfer): LiquidityChange | undefined {
    const token = transfer.tokenAddress;
    const txhash = transfer.transactionHash;
    const owner = transfer.to;

    const ownerEvents = this.liquidityEvents.get(owner);
    if (!ownerEvents) return;

    const ownerTokenEvents = ownerEvents.get(token);
    if (!ownerTokenEvents) return;

    const ownerTokenTxEvent = ownerTokenEvents.get(txhash);
    if (!ownerTokenTxEvent) return;

    if (ownerTokenTxEvent.changeType === LiquidityChangeType.Withdraw) return ownerTokenTxEvent;
    return;
  }

  /**
   * Collects all unique addresses from transfer balances and blocklist reporters.
   * @returns Set of lowercased addresses
   */
  getUniqueAddresses(): Set<string> {
    // Get all unique addresses, include reporters as they may have no balance from transfers
    const allAddresses = new Set<string>();
    for (const report of this.reports) {
      allAddresses.add(report.reporter);
    }
    for (const token of CYTOKENS) {
      const accountBalances = this.accountBalancesPerToken.get(
        token.address
      );
      if (!accountBalances) continue;
      for (const [address] of accountBalances) {
        allAddresses.add(address);
      }
    }
    return allAddresses;
  }

  /**
   * Computes reward-eligible balances for all accounts across all tokens.
   * Three passes: (1) average snapshot balances, (2) penalties/bounties, (3) final balances scaled to 18 decimals.
   * @returns Token address → user address → TokenBalances
   */
  async getEligibleBalances(): Promise<EligibleBalances> {
    const allAddresses = await this.getUniqueAddresses();

    const tokenBalances = new Map<string, Map<string, TokenBalances>>();

    for (const token of CYTOKENS) {
      // First pass - calculate base balances
      const userBalances = new Map<string, TokenBalances>();

      for (const address of allAddresses) {
        // Calculate balances for each token
        const accountBalances = this.accountBalancesPerToken.get(
          token.address
        );
        if (!accountBalances) continue;

        const balance = accountBalances.get(address);
        const snapshots = balance?.netBalanceAtSnapshots ?? new Array<bigint>(this.snapshots.length).fill(0n);
        const average = snapshots.reduce((acc, val) => acc + val, 0n) / BigInt(snapshots.length);

        userBalances.set(address, {
          snapshots,
          average,
          penalty: 0n,
          bounty: 0n,
          final: 0n,
          final18: 0n,
        });
      }

      tokenBalances.set(token.address, userBalances);
    }

    // Second pass - calculate penalties and bounties
    for (const token of CYTOKENS) {
      for (const report of this.reports) {
        const userBalances = tokenBalances.get(token.address);
        if (!userBalances) continue;

        const cheater = report.cheater;
        const reporter = report.reporter;

        const cheaterBalance = userBalances.get(cheater);
        const reporterBalance = userBalances.get(reporter);

        if (!cheaterBalance || reporterBalance === undefined) continue;

        const penalty = cheaterBalance.average;
        const bounty = (penalty * BOUNTY_PERCENT) / 100n;

        cheaterBalance.penalty += penalty;
        reporterBalance.bounty += bounty;
      }
    }

    // Third pass - calculate final balances
    for (const token of CYTOKENS) {
      const userBalances = tokenBalances.get(token.address);
      if (!userBalances) continue;

      for (const address of allAddresses) {
        const balance = userBalances.get(address);
        if (!balance) continue;

        balance.final = balance.average - balance.penalty + balance.bounty;
        balance.final18 = scaleTo18(balance.final, token.decimals);
      }
    }

    return tokenBalances;
  }

  /**
   * Sums final18 balances per token across all accounts.
   * @param balances - Eligible balances from getEligibleBalances()
   * @returns Token address → total final18 balance
   */
  calculateTotalEligibleBalances(
    balances: EligibleBalances
  ): Map<string, bigint> {
    // Calculate total of all final balances per token (after penalties)
    const totalBalances = new Map<string, bigint>();
    for (const token of CYTOKENS) {
      const tokenBalances = balances.get(token.address);
      if (!tokenBalances) continue;
      const totalBalance = Array.from(tokenBalances.values()).reduce(
        (acc, balance) => acc + balance.final18,
        0n
      );
      totalBalances.set(token.address, totalBalance);
    }
    return totalBalances;
  }

  /**
   * Filters CYTOKENS to only those with non-zero total eligible balance.
   * @param balances - Eligible balances from getEligibleBalances()
   * @returns CyToken definitions that have at least one account with balance
   */
  getTokensWithBalance(balances: EligibleBalances): CyToken[] {
    const tokensWithBalance: CyToken[] = [];
    const totalBalances = this.calculateTotalEligibleBalances(balances);
    for (const token of CYTOKENS) {
      if (totalBalances.get(token.address)! > 0n) {
        tokensWithBalance.push(token);
      }
    }
    return tokensWithBalance;
  }

  /**
   * Splits the reward pool across tokens using inverse-fraction weighting.
   * Tokens with smaller total balances receive a larger share of rewards.
   * @param balances - Eligible balances from getEligibleBalances()
   * @param rewardPool - Total reward pool in wei
   * @returns Token address → reward pool share for that token
   */
  calculateRewardsPoolsPerToken(
    balances: EligibleBalances,
    rewardPool: bigint
  ): Map<string, bigint> {
    const totalBalances = this.calculateTotalEligibleBalances(balances);

    // we only want to calculate rewards for tokens that have a balance
    const tokensWithBalance = this.getTokensWithBalance(balances);

    const sumOfAllBalances = Array.from(totalBalances.values()).reduce(
      (acc, balance) => acc + balance,
      0n
    );

    // Calculate the inverse fractions for each token
    const tokenInverseFractions = new Map<string, bigint>();
    for (const token of tokensWithBalance) {
      const tokenInverseFraction =
        (sumOfAllBalances * ONE_18) /
        totalBalances.get(token.address)!;
      tokenInverseFractions.set(
        token.address,
        tokenInverseFraction
      );
    }

    // Sum of all inverse fractions
    const sumOfInverseFractions = Array.from(
      tokenInverseFractions.values()
    ).reduce((acc, inverseFraction) => acc + inverseFraction, 0n);

    // Calculate each token's share of the reward pool
    const totalRewardsPerToken = new Map<string, bigint>();
    for (const token of tokensWithBalance) {
      const tokenInverseFraction = tokenInverseFractions.get(
        token.address
      )!;
      const tokenReward =
        (tokenInverseFraction * rewardPool) / sumOfInverseFractions;
      totalRewardsPerToken.set(token.address, tokenReward);
    }

    return totalRewardsPerToken;
  }

  /**
   * End-to-end reward calculation: computes eligible balances, splits the pool across tokens,
   * then distributes each token's share proportionally to account balances.
   * @param rewardPool - Total reward pool in wei
   * @returns Token address → user address → reward amount in wei
   */
  async calculateRewards(rewardPool: bigint): Promise<RewardsPerToken> {
    const balances = await this.getEligibleBalances();

    const totalRewardsPerToken = this.calculateRewardsPoolsPerToken(
      balances,
      rewardPool
    );

    const totalBalances = this.calculateTotalEligibleBalances(balances);

    const tokensWithBalance = this.getTokensWithBalance(balances);
    // Calculate each address's share of the rewards
    const rewards = new Map<string, Map<string, bigint>>();
    for (const token of tokensWithBalance) {
      const tokenBalances = balances.get(token.address);
      if (!tokenBalances) continue;

      const tokenRewards = new Map<string, bigint>();
      for (const [address, balance] of tokenBalances) {
        const reward =
          (balance.final18 *
            totalRewardsPerToken.get(token.address)!) /
          totalBalances.get(token.address)!;
        tokenRewards.set(address, reward);
      }
      rewards.set(token.address, tokenRewards);
    }

    return rewards;
  }

  /**
   * Indexes a liquidity change event by owner → token → txHash for later lookup
   * during transfer processing (transferIsDeposit/transferIsWithdraw).
   * @param liquidityChangeEvent - Liquidity event to index
   */
  organizeLiquidityPositions(liquidityChangeEvent: LiquidityChange) {
    // skip if the token is not in the eligible list
    if (!CYTOKENS.some((v) => v.address === liquidityChangeEvent.tokenAddress)) {
      return;
    }

    const ownerEvents = this.liquidityEvents.get(liquidityChangeEvent.owner);
    if (!ownerEvents) {
      this.liquidityEvents.set(liquidityChangeEvent.owner, new Map([[liquidityChangeEvent.tokenAddress, new Map([[liquidityChangeEvent.transactionHash, liquidityChangeEvent]])]]));
      return;
    }

    const ownerTokenEvents = ownerEvents.get(liquidityChangeEvent.tokenAddress);
    if (!ownerTokenEvents) {
      ownerEvents.set(liquidityChangeEvent.tokenAddress, new Map([[liquidityChangeEvent.transactionHash, liquidityChangeEvent]]));
      return;
    }

    if (ownerTokenEvents.has(liquidityChangeEvent.transactionHash)) {
      throw new Error(`Duplicate liquidity event for owner=${liquidityChangeEvent.owner} token=${liquidityChangeEvent.tokenAddress} txHash=${liquidityChangeEvent.transactionHash}`);
    }
    ownerTokenEvents.set(liquidityChangeEvent.transactionHash, liquidityChangeEvent);
  }

  /**
   * Processes a liquidity change event, updating the owner's balance and snapshot records.
   * For V3 positions, also tracks the position in lp3TrackList for later in-range checks.
   * @param liquidityChangeEvent - Liquidity event to process
   */
  processLiquidityPositions(liquidityChangeEvent: LiquidityChange) {
    // skip if the token is not in the eligible list
    if (!CYTOKENS.some((v) => v.address === liquidityChangeEvent.tokenAddress)) {
      return;
    }

    // the value is positive if its deposit and negative if its
    // withdraw or transfer out, so we do not need to apply +/-
    const depositedBalanceChange = BigInt(liquidityChangeEvent.depositedBalanceChange);

    const accountBalances = this.accountBalancesPerToken.get(
      liquidityChangeEvent.tokenAddress
    );

    if (!accountBalances) {
      throw new Error("No account balances found for token");
    }

    // Initialize balances if needed
    if (!accountBalances.has(liquidityChangeEvent.owner)) {
      accountBalances.set(liquidityChangeEvent.owner, {
        transfersInFromApproved: 0n,
        transfersOut: 0n,
        netBalanceAtSnapshots: new Array(this.snapshots.length).fill(0n),
        boughtCap: 0n,
        lpBalance: 0n,
      });
    }

    const ownerBalance = accountBalances.get(liquidityChangeEvent.owner)!;
    // Update LP balance from liquidity events
    ownerBalance.lpBalance += depositedBalanceChange;

    // Update snapshot balances: eligible = min(boughtCap, lpBalance), clamped to 0
    const cap = clamp0(ownerBalance.boughtCap);
    const lp = clamp0(ownerBalance.lpBalance);
    const value = cap < lp ? cap : lp;
    for (let i = 0; i < this.snapshots.length; i++) {
      if (liquidityChangeEvent.blockNumber <= this.snapshots[i]) {
        ownerBalance.netBalanceAtSnapshots[i] = value;

        // update lp v3 tracklist
        if (liquidityChangeEvent.__typename === "LiquidityV3Change") {
          const id = lpV3PositionId(
            liquidityChangeEvent.tokenAddress,
            liquidityChangeEvent.owner,
            liquidityChangeEvent.poolAddress,
            liquidityChangeEvent.tokenId,
          );
          const prev = this.lp3TrackList[this.snapshots[i]].get(id) ?? {
            value: 0n,
            pool: liquidityChangeEvent.poolAddress,
            lowerTick: liquidityChangeEvent.lowerTick,
            upperTick: liquidityChangeEvent.upperTick,
          };
          prev.value += depositedBalanceChange
          this.lp3TrackList[this.snapshots[i]].set(id, prev);
        }
      }
    }

    accountBalances.set(liquidityChangeEvent.owner, ownerBalance);
  }

  /**
   * Deducts out-of-range V3 LP positions from snapshot balances.
   * Queries on-chain pool ticks at each snapshot block and subtracts position value
   * if the pool's current tick is outside the position's [lowerTick, upperTick] range.
   */
  async processLpRange() {
    // iter snapshots
    for (let i = 0; i < this.snapshots.length; i++) {
      const block = this.snapshots[i];
      const lpTrackList = this.lp3TrackList[this.snapshots[i]];

      // get pools ticks for this snapshot block
      const poolsTicks = await getPoolsTick(
        this.client,
        this.pools,
        block,
      );

      // iter tokens
      for (const [token, account] of this.accountBalancesPerToken) {
        // iter accounts
        for (const [owner, balance] of account) {
          // iter tracked lp v3 position
          for (const [key, lp] of lpTrackList) {
            const tick = poolsTicks[lp.pool];
            if (tick === undefined) continue;

            const idStart = `${token}-${owner}-${lp.pool}-`;
            if (!key.startsWith(idStart)) continue;
            if (lp.value <= 0n) continue;
            if (lp.lowerTick <= tick && tick < lp.upperTick) continue; // skip if in range (upper bound exclusive per Uniswap V3)

            // deduct out of range lp position for snapshot
            balance.netBalanceAtSnapshots[i] -= lp.value;
          }; 
          if (balance.netBalanceAtSnapshots[i] < 0n) {
            balance.netBalanceAtSnapshots[i] = 0n;
          }
        }
      }
    }
  }
}
