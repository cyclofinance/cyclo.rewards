import { describe, it, expect, vi } from "vitest";
import {
  parseIntStrict,
  mapSubgraphTransfer,
  mapSubgraphLiquidityChange,
  SubgraphTransfer,
  SubgraphLiquidityChangeV2,
  SubgraphLiquidityChangeV3,
} from "./scraper";

/** Minimal valid subgraph transfer for test construction */
const VALID_SUBGRAPH_TRANSFER: SubgraphTransfer = {
  id: "tx1-0",
  tokenAddress: "0x10000000000000000000000000000000000000ab",
  from: { id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  to: { id: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
  value: "500000000000000000000",
  blockNumber: "12345678",
  blockTimestamp: "1700000000",
  transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
};

/** Minimal valid V2 subgraph liquidity change */
const VALID_V2_LIQUIDITY: SubgraphLiquidityChangeV2 = {
  __typename: "LiquidityV2Change",
  id: "liq-v2-1",
  owner: { address: "0xcccccccccccccccccccccccccccccccccccccccc" },
  tokenAddress: "0x10000000000000000000000000000000000000ab",
  lpAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
  liquidityChangeType: "DEPOSIT",
  liquidityChange: "1000000",
  depositedBalanceChange: "500000",
  blockNumber: "12345678",
  blockTimestamp: "1700000000",
  transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
};

/** Minimal valid V3 subgraph liquidity change */
const VALID_V3_LIQUIDITY: SubgraphLiquidityChangeV3 = {
  __typename: "LiquidityV3Change",
  id: "liq-v3-1",
  owner: { address: "0xcccccccccccccccccccccccccccccccccccccccc" },
  tokenAddress: "0x10000000000000000000000000000000000000ab",
  lpAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
  liquidityChangeType: "DEPOSIT",
  liquidityChange: "1000000",
  depositedBalanceChange: "500000",
  blockNumber: "12345678",
  blockTimestamp: "1700000000",
  transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  tokenId: "42",
  poolAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  fee: "3000",
  lowerTick: "-887272",
  upperTick: "887272",
};

describe("mapSubgraphTransfer", () => {
  it("should flatten from/to nested objects to plain addresses", () => {
    const result = mapSubgraphTransfer(VALID_SUBGRAPH_TRANSFER);
    expect(result.from).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(result.to).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("should parse blockNumber and timestamp from strings to numbers", () => {
    const result = mapSubgraphTransfer(VALID_SUBGRAPH_TRANSFER);
    expect(result.blockNumber).toBe(12345678);
    expect(result.timestamp).toBe(1700000000);
  });

  it("should pass through tokenAddress, value, and transactionHash unchanged", () => {
    const result = mapSubgraphTransfer(VALID_SUBGRAPH_TRANSFER);
    expect(result.tokenAddress).toBe(VALID_SUBGRAPH_TRANSFER.tokenAddress);
    expect(result.value).toBe(VALID_SUBGRAPH_TRANSFER.value);
    expect(result.transactionHash).toBe(VALID_SUBGRAPH_TRANSFER.transactionHash);
  });

  it("should not include the subgraph id field in the output", () => {
    const result = mapSubgraphTransfer(VALID_SUBGRAPH_TRANSFER);
    expect("id" in result).toBe(false);
  });

  it("should parse zero blockNumber and timestamp", () => {
    const transfer: SubgraphTransfer = {
      ...VALID_SUBGRAPH_TRANSFER,
      blockNumber: "0",
      blockTimestamp: "0",
    };
    const result = mapSubgraphTransfer(transfer);
    expect(result.blockNumber).toBe(0);
    expect(result.timestamp).toBe(0);
  });

  it("should throw on non-numeric blockNumber", () => {
    const transfer = { ...VALID_SUBGRAPH_TRANSFER, blockNumber: "abc" };
    expect(() => mapSubgraphTransfer(transfer)).toThrow("blockNumber");
  });

  it("should throw on non-numeric blockTimestamp", () => {
    const transfer = { ...VALID_SUBGRAPH_TRANSFER, blockTimestamp: "xyz" };
    expect(() => mapSubgraphTransfer(transfer)).toThrow("blockTimestamp");
  });

  it("should throw on invalid from address", () => {
    const transfer = { ...VALID_SUBGRAPH_TRANSFER, from: { id: "not-an-address" } };
    expect(() => mapSubgraphTransfer(transfer)).toThrow("from");
  });

  it("should throw on invalid to address", () => {
    const transfer = { ...VALID_SUBGRAPH_TRANSFER, to: { id: "0xshort" } };
    expect(() => mapSubgraphTransfer(transfer)).toThrow("to");
  });

  it("should throw on invalid tokenAddress", () => {
    const transfer = { ...VALID_SUBGRAPH_TRANSFER, tokenAddress: "garbage" };
    expect(() => mapSubgraphTransfer(transfer)).toThrow("tokenAddress");
  });

  it("should throw on non-numeric value", () => {
    const transfer = { ...VALID_SUBGRAPH_TRANSFER, value: "not-a-number" };
    expect(() => mapSubgraphTransfer(transfer)).toThrow("value");
  });

  it("should accept valid numeric value strings", () => {
    const transfer = { ...VALID_SUBGRAPH_TRANSFER, value: "0" };
    expect(() => mapSubgraphTransfer(transfer)).not.toThrow();
  });
});

describe("mapSubgraphLiquidityChange", () => {
  it("should map V2 liquidity change with correct __typename", () => {
    const result = mapSubgraphLiquidityChange(VALID_V2_LIQUIDITY);
    expect(result.__typename).toBe("LiquidityV2Change");
    expect(result.owner).toBe("0xcccccccccccccccccccccccccccccccccccccccc");
    expect(result.changeType).toBe("DEPOSIT");
    expect(result.blockNumber).toBe(12345678);
    expect(result.timestamp).toBe(1700000000);
  });

  it("should map V3 liquidity change with V3-specific fields", () => {
    const result = mapSubgraphLiquidityChange(VALID_V3_LIQUIDITY);
    expect(result.__typename).toBe("LiquidityV3Change");
    if (result.__typename === "LiquidityV3Change") {
      expect(result.tokenId).toBe("42");
      expect(result.poolAddress).toBe("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
      expect(result.fee).toBe(3000);
      expect(result.lowerTick).toBe(-887272);
      expect(result.upperTick).toBe(887272);
    }
  });

  it("should parse negative tick values correctly", () => {
    const v3WithNegativeTicks: SubgraphLiquidityChangeV3 = {
      ...VALID_V3_LIQUIDITY,
      lowerTick: "-100",
      upperTick: "-50",
    };
    const result = mapSubgraphLiquidityChange(v3WithNegativeTicks);
    if (result.__typename === "LiquidityV3Change") {
      expect(result.lowerTick).toBe(-100);
      expect(result.upperTick).toBe(-50);
    }
  });

  it("should not include V3 fields on V2 result", () => {
    const result = mapSubgraphLiquidityChange(VALID_V2_LIQUIDITY);
    expect("tokenId" in result).toBe(false);
    expect("poolAddress" in result).toBe(false);
    expect("fee" in result).toBe(false);
    expect("lowerTick" in result).toBe(false);
    expect("upperTick" in result).toBe(false);
  });

  it("should map owner from nested address field", () => {
    const result = mapSubgraphLiquidityChange(VALID_V2_LIQUIDITY);
    expect(result.owner).toBe(VALID_V2_LIQUIDITY.owner.address);
  });

  it("should handle WITHDRAW change type", () => {
    const withdraw: SubgraphLiquidityChangeV2 = {
      ...VALID_V2_LIQUIDITY,
      liquidityChangeType: "WITHDRAW",
    };
    const result = mapSubgraphLiquidityChange(withdraw);
    expect(result.changeType).toBe("WITHDRAW");
  });

  it("should handle TRANSFER change type", () => {
    const transfer: SubgraphLiquidityChangeV2 = {
      ...VALID_V2_LIQUIDITY,
      liquidityChangeType: "TRANSFER",
    };
    const result = mapSubgraphLiquidityChange(transfer);
    expect(result.changeType).toBe("TRANSFER");
  });

  it("should pass through liquidityChange and depositedBalanceChange as strings", () => {
    const result = mapSubgraphLiquidityChange(VALID_V2_LIQUIDITY);
    expect(result.liquidityChange).toBe("1000000");
    expect(result.depositedBalanceChange).toBe("500000");
  });

  it("should handle tick boundary values", () => {
    const maxTicks: SubgraphLiquidityChangeV3 = {
      ...VALID_V3_LIQUIDITY,
      lowerTick: "-887272",
      upperTick: "887272",
    };
    const result = mapSubgraphLiquidityChange(maxTicks);
    if (result.__typename === "LiquidityV3Change") {
      expect(result.lowerTick).toBe(-887272);
      expect(result.upperTick).toBe(887272);
    }
  });

  it("should handle zero tick value", () => {
    const zeroTick: SubgraphLiquidityChangeV3 = {
      ...VALID_V3_LIQUIDITY,
      lowerTick: "0",
      upperTick: "0",
    };
    const result = mapSubgraphLiquidityChange(zeroTick);
    if (result.__typename === "LiquidityV3Change") {
      expect(result.lowerTick).toBe(0);
      expect(result.upperTick).toBe(0);
    }
  });

  it("should throw on non-numeric blockNumber", () => {
    const liq = { ...VALID_V2_LIQUIDITY, blockNumber: "abc" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("blockNumber");
  });

  it("should throw on non-numeric blockTimestamp", () => {
    const liq = { ...VALID_V2_LIQUIDITY, blockTimestamp: "" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("blockTimestamp");
  });

  it("should throw on invalid owner address", () => {
    const liq = { ...VALID_V2_LIQUIDITY, owner: { address: "bad" } };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("owner");
  });

  it("should throw on invalid tokenAddress", () => {
    const liq = { ...VALID_V2_LIQUIDITY, tokenAddress: "0xTOOSHORT" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("tokenAddress");
  });

  it("should throw on invalid lpAddress", () => {
    const liq = { ...VALID_V2_LIQUIDITY, lpAddress: "" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("lpAddress");
  });

  it("should throw on unknown liquidityChangeType", () => {
    const liq = { ...VALID_V2_LIQUIDITY, liquidityChangeType: "SWAP" as any };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("liquidityChangeType");
  });

  it("should throw on non-numeric V3 fee", () => {
    const liq = { ...VALID_V3_LIQUIDITY, fee: "abc" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("fee");
  });

  it("should throw on non-numeric V3 lowerTick", () => {
    const liq = { ...VALID_V3_LIQUIDITY, lowerTick: "xyz" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("lowerTick");
  });

  it("should throw on non-numeric V3 upperTick", () => {
    const liq = { ...VALID_V3_LIQUIDITY, upperTick: "not-a-tick" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("upperTick");
  });

  it("should throw on invalid V3 poolAddress", () => {
    const liq = { ...VALID_V3_LIQUIDITY, poolAddress: "bad-pool" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("poolAddress");
  });

  it("should throw on non-numeric liquidityChange", () => {
    const liq = { ...VALID_V2_LIQUIDITY, liquidityChange: "abc" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("liquidityChange");
  });

  it("should throw on non-numeric depositedBalanceChange", () => {
    const liq = { ...VALID_V2_LIQUIDITY, depositedBalanceChange: "xyz" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("depositedBalanceChange");
  });

  it("should accept negative liquidityChange", () => {
    const liq = { ...VALID_V2_LIQUIDITY, liquidityChange: "-500000" };
    expect(() => mapSubgraphLiquidityChange(liq)).not.toThrow();
  });

  it("should accept negative depositedBalanceChange", () => {
    const liq = { ...VALID_V2_LIQUIDITY, depositedBalanceChange: "-123456" };
    expect(() => mapSubgraphLiquidityChange(liq)).not.toThrow();
  });

  it("should throw on non-numeric V3 tokenId", () => {
    const liq = { ...VALID_V3_LIQUIDITY, tokenId: "abc" };
    expect(() => mapSubgraphLiquidityChange(liq)).toThrow("tokenId");
  });
});

describe("parseIntStrict", () => {
  it("should parse valid integers", () => {
    expect(parseIntStrict("123", "test")).toBe(123);
    expect(parseIntStrict("0", "test")).toBe(0);
    expect(parseIntStrict("-5", "test")).toBe(-5);
  });

  it("should reject trailing garbage", () => {
    expect(() => parseIntStrict("123abc", "test")).toThrow();
  });

  it("should reject floats", () => {
    expect(() => parseIntStrict("3.14", "test")).toThrow();
  });

  it("should reject hex", () => {
    expect(() => parseIntStrict("0x1A", "test")).toThrow();
  });

  it("should reject empty string", () => {
    expect(() => parseIntStrict("", "test")).toThrow();
  });

  it("should accept numeric inputs (subgraph returns numbers for some fields)", () => {
    expect(parseIntStrict(100 as unknown as string, "test")).toBe(100);
    expect(parseIntStrict(0 as unknown as string, "test")).toBe(0);
    expect(parseIntStrict(-42 as unknown as string, "test")).toBe(-42);
  });
});

