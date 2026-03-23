import { describe, it, expect } from "vitest";
import { ONE_18, REWARD_POOL, VALID_ADDRESS_REGEX, EPOCHS, CURRENT_EPOCH } from "./constants";

describe("constants", () => {
  it("ONE_18 is exactly 1e18", () => {
    expect(ONE_18).toBe(10n ** 18n);
  });

  it("REWARD_POOL is exactly 500_000 tokens in wei", () => {
    expect(REWARD_POOL).toBe(500_000n * 10n ** 18n);
  });
});

describe("VALID_ADDRESS_REGEX", () => {
  it("matches valid 40-hex-char addresses", () => {
    expect(VALID_ADDRESS_REGEX.test("0x1234567890abcdef1234567890abcdef12345678")).toBe(true);
    expect(VALID_ADDRESS_REGEX.test("0xABCDEF1234567890ABCDEF1234567890ABCDEF12")).toBe(true);
  });

  it("rejects addresses without 0x prefix", () => {
    expect(VALID_ADDRESS_REGEX.test("1234567890abcdef1234567890abcdef12345678")).toBe(false);
  });

  it("rejects addresses with wrong length", () => {
    expect(VALID_ADDRESS_REGEX.test("0x1234")).toBe(false);
    expect(VALID_ADDRESS_REGEX.test("0x1234567890abcdef1234567890abcdef1234567890")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(VALID_ADDRESS_REGEX.test("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(VALID_ADDRESS_REGEX.test("")).toBe(false);
  });
});

describe("CURRENT_EPOCH", () => {
  const epoch = EPOCHS[CURRENT_EPOCH - 1];

  it("points to a valid epoch", () => {
    expect(epoch).toBeDefined();
    expect(epoch.number).toBe(CURRENT_EPOCH);
  });

  it("has a seed", () => {
    expect(typeof epoch.seed).toBe("string");
    expect(epoch.seed!.length).toBeGreaterThan(0);
  });

  it("has a startBlock", () => {
    expect(epoch.startBlock).toBeDefined();
    expect(Number.isInteger(epoch.startBlock)).toBe(true);
    expect(epoch.startBlock).toBeGreaterThan(0);
  });

  it("has an endBlock greater than startBlock", () => {
    expect(epoch.endBlock).toBeGreaterThan(epoch.startBlock!);
  });
});
