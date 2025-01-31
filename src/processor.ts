import { createPublicClient, http, Address } from "viem";
import { REWARDS_SOURCES, FACTORIES, RPC_URL, isSameAddress } from "./config";
import {
  Transfer,
  AccountBalance,
  Report,
  AccountSummary,
  EligibleBalances,
  TransferRecord,
  AccountTransfers,
} from "./types";
import { writeFile } from "fs/promises";

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
  private accountBalances = new Map<string, AccountBalance>();
  private accountTransfers = new Map<string, AccountTransfers>();
  private client;
  private reportsList: { reporter: string; cheater: string }[];

  constructor(
    private snapshot1: number,
    private snapshot2: number,
    private blocklist: string[] = [],
    private reports: { reporter: string; cheater: string }[] = [],
    client?: any
  ) {
    this.blocklist = blocklist.map((addr) => addr.toLowerCase());
    this.reportsList = reports;
    this.client =
      client ||
      createPublicClient({
        transport: http(RPC_URL),
      });
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

    // Initialize balances if needed
    if (!this.accountBalances.has(transfer.to)) {
      this.accountBalances.set(transfer.to, {
        transfersInFromApproved: 0n,
        transfersOut: 0n,
        netBalanceAtSnapshot1: 0n,
        netBalanceAtSnapshot2: 0n,
        currentNetBalance: 0n,
      });
    }
    if (!this.accountBalances.has(transfer.from)) {
      this.accountBalances.set(transfer.from, {
        transfersInFromApproved: 0n,
        transfersOut: 0n,
        netBalanceAtSnapshot1: 0n,
        netBalanceAtSnapshot2: 0n,
        currentNetBalance: 0n,
      });
    }

    // Update balances
    if (isApproved) {
      const toBalance = this.accountBalances.get(transfer.to)!;
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

      this.accountBalances.set(transfer.to, toBalance);
    }

    // Always track transfers out
    const fromBalance = this.accountBalances.get(transfer.from)!;
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

    this.accountBalances.set(transfer.from, fromBalance);
  }

  async writeAccountData(address: string) {
    const balance = this.accountBalances.get(address);
    const transfers = this.accountTransfers.get(address);

    if (!balance || !transfers) return;

    const accountData: AccountData = {
      id: address,
      netBalance: balance.currentNetBalance.toString(),
      transfersIn: transfers.transfersIn,
      transfersOut: transfers.transfersOut,
    };

    await writeFile(
      `output/${address}.json`,
      JSON.stringify({ data: { account: accountData } }, null, 2)
    );
  }

  private calculatePenaltiesAndBounties(reports: Report[]): Map<
    string,
    {
      penalty: bigint;
      bounty: bigint;
      reportsMade: {
        cheater: string;
        penalizedAmount: bigint;
        bountyAwarded: bigint;
      }[];
      reportsReceived: {
        reporter: string;
        penalizedAmount: bigint;
        bountyAwarded: bigint;
      }[];
    }
  > {
    const results = new Map<
      string,
      {
        penalty: bigint;
        bounty: bigint;
        reportsMade: {
          cheater: string;
          penalizedAmount: bigint;
          bountyAwarded: bigint;
        }[];
        reportsReceived: {
          reporter: string;
          penalizedAmount: bigint;
          bountyAwarded: bigint;
        }[];
      }
    >();

    // Initialize all accounts
    for (const [address] of this.accountBalances) {
      results.set(address, {
        penalty: 0n,
        bounty: 0n,
        reportsMade: [],
        reportsReceived: [],
      });
    }

    // Process each report
    for (const report of reports) {
      const cheaterBalance = this.accountBalances.get(report.cheater);
      if (!cheaterBalance) continue;

      const averageBalance =
        (cheaterBalance.netBalanceAtSnapshot1 +
          cheaterBalance.netBalanceAtSnapshot2) /
        2n;
      const bountyAmount = averageBalance / 10n; // 10% bounty

      // Update cheater's penalty
      const cheaterResult = results.get(report.cheater)!;
      cheaterResult.penalty += averageBalance;
      cheaterResult.reportsReceived.push({
        reporter: report.reporter,
        penalizedAmount: averageBalance,
        bountyAwarded: bountyAmount,
      });

      // Update reporter's bounty
      const reporterResult = results.get(report.reporter);
      if (reporterResult) {
        reporterResult.bounty += bountyAmount;
        reporterResult.reportsMade.push({
          cheater: report.cheater,
          penalizedAmount: averageBalance,
          bountyAwarded: bountyAmount,
        });
      }
    }

    return results;
  }

  async getEligibleBalances(): Promise<EligibleBalances> {
    const addresses: string[] = [];
    const snapshot1Balances: bigint[] = [];
    const snapshot2Balances: bigint[] = [];
    const averageBalances: bigint[] = [];
    const penalties: bigint[] = [];
    const bounties: bigint[] = [];
    const finalBalances: bigint[] = [];

    // First update all final snapshot2 balances to match current
    for (const [address, balance] of this.accountBalances.entries()) {
      if (balance.currentNetBalance > 0n) {
        balance.netBalanceAtSnapshot2 = balance.currentNetBalance;
      }
    }

    // Get all unique addresses (from balances and reports)
    const allAddresses = new Set<string>([
      ...Array.from(this.accountBalances.keys()),
      ...this.reports.map((r) => r.reporter.toLowerCase()),
    ]);

    for (const address of allAddresses) {
      const balance = this.accountBalances.get(address);
      const isReporter = this.reports.some(
        (r) => r.reporter.toLowerCase() === address.toLowerCase()
      );

      // Skip if not a reporter and has no balance
      if (!balance && !isReporter) continue;
      if (balance && balance.currentNetBalance === 0n && !isReporter) continue;

      const avgBalance = balance
        ? (balance.netBalanceAtSnapshot1 + balance.netBalanceAtSnapshot2) / 2n
        : 0n;

      const isBlocklisted = this.blocklist.includes(address.toLowerCase());

      // Calculate bounty if this address is a reporter
      const bounty = this.reports
        .filter(
          (report) => report.reporter.toLowerCase() === address.toLowerCase()
        )
        .reduce((sum, report) => {
          const reportedBalance = this.accountBalances.get(report.cheater);
          if (!reportedBalance) return sum;
          const reportedAvgBalance =
            (reportedBalance.netBalanceAtSnapshot1 +
              reportedBalance.netBalanceAtSnapshot2) /
            2n;
          return sum + reportedAvgBalance / 10n;
        }, 0n);

      // Only include if there's a bounty or a real balance
      if (bounty > 0n || (balance && balance.currentNetBalance > 0n)) {
        addresses.push(address);
        snapshot1Balances.push(balance ? balance.netBalanceAtSnapshot1 : 0n);
        snapshot2Balances.push(balance ? balance.netBalanceAtSnapshot2 : 0n);
        averageBalances.push(avgBalance);
        penalties.push(isBlocklisted ? avgBalance : 0n);
        bounties.push(bounty);
        finalBalances.push(
          avgBalance - (isBlocklisted ? avgBalance : 0n) + bounty
        );
      }
    }

    // Sort by final balance (highest to lowest)
    const sortedIndices = finalBalances
      .map((_, i) => i)
      .sort((a, b) => {
        if (finalBalances[b] > finalBalances[a]) return 1;
        if (finalBalances[b] < finalBalances[a]) return -1;
        return 0;
      });

    return {
      addresses: sortedIndices.map((i) => addresses[i]),
      snapshot1Balances: sortedIndices.map((i) => snapshot1Balances[i]),
      snapshot2Balances: sortedIndices.map((i) => snapshot2Balances[i]),
      averageBalances: sortedIndices.map((i) => averageBalances[i]),
      penalties: sortedIndices.map((i) => penalties[i]),
      bounties: sortedIndices.map((i) => bounties[i]),
      finalBalances: sortedIndices.map((i) => finalBalances[i]),
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

  async generateAccountSummaries(reports: Report[]): Promise<AccountSummary[]> {
    const balances = await this.getEligibleBalances();
    const penaltiesAndBounties = this.calculatePenaltiesAndBounties(reports);

    return balances.addresses.map((address: string, i: number) => ({
      address,
      balanceAtSnapshot1: balances.snapshot1Balances[i].toString(),
      balanceAtSnapshot2: balances.snapshot2Balances[i].toString(),
      averageBalance: balances.averageBalances[i].toString(),
      penalty: balances.penalties[i].toString(),
      bounty: penaltiesAndBounties.get(address)?.bounty.toString() || "0",
      finalBalance: balances.finalBalances[i].toString(),
      reports: {
        asReporter:
          penaltiesAndBounties.get(address)?.reportsMade.map((r) => ({
            cheater: r.cheater,
            penalizedAmount: r.penalizedAmount.toString(),
            bountyAwarded: r.bountyAwarded.toString(),
          })) || [],
        asCheater:
          penaltiesAndBounties.get(address)?.reportsReceived.map((r) => ({
            reporter: r.reporter,
            penalizedAmount: r.penalizedAmount.toString(),
            bountyAwarded: r.bountyAwarded.toString(),
          })) || [],
      },
      transfers: this.accountTransfers.get(address) || {
        transfersIn: [],
        transfersOut: [],
      },
    }));
  }
}
