export interface CyToken {
  name: string;
  address: string;
  underlyingAddress: string;
  underlyingSymbol: string;
  receiptAddress: string;
}

export interface Transfer {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  tokenAddress: string;
}

export interface TransferDetail {
  value: string;
  fromIsApprovedSource: boolean;
}

export interface AccountBalance {
  transfersInFromApproved: bigint;
  transfersOut: bigint;
  netBalanceAtSnapshots: bigint[];
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

export interface TokenBalances {
  snapshots: bigint[];
  average: bigint;
  penalty: bigint;
  bounty: bigint;
  final: bigint;
}

export type EligibleBalances = Map<string, Map<string, TokenBalances>>; // token address -> user address -> balances

export type RewardsPerToken = Map<string, Map<string, bigint>>; // token address -> user address -> reward

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

export enum LiquidityChangeType {
  Deposit = 'DEPOSIT',
  Transfer = 'TRANSFER',
  Withdraw = 'WITHDRAW'
}

export type LiquidityChangeBase = {
  tokenAddress: string;
  lpAddress: string;
  owner: string;
  changeType: LiquidityChangeType;
  liquidityChange: string;
  depositedBalanceChange: string;
  blockNumber: number;
  timestamp: number;
}

export type LiquidityChangeV2 = LiquidityChangeBase & {
  __typename: "LiquidityV2Change";
}

export type LiquidityChangeV3 = LiquidityChangeBase & {
  __typename: "LiquidityV3Change";
  tokenId: string;
  poolAddress: string;
  fee: number;
  lowerTick: number;
  upperTick: number;
}

export type LiquidityChange = LiquidityChangeV2 | LiquidityChangeV3;

export type Epoch = {
  // number of days in the epoch
  length: number;
  // epoch timestamp
  timestamp: number;
  date?: string;
};
