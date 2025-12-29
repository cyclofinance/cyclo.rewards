import { createPublicClient, http, Address } from "viem";
import {
  REWARDS_SOURCES,
  FACTORIES,
  RPC_URL,
  isSameAddress,
  CYTOKENS,
} from "./config";
import {
  Transfer,
  AccountBalance,
  EligibleBalances,
  AccountTransfers,
  TokenBalances,
  RewardsPerToken,
  CyToken,
  LiquidityChange,
} from "./types";
import { ONE } from "./constants";
import { flare } from "viem/chains";
import { getPoolsTick } from "./liquidity";

export class Processor {
  private approvedSourceCache = new Map<string, boolean>();
  private accountBalancesPerToken = new Map<
    string,
    Map<string, AccountBalance>
  >();
  private accountTransfers = new Map<string, AccountTransfers>();
  private client;
  private lp3TrackList: Record<number, Map<string, {
    pool: string;
    value: bigint;
    lowerTick: number;
    upperTick: number;
  }>> = {};

  constructor(
    private snapshots: number[],
    private epochLength: number,
    private reports: { reporter: string; cheater: string }[] = [],
    client?: any,
    private pools: `0x${string}`[] = [],
  ) {
    this.client =
      client ||
      createPublicClient({
        transport: http(RPC_URL),
        chain: flare,
      });

    // Initialize token balances maps
    for (const token of CYTOKENS) {
      const balanceMap = new Map<string, AccountBalance>();
      this.accountBalancesPerToken.set(token.address.toLowerCase(), balanceMap);
    }

    // start empty list
    for (const snp of snapshots) {
      this.lp3TrackList[snp] = new Map();
    }
  }

  async isApprovedSource(source: string, retries = 8): Promise<boolean> {
    // Check cache first
    if (this.approvedSourceCache.has(source.toLowerCase())) {
      return this.approvedSourceCache.get(source.toLowerCase())!;
    }

    // Check direct sources
    if (REWARDS_SOURCES.some((addr) => isSameAddress(addr, source))) {
      this.approvedSourceCache.set(source.toLowerCase(), true);
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
        this.approvedSourceCache.set(source.toLowerCase(), isApproved);
        return isApproved;
      } catch (e: any) {
        // Check if this is a "no data returned" error (contract doesn't have factory function)
        if (
          e.shortMessage &&
          (e.shortMessage.includes('returned no data ("0x")') ||
            e.shortMessage.includes("reverted") ||
            e.shortMessage.includes("invalid parameters"))
        ) {
          this.approvedSourceCache.set(source.toLowerCase(), false);
          return false;
        }

        // For other errors (like rate limits), retry if we have attempts left
        if (attempt < retries - 1) {
          // Add exponential backoff
          const delay = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s, etc.
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If we've exhausted all retries, log and return false
        console.log(`Failed to check factory after ${retries} attempts:`, e);
        this.approvedSourceCache.set(source.toLowerCase(), false);
        return false;
      }
    }

    return false;
  }

