import { describe, it, expect } from "vitest";
import { ONE, REWARD_POOL, VALID_ADDRESS_REGEX } from "./constants";

describe("constants", () => {
  it("ONE is exactly 1e18", () => {
    expect(ONE).toBe(10n ** 18n);
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
