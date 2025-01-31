export interface Transfer {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
}

export interface TransferDetail {
  value: string;
  fromIsApprovedSource: boolean;
}

export interface AccountBalance {
  transfersInFromApproved: bigint;
  transfersOut: bigint;
  netBalanceAtSnapshot1: bigint;
  netBalanceAtSnapshot2: bigint;
  currentNetBalance: bigint;
}

export interface Report {
  reporter: string;
  cheater: string;
}

export interface AccountSummary {
  address: string;
  balanceAtSnapshot1: string;
  balanceAtSnapshot2: string;
  averageBalance: string;
  penalty: string;
  bounty: string;
  finalBalance: string;
  reports: {
    asReporter: {
      cheater: string;
      penalizedAmount: string;
      bountyAwarded: string;
    }[];
    asCheater: {
      reporter: string;
      penalizedAmount: string;
      bountyAwarded: string;
    }[];
  };
  transfers: AccountTransfers;
}

export interface EligibleBalances {
  addresses: string[];
  snapshot1Balances: bigint[];
  snapshot2Balances: bigint[];
  averageBalances: bigint[];
  penalties: bigint[];
  bounties: bigint[];
  finalBalances: bigint[];
}

export interface TransferRecord {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  fromIsApprovedSource?: boolean;
}

export interface AccountTransfers {
  transfersIn: TransferDetail[];
  transfersOut: { value: string }[];
}
