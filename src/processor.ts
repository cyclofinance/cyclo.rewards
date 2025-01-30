import { createPublicClient, http, Address } from "viem";
import { REWARDS_SOURCES, FACTORIES, RPC_URL, isSameAddress } from "./config";
import { Transfer, AccountBalance } from "./types";
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
  private accountTransfers = new Map<
    string,
    {
      transfersIn: TransferDetail[];
      transfersOut: { value: string }[];
    }
  >();
  private client = createPublicClient({
    transport: http(RPC_URL),
  });

  constructor(private snapshot1: number, private snapshot2: number) {}

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

  async getEligibleBalances(
    blocklist: string[]
  ): Promise<[string[], bigint[], bigint[], bigint[]]> {
    const addresses: string[] = [];
    const balancesAtSnapshot1: bigint[] = [];
    const balancesAtSnapshot2: bigint[] = [];
    const averageBalances: bigint[] = [];
    let totalEligible = 0n;

    // First update all final snapshot2 balances to match current if after snapshot2
    for (const [address, balance] of this.accountBalances.entries()) {
      if (balance.currentNetBalance > 0n) {
        balance.netBalanceAtSnapshot2 = balance.currentNetBalance;
      }
    }

    for (const [address, balance] of this.accountBalances.entries()) {
      if (balance.currentNetBalance === 0n) continue;
      if (blocklist.includes(address.toLowerCase())) continue;

      const avgBalance =
        (balance.netBalanceAtSnapshot1 + balance.netBalanceAtSnapshot2) / 2n;

      addresses.push(address);
      balancesAtSnapshot1.push(balance.netBalanceAtSnapshot1);
      balancesAtSnapshot2.push(balance.netBalanceAtSnapshot2);
      averageBalances.push(avgBalance);
      totalEligible += avgBalance;
    }

    // Sort by average balance (highest to lowest)
    const sortedIndices = averageBalances
      .map((_, i) => i)
      .sort((a, b) => {
        if (averageBalances[b] > averageBalances[a]) return 1;
        if (averageBalances[b] < averageBalances[a]) return -1;
        return 0;
      });

    console.log(
      `\nTotal eligible balance (average): ${totalEligible.toString()}`
    );

    return [
      sortedIndices.map((i) => addresses[i]),
      sortedIndices.map((i) => balancesAtSnapshot1[i]),
      sortedIndices.map((i) => balancesAtSnapshot2[i]),
      sortedIndices.map((i) => averageBalances[i]),
    ];
  }

  async calculateRewards(rewardPool: bigint): Promise<[string[], bigint[]]> {
    const [addresses, , , averageBalances] = await this.getEligibleBalances([]);

    // Calculate total of all average balances
    const totalBalance = averageBalances.reduce(
      (sum, balance) => sum + balance,
      0n
    );

    // Calculate each address's share of the reward pool
    const rewards = averageBalances.map((balance) => {
      // Use multiplication before division to maintain precision
      return (balance * rewardPool) / totalBalance;
    });

    return [addresses, rewards];
  }
}
