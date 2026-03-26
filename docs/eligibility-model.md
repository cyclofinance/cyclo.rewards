# Eligibility Model (2026+)

## Overview

Rewards are for providing liquidity with cy* tokens purchased from approved sources. Two independent values are tracked per account, per token:

1. **Bought cap**: `approved_in - transfers_out` (clamped to 0)
2. **LP balance**: cumulative `depositedBalanceChange` from liquidity events (clamped to 0)

The eligible balance at each snapshot is `min(bought_cap, lp_balance)`.

## Bought Cap

- **Increases** when the user receives cy* from an approved source (DEX router, approved pool). This represents a real purchase that creates buy pressure.
- **Decreases** when the user sends cy* anywhere that is NOT an LP deposit or withdrawal. This represents a sale or transfer that removes buy pressure.
- **Unchanged** by LP deposits and withdrawals. Moving cy* between wallet and pool is not a buy or sale.

All transfers out (non-LP) count against the cap — including transfers to other wallets, not just DEX sales. This is because any transfer out has the same net effect as a sale from the protocol's perspective.

## LP Balance

- **Increases** on LP deposits by the deposited cy* amount.
- **Decreases** on LP withdrawals, pro-rata by LP token ratio (not by actual cy* returned).
- **Updated** on LP Transfer events (V2 LP token transfers between owners).

The LP balance is denominated in deposit-time cy* values. Pool rebalancing (composition changes due to trades) does not directly change the tracked LP balance. However, a user can extract rebalancing gains by partially withdrawing (which deducts pro-rata from the deposit value) and redepositing (which adds the actual cy* amount). This effectively brings their LP balance closer to their bought cap without additional purchases.

### Pro-rata withdrawal mechanics

On withdrawal, the deduction is:
```
ratio = withdrawn_LP_tokens / total_LP_tokens
deduction = current_deposit_balance * ratio
```

This is safe across arbitrary interleaved deposits and withdrawals because the deposit-to-liquidity ratio is preserved across partial withdrawals. New deposits change the ratio, but withdrawals preserve it. Total deductions across all withdrawals always equal total deposits.

Precision: BigInt division truncation can accumulate dust (a few wei) over many small withdrawals. This is not a correctness concern.

## Snapshot Values

At each of the 30 deterministic snapshot blocks:
1. Compute `min(clamp0(bought_cap), clamp0(lp_balance))` per token per account
2. For V3 positions, deduct out-of-range position values from the snapshot
3. Clamp final snapshot value to 0

The average of 30 snapshot values is the account's eligible balance for the epoch.

## Design Rationale

### Why not credit approved-source buys directly?

The bought cap represents the maximum rewards entitlement — how much buy pressure the user created. But rewards are only paid on LP-deposited tokens, because the program incentivizes liquidity provision, not just holding.

### Why are LP movements neutral to the bought cap?

Depositing into LP moves cy* from wallet to pool but doesn't create new buy pressure. Withdrawing moves cy* from pool to wallet but doesn't create sell pressure. The user's net market impact is unchanged by LP movements.

### Why are all non-LP transfers out counted as sells?

Any transfer of cy* out of the wallet (other than LP deposits) could be a sale. Even transfers to another wallet reduce the user's commitment. The docs recommend using a dedicated wallet to avoid accidental cap reduction.

### What about rebalancing to form LP pairs?

If a user buys 200 cy* then sells 100 cy* to get the paired token for LP, their bought cap is 100 (200 bought - 100 sold). They can LP the remaining 100 cy* and earn rewards on up to 100. The rebalancing sale correctly reduces the cap because it created real sell pressure.

### Staying in range without rebalancing

To guarantee a V3 position remains in range at every snapshot without needing to rebalance (which would create sell pressure and reduce the bought cap), use a stable pair (e.g. cyWETH/USDC.e) with a full $0-1 price range. Since cy* tokens always trade between $0-1, this range is always in-range and never requires adjustment.

Volatile pairs (e.g. cyWETH/WFLR) move with the paired token's price and may go out of range, requiring rebalancing that counts as a sale against the bought cap.

### Can pool composition changes inflate eligibility?

If the pool rebalances in the user's favor (more cy* in their position), they can extract the gain by partial withdraw + redeposit, increasing their LP balance toward the bought cap. This is acceptable because:
- The LP absorbed someone else's sell pressure (a market service)
- The bought cap remains the hard ceiling — eligibility can never exceed actual purchases
- The user must actively manage their position to capture this, which is desired behavior for V3 LP

This area warrants ongoing review for potential edge case exploits.
