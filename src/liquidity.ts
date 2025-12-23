import { PublicClient } from "viem";

const abi = [
    {
      "inputs": [],
      "name": "slot0",
      "outputs": [
        {
          "internalType": "uint160",
          "name": "sqrtPriceX96",
          "type": "uint160"
        },
        {
          "internalType": "int24",
          "name": "tick",
          "type": "int24"
        },
        {
          "internalType": "uint16",
          "name": "observationIndex",
          "type": "uint16"
        },
        {
          "internalType": "uint16",
          "name": "observationCardinality",
          "type": "uint16"
        },
        {
          "internalType": "uint16",
          "name": "observationCardinalityNext",
          "type": "uint16"
        },
        {
          "internalType": "uint8",
          "name": "feeProtocol",
          "type": "uint8"
        },
        {
          "internalType": "bool",
          "name": "unlocked",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
] as const;

export async function getPoolsTickMulticall(
    client: PublicClient,
    pools: `0x${string}`[],
    blockNumber: bigint,
): Promise<Record<string, number>> {
    const ticks: Record<string, number> = {};
    const results = await client.multicall({
        blockNumber,
        allowFailure: true,
        multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
        contracts: pools.map(
            (address) => ({
                abi,
                address,
                functionName: "slot0",
            }) as const,
        ),
    });
    for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const pool = pools[i].toLowerCase();
        if (res.status === "success") {
            ticks[pool] = res.result[1];
        }
    }

    return ticks;
}

/** Tries to get pools ticks (with max 3 retries) */
export async function getPoolsTick(
    client: PublicClient,
    pools: `0x${string}`[],
    blockNumber: number,
): Promise<Record<string, number>> {
    // retry 3 times
    for (let i = 0; i < 3; i++) {
        try {
            return await getPoolsTickMulticall(client, pools, BigInt(blockNumber))
        } catch (error) {
            await new Promise((resolve) => setTimeout(() => resolve(""), 10_000)) // wait 10 secs and try again
            if (i >= 2) throw error;
        }
    }

    throw new Error("failed to get pools ticks");
}
