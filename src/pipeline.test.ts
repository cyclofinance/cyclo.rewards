import { describe, it, expect } from "vitest";
import {
  parseBlocklist,
  parseJsonl,
  parsePools,
  readOptionalFile,
  normalizeTransfer,
  normalizeLiquidityChange,
  aggregateRewardsPerAddress,
  sortAddressesByReward,
  filterZeroRewards,
  formatRewardsCsv,
  formatBalancesCsv,
  summarizeTokenBalances,
  verifyRewardPoolTolerance,
} from "./pipeline";
import {
  CyToken,
  EligibleBalances,
  RewardsPerToken,
  Transfer,
  LiquidityChange,
} from "./types";
import {
  REWARDS_CSV_COLUMN_HEADER_ADDRESS,
  REWARDS_CSV_COLUMN_HEADER_REWARD,
} from "./constants";

describe("parseBlocklist", () => {
  const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ADDR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const ADDR_C = "0xcccccccccccccccccccccccccccccccccccccccc";
  const ADDR_D = "0xdddddddddddddddddddddddddddddddddddddddd";

  it("parses reporter and cheater from each line", () => {
    const data = `${ADDR_A} ${ADDR_B}\n${ADDR_C} ${ADDR_D}`;
    expect(parseBlocklist(data)).toEqual([
      { reporter: ADDR_A, cheater: ADDR_B },
      { reporter: ADDR_C, cheater: ADDR_D },
    ]);
  });

  it("lowercases addresses", () => {
    const data =
      "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    expect(parseBlocklist(data)).toEqual([
      { reporter: ADDR_A, cheater: ADDR_B },
    ]);
  });

  it("skips empty lines", () => {
    const data = `${ADDR_A} ${ADDR_B}\n\n${ADDR_C} ${ADDR_D}\n`;
    expect(parseBlocklist(data)).toEqual([
      { reporter: ADDR_A, cheater: ADDR_B },
      { reporter: ADDR_C, cheater: ADDR_D },
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(parseBlocklist("")).toEqual([]);
  });

  it("handles single entry with no trailing newline", () => {
    expect(parseBlocklist(`${ADDR_A} ${ADDR_B}`)).toEqual([
      { reporter: ADDR_A, cheater: ADDR_B },
    ]);
  });

  it("handles same reporter with multiple cheaters", () => {
    const data = `${ADDR_A} ${ADDR_B}\n${ADDR_A} ${ADDR_C}\n${ADDR_A} ${ADDR_D}`;
    const result = parseBlocklist(data);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.reporter === ADDR_A)).toBe(true);
    expect(result.map((r) => r.cheater)).toEqual([ADDR_B, ADDR_C, ADDR_D]);
  });

  it("parses real blocklist data format", () => {
    const data =
      "0x575a590e56aCD5644c486E0DFa3d99bBB31E8246 0x0f2163815f0701A361Df5e97DdbcF48f744e17dA";
    const result = parseBlocklist(data);
    expect(result).toEqual([
      {
        reporter: "0x575a590e56acd5644c486e0dfa3d99bbb31e8246",
        cheater: "0x0f2163815f0701a361df5e97ddbcf48f744e17da",
      },
    ]);
  });

  it("handles multiple consecutive empty lines", () => {
    const data = `${ADDR_A} ${ADDR_B}\n\n\n\n${ADDR_C} ${ADDR_D}`;
    expect(parseBlocklist(data)).toEqual([
      { reporter: ADDR_A, cheater: ADDR_B },
      { reporter: ADDR_C, cheater: ADDR_D },
    ]);
  });

  it("should throw on invalid reporter address", () => {
    expect(() => parseBlocklist(`not-an-address ${ADDR_B}`)).toThrow(
      "reporter",
    );
  });

  it("should throw on invalid cheater address", () => {
    expect(() => parseBlocklist(`${ADDR_A} 0xshort`)).toThrow("cheater");
  });

  it("should throw on line with extra tokens", () => {
    expect(() => parseBlocklist(`${ADDR_A} ${ADDR_B} extra`)).toThrow();
  });

  it("should throw on line with only one token", () => {
    expect(() => parseBlocklist(ADDR_A)).toThrow();
  });

  it("handles double spaces between addresses", () => {
    const data = `${ADDR_A}  ${ADDR_B}`;
    expect(parseBlocklist(data)).toEqual([
      { reporter: ADDR_A, cheater: ADDR_B },
    ]);
  });

  it("does not split across newlines within entries", () => {
    // \s+ could match newlines, but split("\n") runs first so lines never contain \n
    const data = `${ADDR_A} ${ADDR_B}\n${ADDR_C} ${ADDR_D}`;
    const result = parseBlocklist(data);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ reporter: ADDR_A, cheater: ADDR_B });
    expect(result[1]).toEqual({ reporter: ADDR_C, cheater: ADDR_D });
  });

  it("handles tab separator", () => {
    const data = `${ADDR_A}\t${ADDR_B}`;
    expect(parseBlocklist(data)).toEqual([
      { reporter: ADDR_A, cheater: ADDR_B },
    ]);
  });

  it("should throw on duplicate cheater address", () => {
    const data = `${ADDR_A} ${ADDR_B}\n${ADDR_C} ${ADDR_B}`;
    expect(() => parseBlocklist(data)).toThrow("duplicate");
  });
});

