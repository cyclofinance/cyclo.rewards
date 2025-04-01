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
} from "./types";
import { ONE } from "./constants";

export class Processor {
  private approvedSourceCache = new Map<string, boolean>();
  private accountBalancesPerToken = new Map<
    string,
    Map<string, AccountBalance>
  >();
  private accountTransfers = new Map<string, AccountTransfers>();
  private client;

  constructor(
    private snapshot1: number,
    private snapshot2: number,
    private reports: { reporter: string; cheater: string }[] = [],
    client?: any
  ) {
    this.client =
      client ||
      createPublicClient({
        transport: http(RPC_URL),
      });

    // Initialize token balances maps
    for (const token of CYTOKENS) {
      const balanceMap = new Map<string, AccountBalance>();
      this.accountBalancesPerToken.set(token.address.toLowerCase(), balanceMap);
    }
  }

  async isApprovedSource(source: string): Promise<boolean> {
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

      const isApproved = FACTORIES.some((addr) => isSameAddress(addr, factory));
      this.approvedSourceCache.set(source.toLowerCase(), isApproved);
      return isApproved;
    } catch {
      this.approvedSourceCache.set(source.toLowerCase(), false);
      return false;
    }
  }

  async processTransfer(transfer: Transfer) {
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
        netBalanceAtSnapshot1: 0n,
        netBalanceAtSnapshot2: 0n,
        currentNetBalance: 0n,
      });
    }
    if (!accountBalances.has(transfer.from)) {
      accountBalances.set(transfer.from, {
        transfersInFromApproved: 0n,
        transfersOut: 0n,
        netBalanceAtSnapshot1: 0n,
        netBalanceAtSnapshot2: 0n,
        currentNetBalance: 0n,
      });
    }

    // Update balances
    if (isApproved) {
      const toBalance = accountBalances.get(transfer.to)!;
      toBalance.transfersInFromApproved += value;
      toBalance.currentNetBalance =
        toBalance.transfersInFromApproved - toBalance.transfersOut;
      if (toBalance.currentNetBalance < 0n) toBalance.currentNetBalance = 0n;

      // Update snapshot balances
      if (transfer.blockNumber <= this.snapshot1) {
        toBalance.netBalanceAtSnapshot1 = toBalance.currentNetBalance;
      }
      if (transfer.blockNumber <= this.snapshot2) {
        toBalance.netBalanceAtSnapshot2 = toBalance.currentNetBalance;
      }

      accountBalances.set(transfer.to, toBalance);
    }

    // Always track transfers out
    const fromBalance = accountBalances.get(transfer.from)!;
    fromBalance.transfersOut += value;
    fromBalance.currentNetBalance =
      fromBalance.transfersInFromApproved - fromBalance.transfersOut;
    if (fromBalance.currentNetBalance < 0n) fromBalance.currentNetBalance = 0n;

    // Update snapshot balances
    if (transfer.blockNumber <= this.snapshot1) {
      fromBalance.netBalanceAtSnapshot1 = fromBalance.currentNetBalance;
    }
    if (transfer.blockNumber <= this.snapshot2) {
      fromBalance.netBalanceAtSnapshot2 = fromBalance.currentNetBalance;
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
        const snapshot1 = balance?.netBalanceAtSnapshot1 || 0n;
        const snapshot2 = balance?.netBalanceAtSnapshot2 || 0n;
        const average = (snapshot1 + snapshot2) / 2n;

        userBalances.set(address, {
          snapshot1,
          snapshot2,
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
}
