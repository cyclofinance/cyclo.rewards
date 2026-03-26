/**
 * Finds the Flare C-chain block numbers at the start and end of a given epoch.
 *
 * Usage: nix develop -c npx tsx scripts/find-epoch-blocks.ts <epoch-number>
 *
 * Epoch number is 1-indexed from the rFLR Emissions Epochs Schedule.
 * Each epoch ends at 12:00 UTC on the scheduled date; the start is the
 * end of the previous epoch.
 */

import { createPublicClient, http } from "viem";
import { flare } from "viem/chains";
import { config } from "dotenv";

config();

// rFLR Emissions Epochs Schedule — epoch END dates at 12:00 UTC
const EPOCH_ENDS = [
  "2024-07-06T12:00:00Z",
  "2024-08-05T12:00:00Z",
  "2024-09-04T12:00:00Z",
  "2024-10-04T12:00:00Z",
  "2024-11-03T12:00:00Z",
  "2024-12-03T12:00:00Z",
  "2025-01-02T12:00:00Z",
  "2025-02-01T12:00:00Z",
  "2025-03-03T12:00:00Z",
  "2025-04-02T12:00:00Z",
  "2025-05-02T12:00:00Z",
  "2025-06-01T12:00:00Z",
  "2025-07-01T12:00:00Z",
  "2025-07-31T12:00:00Z",
  "2025-08-30T12:00:00Z",
  "2025-09-29T12:00:00Z",
  "2025-10-29T12:00:00Z",
  "2025-11-28T12:00:00Z",
  "2025-12-28T12:00:00Z",
  "2026-01-27T12:00:00Z",
  "2026-02-26T12:00:00Z",
  "2026-03-28T12:00:00Z",
  "2026-04-27T12:00:00Z",
  "2026-05-27T12:00:00Z",
];

async function findBlockAtTimestamp(
  client: ReturnType<typeof createPublicClient>,
  targetTimestamp: number,
): Promise<bigint> {
  let lo = 1n;
  let hi = (await client.getBlock({ blockTag: "latest" })).number;

  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const block = await client.getBlock({ blockNumber: mid });
    if (Number(block.timestamp) < targetTimestamp) {
      lo = mid + 1n;
    } else {
      hi = mid;
    }
  }
  return lo;
}

async function main() {
  const epochNumber = parseInt(process.argv[2]);
  if (!epochNumber || epochNumber < 1 || epochNumber > EPOCH_ENDS.length) {
    console.error(`Usage: npx tsx scripts/find-epoch-blocks.ts <epoch-number>`);
    console.error(`  epoch-number: 1-${EPOCH_ENDS.length}`);
    process.exit(1);
  }

  const epochEndDate = EPOCH_ENDS[epochNumber - 1];
  const epochStartDate = epochNumber === 1 ? null : EPOCH_ENDS[epochNumber - 2];

  console.log(`Epoch ${epochNumber}:`);
  if (epochStartDate) {
    console.log(`  Start: ${epochStartDate}`);
  }
  console.log(`  End:   ${epochEndDate}`);

  const client = createPublicClient({
    chain: flare,
    transport: http(process.env.RPC_URL),
  });

  const endTimestamp = Math.floor(new Date(epochEndDate).getTime() / 1000);
  const endBlock = await findBlockAtTimestamp(client, endTimestamp);
  console.log(`  END_SNAPSHOT:   ${endBlock}`);

  if (epochStartDate) {
    const startTimestamp = Math.floor(new Date(epochStartDate).getTime() / 1000);
    const startBlock = await findBlockAtTimestamp(client, startTimestamp);
    console.log(`  START_SNAPSHOT: ${startBlock}`);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
