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
} from "./types";

interface TransferDetail {
  value: string;
  fromIsApprovedSource: boolean;
}

interface AccountData {
  id: string;
  netBalance: string;
  transfersIn: TransferDetail[];
  transfersOut: { value: string }[];
}

export class Processor {
  private approvedSourceCache = new Map<string, boolean>();
  private accountBalancesPerToken = new Map<
    string,
    Map<string, AccountBalance>
  >();
  private accountTransfers = new Map<string, AccountTransfers>();
  private client;
  private reportsList: { reporter: string; cheater: string }[];

  constructor(
    private snapshot1: number,
    private snapshot2: number,
    private reports: { reporter: string; cheater: string }[] = [],
    client?: any
  ) {
    this.reportsList = reports;
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

  async getEligibleBalances(): Promise<EligibleBalances> {
    const balancesByToken = new Map<string, TokenBalances[]>();
    // Initialize balancesByToken map
    for (const token of CYTOKENS) {
      balancesByToken.set(token.address.toLowerCase(), []);
    }

    interface AddressRow {
      address: string;
      tokenBalances: Map<string, TokenBalances>;
      totalSnapshot1: bigint;
      totalSnapshot2: bigint;
      totalAverage: bigint;
      penalty: bigint;
      bounty: bigint;
      finalBalance: bigint;
      isCheat: boolean;
    }

    let rows: AddressRow[] = [];

    // Get all unique addresses and process each one
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

    // First pass - calculate base balances and penalties
    for (const address of allAddresses) {
      const tokenBalances = new Map<string, TokenBalances>();
      let totalSnapshot1 = 0n;
      let totalSnapshot2 = 0n;
      let hasPositiveBalance = false;

      // Calculate balances for each token
      for (const token of CYTOKENS) {
        const accountBalances = this.accountBalancesPerToken.get(
          token.address.toLowerCase()
        );
        if (!accountBalances) continue;

        const balance = accountBalances.get(address);
        const snapshot1 = balance?.netBalanceAtSnapshot1 || 0n;
        const snapshot2 = balance?.netBalanceAtSnapshot2 || 0n;
        const average = (snapshot1 + snapshot2) / 2n;

        tokenBalances.set(token.address.toLowerCase(), {
          snapshot1,
          snapshot2,
          average,
        });

        if (snapshot1 > 0n) {
          totalSnapshot1 += snapshot1;
          hasPositiveBalance = true;
        }
        if (snapshot2 > 0n) {
          totalSnapshot2 += snapshot2;
          hasPositiveBalance = true;
        }
      }

      const isCheater = this.reports.some(
        (r) => r.cheater.toLowerCase() === address.toLowerCase()
      );
      const totalAverage = (totalSnapshot1 + totalSnapshot2) / 2n;
      const penalty = isCheater ? totalAverage : 0n;

      rows.push({
        address,
        tokenBalances,
        totalSnapshot1,
        totalSnapshot2,
        totalAverage,
        penalty,
        bounty: 0n,
        finalBalance: 0n,
        isCheat: isCheater,
      });
    }

    // Second pass - calculate bounties based on penalties
    for (const report of this.reports) {
      const cheaterRow = rows.find(
        (row) => row.address.toLowerCase() === report.cheater.toLowerCase()
      );
      if (!cheaterRow) continue;

      const reporterRow = rows.find(
        (row) => row.address.toLowerCase() === report.reporter.toLowerCase()
      );
      if (!reporterRow) continue;

      // Add 10% of cheater's penalty to reporter's bounty
      reporterRow.bounty += cheaterRow.penalty / 10n;
    }

    // Final pass - calculate final balances
    for (const row of rows) {
      row.finalBalance = row.totalAverage - row.penalty + row.bounty;
    }

    // Sort rows by final balance and remove zero balances
    rows.sort((a, b) => (b.finalBalance > a.finalBalance ? 1 : -1));
    rows = rows.filter((row) => row.finalBalance > 0n || row.isCheat);

    // Convert back to expected return format
    for (const token of CYTOKENS) {
      balancesByToken.set(
        token.address.toLowerCase(),
        rows.map((row) => row.tokenBalances.get(token.address.toLowerCase())!)
      );
    }

    return {
      addresses: rows.map((row) => row.address),
      balancesByToken,
      totalSnapshot1Balances: rows.map((row) => row.totalSnapshot1),
      totalSnapshot2Balances: rows.map((row) => row.totalSnapshot2),
      totalAverageBalances: rows.map((row) => row.totalAverage),
      penalties: rows.map((row) => row.penalty),
      bounties: rows.map((row) => row.bounty),
      finalBalances: rows.map((row) => row.finalBalance),
    };
  }

  async calculateRewards(
    rewardPool: bigint
  ): Promise<{ addresses: string[]; rewards: bigint[] }> {
    const { addresses, finalBalances } = await this.getEligibleBalances();

    // Calculate total of all final balances (after penalties)
    const totalBalance = finalBalances.reduce(
      (sum, balance) => sum + balance,
      0n
    );

    // Calculate each address's share of the reward pool
    const rewards = finalBalances.map((balance) => {
      return (balance * rewardPool) / totalBalance;
    });

    return { addresses, rewards };
  }
}