describe("parseJsonl", () => {
  it("parses multiple JSON lines", () => {
    const data = '{"a":1}\n{"b":2}';
    expect(parseJsonl(data)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips empty lines", () => {
    const data = '{"a":1}\n\n{"b":2}\n';
    expect(parseJsonl(data)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("returns empty array for empty string", () => {
    expect(parseJsonl("")).toEqual([]);
  });

  it("handles single line with no trailing newline", () => {
    expect(parseJsonl('{"x":"y"}')).toEqual([{ x: "y" }]);
  });

  it("handles arrays as line values", () => {
    expect(parseJsonl("[1,2,3]\n[4,5,6]")).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it("throws with line number on malformed JSON", () => {
    const data = '{"a":1}\nbad json\n{"c":3}';
    expect(() => parseJsonl(data)).toThrow("line 2");
  });

  it("passes each parsed item through the validator", () => {
    const data = '{"a":1}\n{"a":2}';
    const validator = (item: unknown) => {
      const obj = item as { a: number };
      if (typeof obj.a !== "number") throw new Error("missing a");
      return obj;
    };
    expect(parseJsonl(data, validator)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("throws with line number when validator rejects an item", () => {
    const data = '{"a":1}\n{"b":2}';
    const validator = (item: unknown) => {
      const obj = item as { a?: number };
      if (obj.a === undefined) throw new Error("missing field a");
      return obj;
    };
    expect(() => parseJsonl(data, validator)).toThrow("line 2");
  });
});

describe("aggregateRewardsPerAddress", () => {
  it("sums rewards across multiple tokens for the same address", () => {
    const rewardsPerToken: RewardsPerToken = new Map([
      [
        "token1",
        new Map([
          ["0xaaa", 100n],
          ["0xbbb", 200n],
        ]),
      ],
      [
        "token2",
        new Map([
          ["0xaaa", 50n],
          ["0xbbb", 30n],
        ]),
      ],
    ]);
    const result = aggregateRewardsPerAddress(rewardsPerToken);
    expect(result.get("0xaaa")).toBe(150n);
    expect(result.get("0xbbb")).toBe(230n);
  });

  it("handles address appearing in only one token", () => {
    const rewardsPerToken: RewardsPerToken = new Map([
      ["token1", new Map([["0xaaa", 100n]])],
      ["token2", new Map([["0xbbb", 200n]])],
    ]);
    const result = aggregateRewardsPerAddress(rewardsPerToken);
    expect(result.get("0xaaa")).toBe(100n);
    expect(result.get("0xbbb")).toBe(200n);
  });

  it("returns empty map for empty input", () => {
    const result = aggregateRewardsPerAddress(new Map());
    expect(result.size).toBe(0);
  });

  it("handles single token", () => {
    const rewardsPerToken: RewardsPerToken = new Map([
      ["token1", new Map([["0xaaa", 500n]])],
    ]);
    const result = aggregateRewardsPerAddress(rewardsPerToken);
    expect(result.get("0xaaa")).toBe(500n);
    expect(result.size).toBe(1);
  });
});

describe("sortAddressesByReward", () => {
  it("sorts addresses descending by reward", () => {
    const rewards = new Map([
      ["0xaaa", 100n],
      ["0xbbb", 300n],
      ["0xccc", 200n],
    ]);
    expect(sortAddressesByReward(rewards)).toEqual(["0xbbb", "0xccc", "0xaaa"]);
  });

  it("returns empty array for empty map", () => {
    expect(sortAddressesByReward(new Map())).toEqual([]);
  });

  it("handles single address", () => {
    const rewards = new Map([["0xaaa", 50n]]);
    expect(sortAddressesByReward(rewards)).toEqual(["0xaaa"]);
  });

  it("breaks ties deterministically regardless of insertion order", () => {
    const addresses = [
      "0xaaa",
      "0xbbb",
      "0xccc",
      "0xddd",
      "0xeee",
      "0xfff",
      "0x111",
      "0x222",
      "0x333",
      "0x444",
    ];
    // All equal rewards — sort order depends entirely on tiebreaker
    const reference = sortAddressesByReward(
      new Map(addresses.map((a) => [a, 100n])),
    );
    // Shuffle and sort 10 times — all must produce the same result
    for (let i = 0; i < 10; i++) {
      const shuffled = [...addresses].sort(() => Math.random() - 0.5);
      const result = sortAddressesByReward(
        new Map(shuffled.map((a) => [a, 100n])),
      );
      expect(result).toEqual(reference);
    }
  });
});

const REWARDS_HEADER = `${REWARDS_CSV_COLUMN_HEADER_ADDRESS},${REWARDS_CSV_COLUMN_HEADER_REWARD}`;

describe("filterZeroRewards", () => {
  it("removes addresses with zero rewards", () => {
    const rewards = new Map([
      ["0xaaa", 100n],
      ["0xbbb", 0n],
      ["0xccc", 200n],
    ]);
    expect(filterZeroRewards(["0xaaa", "0xbbb", "0xccc"], rewards)).toEqual([
      "0xaaa",
      "0xccc",
    ]);
  });

  it("returns all addresses when none are zero", () => {
    const rewards = new Map([
      ["0xaaa", 100n],
      ["0xbbb", 200n],
    ]);
    expect(filterZeroRewards(["0xaaa", "0xbbb"], rewards)).toEqual([
      "0xaaa",
      "0xbbb",
    ]);
  });

  it("returns empty array when all are zero", () => {
    const rewards = new Map([
      ["0xaaa", 0n],
      ["0xbbb", 0n],
    ]);
    expect(filterZeroRewards(["0xaaa", "0xbbb"], rewards)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterZeroRewards([], new Map())).toEqual([]);
  });

  it("preserves input order", () => {
    const rewards = new Map([
      ["0xaaa", 100n],
      ["0xbbb", 200n],
      ["0xccc", 300n],
    ]);
    expect(filterZeroRewards(["0xccc", "0xaaa", "0xbbb"], rewards)).toEqual([
      "0xccc",
      "0xaaa",
      "0xbbb",
    ]);
  });

  it("treats address absent from map as zero (filtered out)", () => {
    const rewards = new Map([["0xaaa", 100n]]);
    expect(filterZeroRewards(["0xaaa", "0xmissing"], rewards)).toEqual([
      "0xaaa",
    ]);
  });
});

describe("formatRewardsCsv", () => {
  it("formats rewards as CSV lines with header", () => {
    const rewards = new Map([
      ["0xaaa", 100n],
      ["0xbbb", 200n],
    ]);
    const result = formatRewardsCsv(["0xbbb", "0xaaa"], rewards);
    expect(result).toEqual([REWARDS_HEADER, "0xbbb,200", "0xaaa,100"]);
  });

  it("returns only header for empty addresses", () => {
    const result = formatRewardsCsv([], new Map());
    expect(result).toEqual([REWARDS_HEADER]);
  });

  it("preserves address order", () => {
    const rewards = new Map([
      ["0xaaa", 300n],
      ["0xbbb", 100n],
      ["0xccc", 200n],
    ]);
    const result = formatRewardsCsv(["0xccc", "0xaaa", "0xbbb"], rewards);
    expect(result[1]).toBe("0xccc,200");
    expect(result[2]).toBe("0xaaa,300");
    expect(result[3]).toBe("0xbbb,100");
  });

  it("uses 0 for address absent from rewards map", () => {
    const rewards = new Map([["0xaaa", 100n]]);
    const result = formatRewardsCsv(["0xaaa", "0xmissing"], rewards);
    expect(result[2]).toBe("0xmissing,0");
  });
});

describe("formatBalancesCsv", () => {
  const token: CyToken = {
    name: "cysFLR",
    address: "0xtoken1",
    underlyingAddress: "0xunderlying1",
    underlyingSymbol: "sFLR",
    receiptAddress: "0xreceipt1",
    decimals: 18,
  };

  const snapshots = [100, 200];

  it("formats header with snapshot columns per token", () => {
    const balances: EligibleBalances = new Map();
    const rewardsPerToken: RewardsPerToken = new Map();
    const totalRewards = new Map<string, bigint>();

    const result = formatBalancesCsv(
      [],
      [token],
      snapshots,
      balances,
      rewardsPerToken,
      totalRewards,
    );
    expect(result[0]).toBe(
      "address,cysFLR_snapshot1,cysFLR_snapshot2,cysFLR_average,cysFLR_penalty,cysFLR_bounty,cysFLR_final,cysFLR_rewards,total_rewards",
    );
  });

  it("formats address rows with balance data", () => {
    const balances: EligibleBalances = new Map([
      [
        "0xtoken1",
        new Map([
          [
            "0xaaa",
            {
              snapshots: [10n, 20n],
              average: 15n,
              penalty: 0n,
              bounty: 0n,
              final: 15n,
              final18: 15n,
            },
          ],
        ]),
      ],
    ]);
    const rewardsPerToken: RewardsPerToken = new Map([
      ["0xtoken1", new Map([["0xaaa", 500n]])],
    ]);
    const totalRewards = new Map([["0xaaa", 500n]]);

    const result = formatBalancesCsv(
      ["0xaaa"],
      [token],
      snapshots,
      balances,
      rewardsPerToken,
      totalRewards,
    );
    expect(result[1]).toBe("0xaaa,10,20,15,0,0,15,500,500");
  });

  it("uses zeros when address has no balance for a token", () => {
    const balances: EligibleBalances = new Map();
    const rewardsPerToken: RewardsPerToken = new Map();
    const totalRewards = new Map([["0xaaa", 0n]]);

    const result = formatBalancesCsv(
      ["0xaaa"],
      [token],
      snapshots,
      balances,
      rewardsPerToken,
      totalRewards,
    );
    expect(result[1]).toBe("0xaaa,0,0,0,0,0,0,0,0");
  });

  it("returns only header for empty addresses", () => {
    const result = formatBalancesCsv(
      [],
      [token],
      snapshots,
      new Map(),
      new Map(),
      new Map(),
    );
    expect(result).toHaveLength(1);
  });

  it("handles multiple tokens with address in only one", () => {
    const token2: CyToken = {
      name: "cyWETH",
      address: "0xtoken2",
      underlyingAddress: "0xunderlying2",
      underlyingSymbol: "WETH",
      receiptAddress: "0xreceipt2",
      decimals: 18,
    };
    const balances: EligibleBalances = new Map([
      [
        "0xtoken1",
        new Map([
          [
            "0xaaa",
            {
              snapshots: [10n, 20n],
              average: 15n,
              penalty: 0n,
              bounty: 0n,
              final: 15n,
              final18: 15n,
            },
          ],
        ]),
      ],
    ]);
    const rewardsPerToken: RewardsPerToken = new Map([
      ["0xtoken1", new Map([["0xaaa", 300n]])],
    ]);
    const totalRewards = new Map([["0xaaa", 300n]]);

    const result = formatBalancesCsv(
      ["0xaaa"],
      [token, token2],
      snapshots,
      balances,
      rewardsPerToken,
      totalRewards,
    );
    expect(result[0]).toContain("cysFLR_snapshot1");
    expect(result[0]).toContain("cyWETH_snapshot1");
    // token1 has data, token2 has zeros
    expect(result[1]).toBe("0xaaa,10,20,15,0,0,15,300,0,0,0,0,0,0,0,300");
  });

  it("uses zeros when token balance map exists but address is absent", () => {
    const balances: EligibleBalances = new Map([["0xtoken1", new Map()]]);
    const rewardsPerToken: RewardsPerToken = new Map([["0xtoken1", new Map()]]);
    const totalRewards = new Map([["0xaaa", 0n]]);

    const result = formatBalancesCsv(
      ["0xaaa"],
      [token],
      snapshots,
      balances,
      rewardsPerToken,
      totalRewards,
    );
    expect(result[1]).toBe("0xaaa,0,0,0,0,0,0,0,0");
  });

  it("uses 0 for totalRewardsPerAddress missing entry", () => {
    const balances: EligibleBalances = new Map([
      [
        "0xtoken1",
        new Map([
          [
            "0xaaa",
            {
              snapshots: [10n, 20n],
              average: 15n,
              penalty: 0n,
              bounty: 0n,
              final: 15n,
              final18: 15n,
            },
          ],
        ]),
      ],
    ]);
    const rewardsPerToken: RewardsPerToken = new Map([
      ["0xtoken1", new Map([["0xaaa", 500n]])],
    ]);
    const totalRewards = new Map<string, bigint>(); // missing 0xaaa

    const result = formatBalancesCsv(
      ["0xaaa"],
      [token],
      snapshots,
      balances,
      rewardsPerToken,
      totalRewards,
    );
    expect(result[1]).toBe("0xaaa,10,20,15,0,0,15,500,0");
  });

  it("uses 0 for rewardsPerToken inner-map miss", () => {
    const balances: EligibleBalances = new Map([
      [
        "0xtoken1",
        new Map([
          [
            "0xaaa",
            {
              snapshots: [10n, 20n],
              average: 15n,
              penalty: 0n,
              bounty: 0n,
              final: 15n,
              final18: 15n,
            },
          ],
        ]),
      ],
    ]);
    const rewardsPerToken: RewardsPerToken = new Map([
      ["0xtoken1", new Map()], // token exists but address missing
    ]);
    const totalRewards = new Map([["0xaaa", 0n]]);

    const result = formatBalancesCsv(
      ["0xaaa"],
      [token],
      snapshots,
      balances,
      rewardsPerToken,
      totalRewards,
    );
    expect(result[1]).toBe("0xaaa,10,20,15,0,0,15,0,0");
  });
});

describe("summarizeTokenBalances", () => {
  const token: CyToken = {
    name: "cysFLR",
    address: "0xtoken1",
    underlyingAddress: "0xunderlying1",
    underlyingSymbol: "sFLR",
    receiptAddress: "0xreceipt1",
    decimals: 18,
  };

  it("computes totals across all accounts for a token", () => {
    const balances: EligibleBalances = new Map([
      [
        "0xtoken1",
        new Map([
          [
            "0xaaa",
            {
              snapshots: [10n],
              average: 100n,
              penalty: 10n,
              bounty: 5n,
              final: 95n,
              final18: 95n,
            },
          ],
          [
            "0xbbb",
            {
              snapshots: [20n],
              average: 200n,
              penalty: 20n,
              bounty: 10n,
              final: 190n,
              final18: 190n,
            },
          ],
        ]),
      ],
    ]);
    const result = summarizeTokenBalances(balances, [token]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "cysFLR",
      totalAverage: 300n,
      totalPenalties: 30n,
      totalBounties: 15n,
      totalFinal: 285n,
      verified: true,
    });
  });

  it("returns verified false when invariant fails", () => {
    const balances: EligibleBalances = new Map([
      [
        "0xtoken1",
        new Map([
          [
            "0xaaa",
            {
              snapshots: [10n],
              average: 100n,
              penalty: 10n,
              bounty: 5n,
              final: 999n,
              final18: 999n,
            },
          ],
        ]),
      ],
    ]);
    const result = summarizeTokenBalances(balances, [token]);
    expect(result[0].verified).toBe(false);
  });

  it("skips tokens with no balance data", () => {
    const balances: EligibleBalances = new Map();
    const result = summarizeTokenBalances(balances, [token]);
    expect(result).toEqual([]);
  });

  it("handles multiple tokens", () => {
    const token2: CyToken = {
      name: "cyWETH",
      address: "0xtoken2",
      underlyingAddress: "0xunderlying2",
      underlyingSymbol: "WETH",
      receiptAddress: "0xreceipt2",
      decimals: 18,
    };
    const balances: EligibleBalances = new Map([
      [
        "0xtoken1",
        new Map([
          [
            "0xaaa",
            {
              snapshots: [10n],
              average: 100n,
              penalty: 0n,
              bounty: 0n,
              final: 100n,
              final18: 100n,
            },
          ],
        ]),
      ],
      [
        "0xtoken2",
        new Map([
          [
            "0xaaa",
            {
              snapshots: [20n],
              average: 200n,
              penalty: 0n,
              bounty: 0n,
              final: 200n,
              final18: 200n,
            },
          ],
        ]),
      ],
    ]);
    const result = summarizeTokenBalances(balances, [token, token2]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("cysFLR");
    expect(result[0].totalAverage).toBe(100n);
    expect(result[1].name).toBe("cyWETH");
    expect(result[1].totalAverage).toBe(200n);
  });
});

describe("normalizeTransfer", () => {
  const valid = {
    from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    value: "1000",
    blockNumber: 100,
    timestamp: 200,
    tokenAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
    transactionHash:
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  };

  it("accepts a valid transfer", () => {
    expect(normalizeTransfer(valid)).toEqual(valid);
  });

  it("rejects missing from", () => {
    expect(() => normalizeTransfer({ ...valid, from: undefined })).toThrow();
  });

  it("rejects invalid address in from", () => {
    expect(() => normalizeTransfer({ ...valid, from: "bad" })).toThrow();
  });

  it("rejects non-integer blockNumber", () => {
    expect(() => normalizeTransfer({ ...valid, blockNumber: 1.5 })).toThrow();
  });

  it("rejects non-numeric value string", () => {
    expect(() => normalizeTransfer({ ...valid, value: "abc" })).toThrow();
  });

  it("rejects missing transactionHash", () => {
    expect(() =>
      normalizeTransfer({ ...valid, transactionHash: undefined }),
    ).toThrow();
  });

  it("rejects invalid address in to", () => {
    expect(() => normalizeTransfer({ ...valid, to: "bad" })).toThrow();
  });

  it("rejects invalid tokenAddress", () => {
    expect(() =>
      normalizeTransfer({ ...valid, tokenAddress: "bad" }),
    ).toThrow();
  });

  it("rejects non-integer timestamp", () => {
    expect(() => normalizeTransfer({ ...valid, timestamp: 1.5 })).toThrow();
  });

  it("rejects missing value", () => {
    expect(() => normalizeTransfer({ ...valid, value: undefined })).toThrow();
  });

  it("rejects missing blockNumber", () => {
    expect(() =>
      normalizeTransfer({ ...valid, blockNumber: undefined }),
    ).toThrow();
  });

  it("rejects missing tokenAddress", () => {
    expect(() =>
      normalizeTransfer({ ...valid, tokenAddress: undefined }),
    ).toThrow();
  });

  it("rejects missing to", () => {
    expect(() => normalizeTransfer({ ...valid, to: undefined })).toThrow();
  });

  it("rejects empty string value", () => {
    expect(() => normalizeTransfer({ ...valid, value: "" })).toThrow();
  });

  it("rejects negative value", () => {
    expect(() => normalizeTransfer({ ...valid, value: "-1" })).toThrow();
  });

  it("rejects NaN blockNumber", () => {
    expect(() => normalizeTransfer({ ...valid, blockNumber: NaN })).toThrow();
  });

  it("rejects empty string from", () => {
    expect(() => normalizeTransfer({ ...valid, from: "" })).toThrow();
  });

  it("rejects null input", () => {
    expect(() => normalizeTransfer(null)).toThrow();
  });

  it("rejects string input", () => {
    expect(() => normalizeTransfer("not an object")).toThrow();
  });

  it("rejects invalid transactionHash format", () => {
    expect(() =>
      normalizeTransfer({ ...valid, transactionHash: "not-a-hash" }),
    ).toThrow();
  });

  it("rejects short transactionHash", () => {
    expect(() =>
      normalizeTransfer({ ...valid, transactionHash: "0xabcd" }),
    ).toThrow();
  });

  it("rejects negative blockNumber", () => {
    expect(() => normalizeTransfer({ ...valid, blockNumber: -1 })).toThrow();
  });

  it("rejects negative timestamp", () => {
    expect(() => normalizeTransfer({ ...valid, timestamp: -1 })).toThrow();
  });

  it("accepts zero value", () => {
    expect(normalizeTransfer({ ...valid, value: "0" })).toBeTruthy();
  });

  it("accepts empty object throws on first check", () => {
    expect(() => normalizeTransfer({})).toThrow();
  });

  it("lowercases all address fields", () => {
    const mixed = {
      from: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      to: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      tokenAddress: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      transactionHash:
        "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
      value: "1000",
      blockNumber: 100,
      timestamp: 200,
    };
    const result: Transfer = normalizeTransfer(mixed);
    expect(result.from).toBe(mixed.from.toLowerCase());
    expect(result.to).toBe(mixed.to.toLowerCase());
    expect(result.tokenAddress).toBe(mixed.tokenAddress.toLowerCase());
    expect(result.transactionHash).toBe(mixed.transactionHash.toLowerCase());
  });
});

describe("normalizeLiquidityChange", () => {
  const validV2 = {
    __typename: "LiquidityV2Change",
    tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    lpAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    owner: "0xcccccccccccccccccccccccccccccccccccccccc",
    changeType: "DEPOSIT",
    liquidityChange: "1000",
    depositedBalanceChange: "500",
    blockNumber: 100,
    timestamp: 200,
    transactionHash:
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  };

  const validV3 = {
    ...validV2,
    __typename: "LiquidityV3Change",
    tokenId: "123",
    poolAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
    fee: 3000,
    lowerTick: -100,
    upperTick: 100,
  };

  it("accepts a valid V2 change", () => {
    expect(normalizeLiquidityChange(validV2)).toEqual(validV2);
  });

  it("accepts a valid V3 change", () => {
    expect(normalizeLiquidityChange(validV3)).toEqual(validV3);
  });

  it("rejects non-string changeType", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, changeType: 123 }),
    ).toThrow();
  });

  it("rejects invalid changeType", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, changeType: "BAD" }),
    ).toThrow();
  });

  it("rejects invalid owner address", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, owner: "bad" }),
    ).toThrow();
  });

  it("rejects V3 with missing poolAddress", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV3, poolAddress: undefined }),
    ).toThrow();
  });

  it("rejects V3 with invalid poolAddress", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV3, poolAddress: "bad" }),
    ).toThrow();
  });

  it("rejects V3 with non-string tokenId", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV3, tokenId: 123 }),
    ).toThrow();
  });

  it("rejects V3 with non-integer fee", () => {
    expect(() => normalizeLiquidityChange({ ...validV3, fee: 1.5 })).toThrow();
  });

  it("rejects unknown __typename", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, __typename: "Unknown" }),
    ).toThrow();
  });

  it("rejects missing tokenAddress", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, tokenAddress: undefined }),
    ).toThrow();
  });

  it("rejects invalid tokenAddress", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, tokenAddress: "bad" }),
    ).toThrow();
  });

  it("rejects missing lpAddress", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, lpAddress: undefined }),
    ).toThrow();
  });

  it("rejects missing owner", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, owner: undefined }),
    ).toThrow();
  });

  it("rejects invalid lpAddress", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, lpAddress: "bad" }),
    ).toThrow();
  });

  it("rejects non-integer blockNumber", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, blockNumber: 1.5 }),
    ).toThrow();
  });

  it("rejects non-integer timestamp", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, timestamp: 1.5 }),
    ).toThrow();
  });

  it("rejects non-string liquidityChange", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, liquidityChange: 123 }),
    ).toThrow();
  });

  it("rejects non-integer-string liquidityChange", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, liquidityChange: "abc" }),
    ).toThrow();
  });

  it("rejects non-string depositedBalanceChange", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, depositedBalanceChange: 123 }),
    ).toThrow();
  });

  it("rejects non-integer-string depositedBalanceChange", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, depositedBalanceChange: "1.5" }),
    ).toThrow();
  });

  it("rejects missing transactionHash", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, transactionHash: undefined }),
    ).toThrow();
  });

  it("rejects invalid transactionHash format", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, transactionHash: "not-a-hash" }),
    ).toThrow();
  });

  it("rejects V3 with missing tokenId", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV3, tokenId: undefined }),
    ).toThrow();
  });

  it("rejects V3 with non-integer lowerTick", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV3, lowerTick: 1.5 }),
    ).toThrow();
  });

  it("rejects V3 with non-integer upperTick", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV3, upperTick: 1.5 }),
    ).toThrow();
  });

  it("accepts negative ticks in V3", () => {
    expect(
      normalizeLiquidityChange({
        ...validV3,
        lowerTick: -887272,
        upperTick: -100,
      }),
    ).toBeTruthy();
  });

  it("accepts negative liquidityChange", () => {
    expect(
      normalizeLiquidityChange({ ...validV2, liquidityChange: "-500" }),
    ).toBeTruthy();
  });

  it("rejects empty changeType", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, changeType: "" }),
    ).toThrow();
  });

  it("rejects empty liquidityChange", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, liquidityChange: "" }),
    ).toThrow();
  });

  it("rejects missing __typename", () => {
    const { __typename, ...noTypename } = validV2;
    expect(() => normalizeLiquidityChange(noTypename)).toThrow();
  });

  it("rejects null input", () => {
    expect(() => normalizeLiquidityChange(null)).toThrow();
  });

  it("rejects negative blockNumber", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, blockNumber: -1 }),
    ).toThrow();
  });

  it("rejects negative timestamp", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV2, timestamp: -1 }),
    ).toThrow();
  });

  it("rejects V3 with empty tokenId", () => {
    expect(() =>
      normalizeLiquidityChange({ ...validV3, tokenId: "" }),
    ).toThrow();
  });

  it("accepts zero depositedBalanceChange", () => {
    expect(
      normalizeLiquidityChange({ ...validV2, depositedBalanceChange: "0" }),
    ).toBeTruthy();
  });

  it("lowercases all address fields for V2", () => {
    const mixed = {
      ...validV2,
      tokenAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      lpAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      owner: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      transactionHash:
        "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
    };
    const result: LiquidityChange = normalizeLiquidityChange(mixed);
    expect(result.tokenAddress).toBe(mixed.tokenAddress.toLowerCase());
    expect(result.lpAddress).toBe(mixed.lpAddress.toLowerCase());
    expect(result.owner).toBe(mixed.owner.toLowerCase());
    expect(result.transactionHash).toBe(mixed.transactionHash.toLowerCase());
  });

  it("lowercases poolAddress for V3", () => {
    const mixed = {
      ...validV3,
      poolAddress: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    };
    const result: LiquidityChange = normalizeLiquidityChange(mixed);
    expect(result.__typename).toBe("LiquidityV3Change");
    if (result.__typename === "LiquidityV3Change") {
      expect(result.poolAddress).toBe(mixed.poolAddress.toLowerCase());
    }
  });
});

