export interface Transfer {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
}

export interface AccountBalance {
  transfersInFromApproved: bigint;
  transfersOut: bigint;
  netBalanceAtSnapshot1: bigint;
  netBalanceAtSnapshot2: bigint;
  currentNetBalance: bigint;
}
