import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeCsv, mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => {
  const header = "recipient address,amount wei";
  const fakeRows = Array.from(
    { length: 200 },
    (_, i) => `0x${i.toString(16).padStart(40, "0")},${i + 1}`,
  );
  const fakeCsv = [header, ...fakeRows].join("\n");
  const mockReadFileSync = vi.fn().mockReturnValue(fakeCsv);
  const mockWriteFileSync = vi.fn();
  return { fakeCsv, mockReadFileSync, mockWriteFileSync };
});

vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  };
});

import { readCsv, calculateDiff, RewardEntry, DISTRIBUTED_COUNT } from "./diff";
import {
  REWARDS_CSV_COLUMN_HEADER_ADDRESS,
  REWARDS_CSV_COLUMN_HEADER_REWARD,
} from "./constants";

const header =
  REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;

it("hoisted header should match header constants", () => {
  // vi.hoisted cannot use imports, so the header is hardcoded there.
  // This test ensures it stays in sync with the constants.
  expect(fakeCsv.split("\n")[0]).toBe(header);
});

describe("readCsv", () => {
  beforeEach(() => {
    mockReadFileSync.mockReturnValue(fakeCsv);
  });

  it("should throw on empty file", () => {
    mockReadFileSync.mockReturnValue("");
    expect(() => readCsv("empty.csv")).toThrowError(
      "CSV file is empty: empty.csv",
    );
  });

  it("should throw on header-only file", () => {
    mockReadFileSync.mockReturnValue(header + "\n");
    expect(() => readCsv("header-only.csv")).toThrowError(
      "CSV file has no data rows (only header): header-only.csv",
    );
  });

  it("should throw on line with fewer than 2 columns", () => {
    mockReadFileSync.mockReturnValue(header + "\n0xabc123\n");
    expect(() => readCsv("bad.csv")).toThrowError(
      'CSV line 2 has fewer than 2 columns in bad.csv: "0xabc123"',
    );
  });

  it("should throw on line with more than 2 columns", () => {
    mockReadFileSync.mockReturnValue(header + "\n0xabc123,1000,extra\n");
    expect(() => readCsv("bad.csv")).toThrowError(
      'CSV line 2 has more than 2 columns in bad.csv: "0xabc123,1000,extra"',
    );
  });

  it("should throw on empty address", () => {
    mockReadFileSync.mockReturnValue(header + "\n,1000\n");
    expect(() => readCsv("bad.csv")).toThrowError(
      'CSV line 2 has empty address in bad.csv: ",1000"',
    );
  });

  it("should throw on empty reward", () => {
    mockReadFileSync.mockReturnValue(header + "\n0xabc123,\n");
    expect(() => readCsv("bad.csv")).toThrowError(
      'CSV line 2 has empty reward in bad.csv: "0xabc123,"',
    );
  });

  it("should lowercase addresses", () => {
    mockReadFileSync.mockReturnValue(
      header + "\n0xAaBbCcDdEeFf00112233445566778899AaBbCcDd,1000\n",
    );
    const result = readCsv("valid.csv");
    expect(result[0].address).toBe(
      "0xaabbccddeeff00112233445566778899aabbccdd",
    );
  });

  it("should parse valid CSV", () => {
    mockReadFileSync.mockReturnValue(
      header +
        "\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,1000\n0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,2000\n",
    );
    const result = readCsv("valid.csv");
    expect(result).toEqual([
      { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", reward: 1000n },
      { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", reward: 2000n },
    ]);
  });

  it("should throw on non-numeric reward value", () => {
    mockReadFileSync.mockReturnValue(header + "\n0xabc123,notanumber\n");
    expect(() => readCsv("bad.csv")).toThrow();
  });

  it("should throw on floating point reward value", () => {
    mockReadFileSync.mockReturnValue(header + "\n0xabc123,1.5\n");
    expect(() => readCsv("bad.csv")).toThrow();
  });

  it("should reject negative reward values", () => {
    mockReadFileSync.mockReturnValue(
      header + "\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,-1000\n",
    );
    expect(() => readCsv("bad.csv")).toThrow();
  });

  it("should accept zero reward values", () => {
    mockReadFileSync.mockReturnValue(
      header + "\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,0\n",
    );
    const result = readCsv("bad.csv");
    expect(result[0].reward).toBe(0n);
  });

  it("should return duplicate addresses as separate entries", () => {
    mockReadFileSync.mockReturnValue(
      header +
        "\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,1000\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,2000\n",
    );
    const result = readCsv("dup.csv");
    expect(result).toEqual([
      { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", reward: 1000n },
      { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", reward: 2000n },
    ]);
  });

  it("should reject invalid address format", () => {
    mockReadFileSync.mockReturnValue(header + "\nnot-an-address,1000\n");
    expect(() => readCsv("bad.csv")).toThrow();
  });

  it("should handle LF line endings", () => {
    mockReadFileSync.mockReturnValue(
      header + "\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,1000\n",
    );
    const result = readCsv("lf.csv");
    expect(result).toEqual([
      { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", reward: 1000n },
    ]);
  });

  it("should handle CRLF line endings", () => {
    mockReadFileSync.mockReturnValue(
      header + "\r\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,1000\r\n",
    );
    const result = readCsv("crlf.csv");
    expect(result).toEqual([
      { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", reward: 1000n },
    ]);
  });

  it("should reject CSV with wrong header", () => {
    mockReadFileSync.mockReturnValue(
      "wrong header\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,1000\n",
    );
    expect(() => readCsv("bad.csv")).toThrow();
  });

  it("should handle large BigInt reward values", () => {
    mockReadFileSync.mockReturnValue(
      header +
        "\n0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,999999999999999999999999999999\n",
    );
    const result = readCsv("large.csv");
    expect(result[0].reward).toBe(999999999999999999999999999999n);
  });

  it("should trim whitespace from address and reward fields", () => {
    mockReadFileSync.mockReturnValue(
      header + "\n 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa , 1000 \n",
    );
    const result = readCsv("ws.csv");
    expect(result[0].address).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(result[0].reward).toBe(1000n);
  });
});

describe("calculateDiff", () => {
  // Helper to make reward entries concisely
  const entry = (addr: string, reward: bigint): RewardEntry => ({
    address: addr,
    reward,
  });

  it("should split remaining into covered and uncovered based on budget", () => {
    // Pool is 100, old distributed 40 to 2 accounts, leaving 60 remaining
    const newRewards = [
      entry("0xold1", 20n),
      entry("0xold2", 20n),
      entry("0xnew1", 30n),
      entry("0xnew2", 25n),
      entry("0xnew3", 10n),
    ];
    const oldRewards = [entry("0xold1", 20n), entry("0xold2", 20n)];

    const result = calculateDiff(newRewards, oldRewards, 2, 100n);

    expect(result.totalAlreadyPaid).toBe(40n);
    expect(result.remainingRewards).toBe(60n);
    // 0xnew1 (30) fits, 0xnew2 (25) fits (30+25=55), 0xnew3 (10) exceeds (55+10=65 > 60)
    expect(result.covered).toEqual([
      entry("0xnew1", 30n),
      entry("0xnew2", 25n),
    ]);
    expect(result.uncovered).toEqual([entry("0xnew3", 10n)]);
    expect(result.totalNewDistribution).toBe(55n);
    expect(result.remainingRewardsDiff).toBe(5n);
    expect(result.totalRemainingUncovered).toBe(10n);
  });

  it("should identify underpaid accounts", () => {
    // Old account received 10 but new calculation says they deserve 25
    const newRewards = [entry("0xold1", 25n), entry("0xnew1", 50n)];
    const oldRewards = [entry("0xold1", 10n)];

    const result = calculateDiff(newRewards, oldRewards, 1, 100n);

    expect(result.underpaid).toEqual([
      {
        address: "0xold1",
        old: 10n,
        new: 25n,
        diff: 15n,
      },
    ]);
    expect(result.totalUnderpaid).toBe(15n);
  });

  it("should not flag accounts that received more than or equal to new calculation", () => {
    const newRewards = [
      entry("0xold1", 10n), // received exact amount
      entry("0xold2", 5n), // received more than new calc
    ];
    const oldRewards = [entry("0xold1", 10n), entry("0xold2", 20n)];

    const result = calculateDiff(newRewards, oldRewards, 2, 100n);

    expect(result.underpaid).toEqual([]);
    expect(result.totalUnderpaid).toBe(0n);
  });

  it("should remove distributed accounts from remaining", () => {
    const newRewards = [entry("0xold1", 10n), entry("0xnew1", 20n)];
    const oldRewards = [entry("0xold1", 10n)];

    const result = calculateDiff(newRewards, oldRewards, 1, 100n);

    // Only 0xnew1 should be in covered/uncovered, not 0xold1
    const allRemaining = [...result.covered, ...result.uncovered];
    expect(allRemaining.map((e) => e.address)).toEqual(["0xnew1"]);
  });

  it("should handle old account not found in new rewards", () => {
    const newRewards = [entry("0xnew1", 20n)];
    const oldRewards = [
      entry("0xold1", 10n), // not in newRewards
    ];

    const result = calculateDiff(newRewards, oldRewards, 1, 100n);

    // old1 is still counted in totalAlreadyPaid
    expect(result.totalAlreadyPaid).toBe(10n);
    expect(result.remainingRewards).toBe(90n);
    // new1 was never removed from remaining
    expect(result.covered).toEqual([entry("0xnew1", 20n)]);
    expect(result.underpaid).toEqual([]);
  });

  it("should handle zero distributed count", () => {
    const newRewards = [entry("0xnew1", 30n), entry("0xnew2", 20n)];

    const result = calculateDiff(newRewards, [], 0, 100n);

    expect(result.totalAlreadyPaid).toBe(0n);
    expect(result.remainingRewards).toBe(100n);
    expect(result.covered).toEqual([
      entry("0xnew1", 30n),
      entry("0xnew2", 20n),
    ]);
    expect(result.uncovered).toEqual([]);
    expect(result.underpaid).toEqual([]);
  });

  it("should handle all accounts fitting in budget exactly", () => {
    const newRewards = [entry("0xnew1", 50n), entry("0xnew2", 50n)];

    const result = calculateDiff(newRewards, [], 0, 100n);

    expect(result.covered).toEqual([
      entry("0xnew1", 50n),
      entry("0xnew2", 50n),
    ]);
    expect(result.uncovered).toEqual([]);
    expect(result.remainingRewardsDiff).toBe(0n);
  });

  it("should handle empty new rewards", () => {
    const result = calculateDiff([], [], 0, 100n);

    expect(result.covered).toEqual([]);
    expect(result.uncovered).toEqual([]);
    expect(result.underpaid).toEqual([]);
    expect(result.remainingRewards).toBe(100n);
    expect(result.remainingRewardsDiff).toBe(100n);
  });

  it("should not mutate input arrays", () => {
    const newRewards = [entry("0xold1", 10n), entry("0xnew1", 20n)];
    const oldRewards = [entry("0xold1", 10n)];
    const newRewardsCopy = structuredClone(newRewards);
    const oldRewardsCopy = structuredClone(oldRewards);

    calculateDiff(newRewards, oldRewards, 1, 100n);

    expect(newRewards).toEqual(newRewardsCopy);
    expect(oldRewards).toEqual(oldRewardsCopy);
  });

  it("covered + uncovered rewards should equal total remaining undistributed", () => {
    const newRewards = [
      entry("0xold1", 15n),
      entry("0xold2", 25n),
      entry("0xnew1", 30n),
      entry("0xnew2", 40n),
      entry("0xnew3", 50n),
    ];
    const oldRewards = [entry("0xold1", 10n), entry("0xold2", 20n)];

    const result = calculateDiff(newRewards, oldRewards, 2, 200n);

    const coveredTotal = result.covered.reduce((s, e) => s + e.reward, 0n);
    const uncoveredTotal = result.uncovered.reduce((s, e) => s + e.reward, 0n);
    // The remaining undistributed accounts are those NOT in oldRewards
    const remainingTotal = newRewards
      .filter((n) => !oldRewards.some((o) => o.address === n.address))
      .reduce((s, e) => s + e.reward, 0n);

    expect(coveredTotal + uncoveredTotal).toBe(remainingTotal);
  });

  it("totalNewDistribution + remainingRewardsDiff should equal remainingRewards", () => {
    const newRewards = [
      entry("0xold1", 15n),
      entry("0xnew1", 30n),
      entry("0xnew2", 40n),
      entry("0xnew3", 50n),
    ];
    const oldRewards = [entry("0xold1", 10n)];

    const result = calculateDiff(newRewards, oldRewards, 1, 100n);

    expect(result.totalNewDistribution + result.remainingRewardsDiff).toBe(
      result.remainingRewards,
    );
  });

  it("should handle greedy ordering — large account first exhausts budget", () => {
    // Budget is 50, but a 45n account comes first, leaving only 5n for the rest
    const newRewards = [entry("0xbig", 45n), entry("0xsmall", 10n)];

    const result = calculateDiff(newRewards, [], 0, 50n);

    // 0xbig (45) fits, remaining budget = 5, 0xsmall (10) does NOT fit
    expect(result.covered).toEqual([entry("0xbig", 45n)]);
    expect(result.uncovered).toEqual([entry("0xsmall", 10n)]);
  });

  it("should throw when distributedCount exceeds oldRewards length", () => {
    const newRewards = [entry("0xnew1", 10n)];
    const oldRewards = [entry("0xold1", 5n)];

    // distributedCount is 3 but oldRewards only has 1 entry
    expect(() => calculateDiff(newRewards, oldRewards, 3, 100n)).toThrow(
      "distributedCount (3) exceeds oldRewards length (1)",
    );
  });

  it("should throw when totalAlreadyPaid exceeds rewardPool", () => {
    const newRewards = [entry("0xa", 50n), entry("0xb", 50n)];
    const oldRewards = [entry("0xa", 200n)];

    // oldRewards[0] paid 200 but rewardPool is only 100
    expect(() => calculateDiff(newRewards, oldRewards, 1, 100n)).toThrow(
      "totalAlreadyPaid (200) exceeds rewardPool (100)",
    );
  });

  it("should error on duplicate addresses in newRewards", () => {
    const newRewards = [
      entry("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 10n),
      entry("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 20n),
    ];
    const oldRewards = [
      entry("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 5n),
    ];
    expect(() => calculateDiff(newRewards, oldRewards, 1, 100n)).toThrow(
      "duplicate",
    );
  });

  it("should error on negative distributedCount", () => {
    const newRewards = [
      entry("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 10n),
    ];
    const oldRewards = [
      entry("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 5n),
    ];
    expect(() => calculateDiff(newRewards, oldRewards, -1, 100n)).toThrow();
  });

  it("should error on non-integer distributedCount", () => {
    const newRewards = [
      entry("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 10n),
    ];
    const oldRewards = [
      entry("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 5n),
    ];
    expect(() => calculateDiff(newRewards, oldRewards, 1.5, 100n)).toThrow();
  });

  it("should error on NaN distributedCount", () => {
    const newRewards = [
      entry("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 10n),
    ];
    const oldRewards = [
      entry("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 5n),
    ];
    expect(() => calculateDiff(newRewards, oldRewards, NaN, 100n)).toThrow();
  });

  it("should error on duplicate addresses in oldRewards", () => {
    const newRewards = [
      entry("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 10n),
    ];
    const oldRewards = [
      entry("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 5n),
      entry("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 10n),
    ];
    expect(() => calculateDiff(newRewards, oldRewards, 2, 100n)).toThrow(
      "duplicate",
    );
  });
});
