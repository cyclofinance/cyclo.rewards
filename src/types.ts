/**
 * Shared TypeScript interfaces and types for the Cyclo rewards pipeline.
 */

/** Cyclo token definition with contract addresses and decimal precision */
export interface CyToken {
  name: string;
  address: string;
  /** Address of the underlying asset (e.g., sFLR, WETH, FXRP) */
  underlyingAddress: string;
  /** Symbol of the underlying asset (e.g., "sFLR", "WETH", "FXRP") */
  underlyingSymbol: string;
  /** Address of the receipt token issued on deposit */
  receiptAddress: string;
  /** Number of decimal places for the token (e.g., 18 for cysFLR, 6 for cyFXRP) */
  decimals: number;
}

/** On-chain ERC-20 transfer event parsed from the subgraph */
export interface Transfer {
  from: string;
  to: string;
  /** Transfer amount as a decimal string (not yet parsed to BigInt) */
  value: string;
  blockNumber: number;
  timestamp: number;
  tokenAddress: string;
  transactionHash: string;
}

/** Per-account running balance for a single token, updated during transfer processing */
export interface AccountBalance {
  /** Cumulative value received from approved sources (DEX routers, LP deposits) */
  transfersInFromApproved: bigint;
  /** Cumulative value sent out */
  transfersOut: bigint;
  /** Balance snapshot at each of the 30 deterministic snapshot blocks */
  netBalanceAtSnapshots: bigint[];
  /** Running net balance (transfersInFromApproved - transfersOut) */
  currentNetBalance: bigint;
}

/**
 * Aggregated balance data for a single account and token after all transfers are processed.
 * `final` is in the token's native decimals; `final18` is scaled to 18 decimals for cross-token comparison.
 */
export interface TokenBalances {
  /** Balance at each snapshot block */
  snapshots: bigint[];
  /** Mean of snapshot balances */
  average: bigint;
  /** Amount penalized (blocklisted accounts forfeit their average) */
  penalty: bigint;
  /** Bounty received for reporting a blocklisted account */
  bounty: bigint;
  /** Final reward-eligible balance in native token decimals: average - penalty + bounty */
  final: bigint;
  /** Final balance scaled to 18 decimal places */
  final18: bigint;
}

/** Token address → user address → balances */
export type EligibleBalances = Map<string, Map<string, TokenBalances>>;

/** Token address → user address → reward amount (wei) */
export type RewardsPerToken = Map<string, Map<string, bigint>>;

/** Type of liquidity position change event from the subgraph */
export enum LiquidityChangeType {
  Deposit = 'DEPOSIT',
  Transfer = 'TRANSFER',
  Withdraw = 'WITHDRAW'
}

/** Common fields for all liquidity change events (V2 and V3) */
export interface LiquidityChangeBase {
  tokenAddress: string;
  lpAddress: string;
  owner: string;
  changeType: LiquidityChangeType;
  /** Change in pool liquidity units as a decimal string */
  liquidityChange: string;
  /** Change in deposited token balance as a decimal string (positive for deposits, negative for withdrawals) */
  depositedBalanceChange: string;
  blockNumber: number;
  timestamp: number;
  transactionHash: string;
}

/** Uniswap V2 liquidity change event */
export type LiquidityChangeV2 = LiquidityChangeBase & {
  __typename: "LiquidityV2Change";
}

/** Uniswap V3 liquidity change event with concentrated liquidity position data */
export type LiquidityChangeV3 = LiquidityChangeBase & {
  __typename: "LiquidityV3Change";
  /** NFT token ID identifying the V3 position */
  tokenId: string;
  poolAddress: string;
  /** Pool fee tier (e.g., 3000 = 0.3%) */
  fee: number;
  /** Lower tick boundary of the concentrated liquidity range */
  lowerTick: number;
  /** Upper tick boundary of the concentrated liquidity range */
  upperTick: number;
}

/** Discriminated union of V2 and V3 liquidity change events */
export type LiquidityChange = LiquidityChangeV2 | LiquidityChangeV3;

/** Entry from data/blocklist.txt: a reporter who flagged a cheating account */
export interface BlocklistReport {
  reporter: string;
  cheater: string;
}

/** Tracked Uniswap V3 LP position for in-range tick calculations */
export interface LpV3Position {
  pool: string;
  /** Deposited balance in the position */
  value: bigint;
  lowerTick: number;
  upperTick: number;
}
