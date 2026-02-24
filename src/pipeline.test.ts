import { describe, it, expect } from "vitest";
import { parseBlocklist, parseJsonl, aggregateRewardsPerAddress, sortAddressesByReward, filterZeroRewards, formatRewardsCsv, formatBalancesCsv, summarizeTokenBalances } from "./pipeline";
import { CyToken, EligibleBalances, RewardsPerToken } from "./types";
import { REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD } from "./constants";

describe("parseBlocklist", () => {
  it("parses reporter and cheater from each line", () => {
    const data = "0xReporter1 0xCheater1\n0xReporter2 0xCheater2";
    expect(parseBlocklist(data)).toEqual([
      { reporter: "0xreporter1", cheater: "0xcheater1" },
      { reporter: "0xreporter2", cheater: "0xcheater2" },
    ]);
  });

  it("lowercases addresses", () => {
    const data = "0xABCD 0xEFGH";
    expect(parseBlocklist(data)).toEqual([
      { reporter: "0xabcd", cheater: "0xefgh" },
    ]);
  });

  it("skips empty lines", () => {
    const data = "0xA 0xB\n\n0xC 0xD\n";
    expect(parseBlocklist(data)).toEqual([
      { reporter: "0xa", cheater: "0xb" },
      { reporter: "0xc", cheater: "0xd" },
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(parseBlocklist("")).toEqual([]);
  });

  it("handles single entry with no trailing newline", () => {
    expect(parseBlocklist("0xReporter 0xCheater")).toEqual([
      { reporter: "0xreporter", cheater: "0xcheater" },
    ]);
  });

  it("handles same reporter with multiple cheaters", () => {
    const data =
      "0xReporter 0xCheater1\n0xReporter 0xCheater2\n0xReporter 0xCheater3";
    const result = parseBlocklist(data);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.reporter === "0xreporter")).toBe(true);
    expect(result.map((r) => r.cheater)).toEqual([
      "0xcheater1",
      "0xcheater2",
      "0xcheater3",
    ]);
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
    const data = "0xA 0xB\n\n\n\n0xC 0xD";
    expect(parseBlocklist(data)).toEqual([
      { reporter: "0xa", cheater: "0xb" },
      { reporter: "0xc", cheater: "0xd" },
    ]);
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
    expect(parseJsonl('[1,2,3]\n[4,5,6]')).toEqual([[1, 2, 3], [4, 5, 6]]);
  });
});

