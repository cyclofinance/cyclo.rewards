import { describe, it, expect } from "vitest";
import { parseBlocklist, parseJsonl, aggregateRewardsPerAddress } from "./pipeline";
import { RewardsPerToken } from "./types";

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
