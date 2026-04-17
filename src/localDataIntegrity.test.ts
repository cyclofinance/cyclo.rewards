/**
 * Verifies integrity of locally scraped data files.
 * These tests run against committed data and catch corruption or ordering issues.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { CYTOKENS } from "./config";

const liquidityData = readFileSync("./data/liquidity.dat", "utf8");
const liquidityLines = liquidityData.split("\n").filter(Boolean);

interface LiquidityEvent {
  owner: string;
  tokenAddress: string;
  blockNumber: number;
  transactionHash: string;
  changeType: string;
}

const events: LiquidityEvent[] = liquidityLines.map((line) => JSON.parse(line));

describe("liquidity.dat integrity", () => {
  it("contains a meaningful number of events", () => {
    // Guard against truncated/empty data file — the other integrity tests
    // vacuously pass on empty input.
    expect(events.length).toBeGreaterThan(0);
  });

  it("events are sorted by blockNumber", () => {
    for (let i = 1; i < events.length; i++) {
      expect(events[i].blockNumber).toBeGreaterThanOrEqual(
        events[i - 1].blockNumber,
      );
    }
  });

  it("no duplicate transactionHash per owner+tokenAddress", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const event of events) {
      const key = `${event.owner}-${event.tokenAddress}-${event.transactionHash}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    expect(
      duplicates,
      `Found ${duplicates.length} duplicate(s): ${duplicates.slice(0, 5).join(", ")}`,
    ).toHaveLength(0);
  });

  it("all tokenAddresses are known cy tokens", () => {
    const cyAddresses = new Set(CYTOKENS.map((t) => t.address));
    const unknown = events.filter((e) => !cyAddresses.has(e.tokenAddress));
    expect(
      unknown,
      `Found ${unknown.length} events with unknown token`,
    ).toHaveLength(0);
  });

  it("all changeTypes are valid", () => {
    const valid = new Set(["DEPOSIT", "WITHDRAW", "TRANSFER"]);
    const invalid = events.filter((e) => !valid.has(e.changeType));
    expect(
      invalid,
      `Found ${invalid.length} events with invalid changeType`,
    ).toHaveLength(0);
  });
});