describe("aggregateRewardsPerAddress", () => {
  it("sums rewards across multiple tokens for the same address", () => {
    const rewardsPerToken: RewardsPerToken = new Map([
      ["token1", new Map([["0xaaa", 100n], ["0xbbb", 200n]])],
      ["token2", new Map([["0xaaa", 50n], ["0xbbb", 30n]])],
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

  it("handles equal rewards", () => {
    const rewards = new Map([
      ["0xaaa", 100n],
      ["0xbbb", 100n],
    ]);
    const result = sortAddressesByReward(rewards);
    expect(result).toHaveLength(2);
    expect(result).toContain("0xaaa");
    expect(result).toContain("0xbbb");
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
    expect(filterZeroRewards(["0xaaa", "0xbbb", "0xccc"], rewards)).toEqual(["0xaaa", "0xccc"]);
  });

  it("returns all addresses when none are zero", () => {
    const rewards = new Map([
      ["0xaaa", 100n],
      ["0xbbb", 200n],
    ]);
    expect(filterZeroRewards(["0xaaa", "0xbbb"], rewards)).toEqual(["0xaaa", "0xbbb"]);
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
    expect(filterZeroRewards(["0xccc", "0xaaa", "0xbbb"], rewards)).toEqual(["0xccc", "0xaaa", "0xbbb"]);
  });
});

describe("formatRewardsCsv", () => {
  it("formats rewards as CSV lines with header", () => {
    const rewards = new Map([
      ["0xaaa", 100n],
      ["0xbbb", 200n],
    ]);
    const result = formatRewardsCsv(["0xbbb", "0xaaa"], rewards);
    expect(result).toEqual([
      REWARDS_HEADER,
      "0xbbb,200",
      "0xaaa,100",
    ]);
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
      [], [token], snapshots, balances, rewardsPerToken, totalRewards
    );
    expect(result[0]).toBe(
      "address,cysFLR_snapshot1,cysFLR_snapshot2,cysFLR_average,cysFLR_penalty,cysFLR_bounty,cysFLR_final,cysFLR_rewards,total_rewards"
    );
  });

  it("formats address rows with balance data", () => {
    const balances: EligibleBalances = new Map([
      ["0xtoken1", new Map([
        ["0xaaa", { snapshots: [10n, 20n], average: 15n, penalty: 0n, bounty: 0n, final: 15n, final18: 15n }],
      ])],
    ]);
    const rewardsPerToken: RewardsPerToken = new Map([
      ["0xtoken1", new Map([["0xaaa", 500n]])],
    ]);
    const totalRewards = new Map([["0xaaa", 500n]]);

    const result = formatBalancesCsv(
      ["0xaaa"], [token], snapshots, balances, rewardsPerToken, totalRewards
    );
    expect(result[1]).toBe("0xaaa,10,20,15,0,0,15,500,500");
  });

  it("uses zeros when address has no balance for a token", () => {
    const balances: EligibleBalances = new Map();
    const rewardsPerToken: RewardsPerToken = new Map();
    const totalRewards = new Map([["0xaaa", 0n]]);

    const result = formatBalancesCsv(
      ["0xaaa"], [token], snapshots, balances, rewardsPerToken, totalRewards
    );
    expect(result[1]).toBe("0xaaa,0,0,0,0,0,0,0,0");
  });

  it("returns only header for empty addresses", () => {
    const result = formatBalancesCsv(
      [], [token], snapshots, new Map(), new Map(), new Map()
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
      ["0xtoken1", new Map([
        ["0xaaa", { snapshots: [10n, 20n], average: 15n, penalty: 0n, bounty: 0n, final: 15n, final18: 15n }],
      ])],
    ]);
    const rewardsPerToken: RewardsPerToken = new Map([
      ["0xtoken1", new Map([["0xaaa", 300n]])],
    ]);
    const totalRewards = new Map([["0xaaa", 300n]]);

    const result = formatBalancesCsv(
      ["0xaaa"], [token, token2], snapshots, balances, rewardsPerToken, totalRewards
    );
    expect(result[0]).toContain("cysFLR_snapshot1");
    expect(result[0]).toContain("cyWETH_snapshot1");
    // token1 has data, token2 has zeros
    expect(result[1]).toBe("0xaaa,10,20,15,0,0,15,300,0,0,0,0,0,0,0,300");
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
      ["0xtoken1", new Map([
        ["0xaaa", { snapshots: [10n], average: 100n, penalty: 10n, bounty: 5n, final: 95n, final18: 95n }],
        ["0xbbb", { snapshots: [20n], average: 200n, penalty: 20n, bounty: 10n, final: 190n, final18: 190n }],
      ])],
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
      ["0xtoken1", new Map([
        ["0xaaa", { snapshots: [10n], average: 100n, penalty: 10n, bounty: 5n, final: 999n, final18: 999n }],
      ])],
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
      ["0xtoken1", new Map([
        ["0xaaa", { snapshots: [10n], average: 100n, penalty: 0n, bounty: 0n, final: 100n, final18: 100n }],
      ])],
      ["0xtoken2", new Map([
        ["0xaaa", { snapshots: [20n], average: 200n, penalty: 0n, bounty: 0n, final: 200n, final18: 200n }],
      ])],
    ]);
    const result = summarizeTokenBalances(balances, [token, token2]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("cysFLR");
    expect(result[0].totalAverage).toBe(100n);
    expect(result[1].name).toBe("cyWETH");
    expect(result[1].totalAverage).toBe(200n);
  });
});
