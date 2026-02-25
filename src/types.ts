export interface CyToken {
  name: string;
  address: string;
  underlyingAddress: string;
  underlyingSymbol: string;
  receiptAddress: string;
  decimals: number;
}

export interface Transfer {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  tokenAddress: string;
  transactionHash: string;
}

export interface AccountBalance {
  transfersInFromApproved: bigint;
  transfersOut: bigint;
  netBalanceAtSnapshots: bigint[];
  currentNetBalance: bigint;
}

export interface TokenBalances {
  snapshots: bigint[];
  average: bigint;
  penalty: bigint;
  bounty: bigint;
  final: bigint;
  final18: bigint;
}

export type EligibleBalances = Map<string, Map<string, TokenBalances>>; // token address -> user address -> balances

export type RewardsPerToken = Map<string, Map<string, bigint>>; // token address -> user address -> reward

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
  transactionHash: string;
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

export interface LpV3Position {
  pool: string;
  value: bigint;
  lowerTick: number;
  upperTick: number;
}

