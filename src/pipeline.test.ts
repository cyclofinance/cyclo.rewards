import { describe, it, expect } from "vitest";
import { parseBlocklist } from "./pipeline";

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
