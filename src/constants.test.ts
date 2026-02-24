import { describe, it, expect } from "vitest";
import { ONE, REWARD_POOL } from "./constants";

describe("constants", () => {
  it("ONE is exactly 1e18", () => {
    expect(ONE).toBe(10n ** 18n);
  });

  it("REWARD_POOL is exactly 500_000 tokens in wei", () => {
    expect(REWARD_POOL).toBe(500_000n * 10n ** 18n);
  });
});
