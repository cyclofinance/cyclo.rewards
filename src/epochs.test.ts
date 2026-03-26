import { describe, it, expect } from "vitest";
import { createPublicClient, http } from "viem";
import { flare } from "viem/chains";
import { EPOCHS } from "./constants";

const client = createPublicClient({
  chain: flare,
  transport: http(process.env.RPC_URL),
});

describe("epoch block constants match on-chain timestamps", () => {
  for (const epoch of EPOCHS) {
    if (epoch.endBlock !== undefined) {
      it(`epoch ${epoch.number} endBlock ${epoch.endBlock} is at ${epoch.end}`, async () => {
        const block = await client.getBlock({ blockNumber: BigInt(epoch.endBlock!) });
        const expectedTs = Math.floor(new Date(epoch.end).getTime() / 1000);
        // The block at endBlock should be >= the target timestamp
        expect(Number(block.timestamp)).toBeGreaterThanOrEqual(expectedTs);
        // The block before should be < the target timestamp
        const prevBlock = await client.getBlock({ blockNumber: BigInt(epoch.endBlock!) - 1n });
        expect(Number(prevBlock.timestamp)).toBeLessThan(expectedTs);
      }, 30_000);
    }

    if (epoch.startBlock !== undefined) {
      it(`epoch ${epoch.number} startBlock ${epoch.startBlock} matches previous epoch endBlock`, async () => {
        const prevEpoch = EPOCHS.find(e => e.number === epoch.number - 1);
        expect(prevEpoch).toBeDefined();
        expect(prevEpoch!.endBlock).toBeDefined();
        expect(epoch.startBlock).toBe(prevEpoch!.endBlock);
      });
    }
  }
});