  async processTransfer(transfer: Transfer) {
    // skip if the token is not in the eligible list
    if (!CYTOKENS.some((v) => v.address.toLowerCase() === transfer.tokenAddress.toLowerCase())) {
      return;
    }

    const isApproved = await this.isApprovedSource(transfer.from);
    const value = BigInt(transfer.value);

    // Track transfers for receiver
    if (!this.accountTransfers.has(transfer.to)) {
      this.accountTransfers.set(transfer.to, {
        transfersIn: [],
        transfersOut: [],
      });
    }
    this.accountTransfers.get(transfer.to)!.transfersIn.push({
      value: transfer.value,
      fromIsApprovedSource: isApproved,
    });

    // Track transfers for sender
    if (!this.accountTransfers.has(transfer.from)) {
      this.accountTransfers.set(transfer.from, {
        transfersIn: [],
        transfersOut: [],
      });
    }
    this.accountTransfers.get(transfer.from)!.transfersOut.push({
      value: transfer.value,
    });

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
        netBalanceAtSnapshots: new Array(this.epochLength).fill(0n),
        currentNetBalance: 0n,
      });
    }
    if (!accountBalances.has(transfer.from)) {
      accountBalances.set(transfer.from, {
        transfersInFromApproved: 0n,
        transfersOut: 0n,
        netBalanceAtSnapshots: new Array(this.epochLength).fill(0n),
        currentNetBalance: 0n,
      });
    }

    // Update balances
    if (isApproved) {
      const toBalance = accountBalances.get(transfer.to)!;
      toBalance.transfersInFromApproved += value;
      toBalance.currentNetBalance =
        toBalance.transfersInFromApproved - toBalance.transfersOut;

      // Update snapshot balances
      const val = toBalance.currentNetBalance < 0n ? 0n : toBalance.currentNetBalance;
      for (let i = 0; i < this.snapshots.length; i++) {
        if (transfer.blockNumber <= this.snapshots[i]) {
          toBalance.netBalanceAtSnapshots[i] = val;
        }
      }

      accountBalances.set(transfer.to, toBalance);
    }

    // Always track transfers out
    const fromBalance = accountBalances.get(transfer.from)!;
    fromBalance.transfersOut += value;
    fromBalance.currentNetBalance =
      fromBalance.transfersInFromApproved - fromBalance.transfersOut;

    // Update snapshot balances
    const val = fromBalance.currentNetBalance < 0n ? 0n : fromBalance.currentNetBalance;
    for (let i = 0; i < this.snapshots.length; i++) {
      if (transfer.blockNumber <= this.snapshots[i]) {
        fromBalance.netBalanceAtSnapshots[i] = val;
      }
    }

    accountBalances.set(transfer.from, fromBalance);
  }

  async getUniqueAddresses(): Promise<Set<string>> {
    // Get all unique addresses, include reporters as they may have no balance from transfers
    const allAddresses = new Set<string>();
    for (const report of this.reports) {
      allAddresses.add(report.reporter.toLowerCase());
    }
    for (const token of CYTOKENS) {
      const accountBalances = this.accountBalancesPerToken.get(
        token.address.toLowerCase()
      );
      if (!accountBalances) continue;
      for (const [address] of accountBalances) {
        allAddresses.add(address);
      }
    }
    return allAddresses;
  }

  async getEligibleBalances(): Promise<EligibleBalances> {
    const allAddresses = await this.getUniqueAddresses();

    const tokenBalances = new Map<string, Map<string, TokenBalances>>();

    for (const token of CYTOKENS) {
      // First pass - calculate base balances and penalties
      const userBalances = new Map<string, TokenBalances>();

      for (const address of allAddresses) {
        // Calculate balances for each token
        const accountBalances = this.accountBalancesPerToken.get(
          token.address.toLowerCase()
        );
        if (!accountBalances) continue;

        const balance = accountBalances.get(address.toLowerCase());
        const snapshots = balance?.netBalanceAtSnapshots ?? new Array<bigint>(this.epochLength).fill(0n);
        const average = snapshots.reduce((acc, val) => acc + val, 0n) / BigInt(snapshots.length);

        userBalances.set(address, {
          snapshots,
          average,
          penalty: 0n,
          bounty: 0n,
          final: 0n,
        });
      }

      tokenBalances.set(token.address.toLowerCase(), userBalances);
    }

    // Second pass - calculate bounties based on penalties
    for (const token of CYTOKENS) {
      for (const report of this.reports) {
        const userBalances = tokenBalances.get(token.address.toLowerCase());
        if (!userBalances) continue;

        const cheater = report.cheater.toLowerCase();
        const reporter = report.reporter.toLowerCase();

        const cheaterBalance = userBalances.get(cheater);
        const reporterBalance = userBalances.get(reporter);

        if (!cheaterBalance || reporterBalance === undefined) continue;

        const penalty = cheaterBalance.average;
        const bounty = (penalty * 10n) / 100n;

        cheaterBalance.penalty += penalty;
        reporterBalance.bounty += bounty;
      }
    }

    // Third pass - calculate final balances
    for (const token of CYTOKENS) {
      const userBalances = tokenBalances.get(token.address.toLowerCase());
      if (!userBalances) continue;

      for (const address of allAddresses) {
        const balance = userBalances.get(address);
        if (!balance) continue;

        balance.final = balance.average - balance.penalty + balance.bounty;
      }
    }

    return tokenBalances;
  }

  calculateTotalEligibleBalances(
    balances: EligibleBalances
  ): Map<string, bigint> {
    // Calculate total of all final balances per token (after penalties)
    const totalBalances = new Map<string, bigint>();
    for (const token of CYTOKENS) {
      const tokenBalances = balances.get(token.address.toLowerCase());
      if (!tokenBalances) continue;
      const totalBalance = Array.from(tokenBalances.values()).reduce(
        (acc, balance) => acc + balance.final,
        0n
      );
      totalBalances.set(token.address.toLowerCase(), totalBalance);
    }
    return totalBalances;
  }

  getTokensWithBalance(balances: EligibleBalances): CyToken[] {
    const tokensWithBalance: CyToken[] = [];
    const totalBalances = this.calculateTotalEligibleBalances(balances);
    for (const token of CYTOKENS) {
      if (totalBalances.get(token.address.toLowerCase())! > 0n) {
        tokensWithBalance.push(token);
      }
    }
    return tokensWithBalance;
  }

  calculateRewardsPoolsPertoken(
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
        (sumOfAllBalances * ONE) /
        totalBalances.get(token.address.toLowerCase())!;
      tokenInverseFractions.set(
        token.address.toLowerCase(),
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
        token.address.toLowerCase()
      )!;
      const tokenReward =
        (tokenInverseFraction * rewardPool) / sumOfInverseFractions;
      console.log(`Total rewards for ${token.name}: ${tokenReward}`);
      totalRewardsPerToken.set(token.address.toLowerCase(), tokenReward);
    }

    return totalRewardsPerToken;
  }

  async calculateRewards(rewardPool: bigint): Promise<RewardsPerToken> {
    const balances = await this.getEligibleBalances();

    const totalRewardsPerToken = this.calculateRewardsPoolsPertoken(
      balances,
      rewardPool
    );

    const totalBalances = this.calculateTotalEligibleBalances(balances);

    const tokensWithBalance = this.getTokensWithBalance(balances);
    // Calculate each address's share of the rewards
    const rewards = new Map<string, Map<string, bigint>>();
    for (const token of tokensWithBalance) {
      const tokenBalances = balances.get(token.address.toLowerCase());
      if (!tokenBalances) continue;

      const tokenRewards = new Map<string, bigint>();
      for (const [address, balance] of tokenBalances) {
        const reward =
          (balance.final *
            totalRewardsPerToken.get(token.address.toLowerCase())!) /
          totalBalances.get(token.address.toLowerCase())!;
        tokenRewards.set(address, reward);
      }
      rewards.set(token.address.toLowerCase(), tokenRewards);
    }

    return rewards;
  }

  async processLiquidityPositions(liquidityChangeEvent: LiquidityChange) {
    // skip if the token is not in the eligible list
    if (!CYTOKENS.some((v) => v.address.toLowerCase() === liquidityChangeEvent.tokenAddress.toLowerCase())) {
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
        netBalanceAtSnapshots: new Array(this.epochLength).fill(0n),
        currentNetBalance: 0n,
      });
    }

    const ownerBalance = accountBalances.get(liquidityChangeEvent.owner)!;
    ownerBalance.currentNetBalance += depositedBalanceChange; // include the liquidity change to the net balance

    // Update snapshot balances
    const value = ownerBalance.currentNetBalance < 0n ? 0n : ownerBalance.currentNetBalance;
    for (let i = 0; i < this.snapshots.length; i++) {
      if (liquidityChangeEvent.blockNumber <= this.snapshots[i]) {
        ownerBalance.netBalanceAtSnapshots[i] = value;

        // update lp v3 tracklist
        if (liquidityChangeEvent.__typename === "LiquidityV3Change") {
          const id =`${
            liquidityChangeEvent.tokenAddress.toLowerCase()
          }-${
            liquidityChangeEvent.owner.toLowerCase()
          }-${
            liquidityChangeEvent.poolAddress.toLowerCase()
          }-${
            liquidityChangeEvent.tokenId
          }`;
          const prev = this.lp3TrackList[this.snapshots[i]].get(id) ?? {
            value: 0n,
            pool: liquidityChangeEvent.poolAddress.toLowerCase(),
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

  // update each account's snapshots balances with lp v3 price range factored in
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
            const pool = lp.pool.toLowerCase();
            const tick = poolsTicks[pool];
            if (tick === undefined) continue;

            const idStart = `${token.toLowerCase()}-${owner.toLowerCase()}-${pool}`;
            if (!key.startsWith(idStart)) continue;
            if (lp.value <= 0n) continue;
            if (lp.lowerTick <= tick && tick <= lp.upperTick) continue; // skip if in range

            // deduct out of range lp position for snapshot
            balance.netBalanceAtSnapshots[i] -= lp.value;
          }; 
        }
      }
    }
  }
}