describe("readOptionalFile", () => {
  it("should return empty string for missing file", async () => {
    const result = await readOptionalFile(
      "/tmp/definitely-does-not-exist-" + Date.now() + ".dat",
    );
    expect(result).toBe("");
  });

  it("should propagate non-ENOENT errors", async () => {
    // Reading a directory as a file gives EISDIR, not ENOENT
    await expect(readOptionalFile("/tmp")).rejects.toThrow();
  });

  it("should return file contents for existing file", async () => {
    const { writeFileSync, unlinkSync } = await import("fs");
    const path = "/tmp/readOptionalFile-test-" + Date.now() + ".dat";
    writeFileSync(path, "hello");
    try {
      const result = await readOptionalFile(path);
      expect(result).toBe("hello");
    } finally {
      unlinkSync(path);
    }
  });
});

describe("verifyRewardPoolTolerance", () => {
  const pool = 1000000000000000000000000n; // 1M tokens

  it("should not throw when total equals pool", () => {
    expect(() => verifyRewardPoolTolerance(pool, pool)).not.toThrow();
  });

  it("should not throw when difference is within 0.1%", () => {
    expect(() => verifyRewardPoolTolerance(pool - 100n, pool)).not.toThrow();
  });

  it("should throw when total is too low", () => {
    const tooLow = pool - pool / 500n; // 0.2% under
    expect(() => verifyRewardPoolTolerance(tooLow, pool)).toThrow();
  });

  it("should throw when total is too high", () => {
    const tooHigh = pool + pool / 500n; // 0.2% over
    expect(() => verifyRewardPoolTolerance(tooHigh, pool)).toThrow();
  });

  it("should throw on any over-distribution even 1 wei", () => {
    expect(() => verifyRewardPoolTolerance(pool + 1n, pool)).toThrow();
  });

  it("should not throw at exactly the 0.1% under-distribution boundary", () => {
    const atBoundary = pool - pool / 1000n;
    expect(() => verifyRewardPoolTolerance(atBoundary, pool)).not.toThrow();
  });
});

describe("parsePools", () => {
  it("should parse valid pool addresses", () => {
    const data = JSON.stringify([
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
    const result = parsePools(data);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("should lowercase checksummed addresses", () => {
    const data = JSON.stringify(["0xAaBbCcDdEeFf00112233445566778899AaBbCcDd"]);
    const result = parsePools(data);
    expect(result[0]).toBe("0xaabbccddeeff00112233445566778899aabbccdd");
  });

  it("should reject non-array JSON", () => {
    expect(() => parsePools('{"a": 1}')).toThrow();
  });

  it("should reject array with non-string elements", () => {
    expect(() => parsePools("[123, 456]")).toThrow();
  });

  it("should reject array with invalid addresses", () => {
    expect(() => parsePools('["not-an-address"]')).toThrow();
  });

  it("should accept empty array", () => {
    expect(parsePools("[]")).toEqual([]);
  });
});
