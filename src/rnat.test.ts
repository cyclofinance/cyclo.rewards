import { describe, it, expect } from "vitest";
import { createPublicClient, http, parseAbi } from "viem";
import { flare } from "viem/chains";
import { REWARD_POOL, EPOCHS, CURRENT_EPOCH } from "./constants";

const RNAT_ADDRESS = "0x26d460c3cf931fb2014fa436a49e3af08619810e";
const CYCLO_PROJECT_ID = 6n;

const abi = parseAbi([
  "function getProjectRewardsInfo(uint256 _projectId, uint256 _month) view returns (uint128 _assignedRewards, uint128 _distributedRewards, uint128 _claimedRewards, uint128 _unassignedUnclaimedRewards)",
  "function getProjectInfo(uint256 _projectId) view returns (string _name, address _distributor, bool _currentMonthDistributionEnabled, bool _distributionDisabled, bool _claimingDisabled, uint128 _totalAssignedRewards, uint128 _totalDistributedRewards, uint128 _totalClaimedRewards, uint128 _totalUnassignedUnclaimedRewards, uint256[] _monthsWithRewards)",
]);

const client = createPublicClient({
  chain: flare,
  transport: http(process.env.RPC_URL),
});

describe("rNat on-chain allocation", () => {
  it("project 6 is Cyclo", async () => {
    const info = await client.readContract({ address: RNAT_ADDRESS, abi, functionName: "getProjectInfo", args: [CYCLO_PROJECT_ID] });
    expect(info[0]).toBe("Cyclo");
  }, 30_000);

  it("REWARD_POOL matches on-chain assigned amount for current epoch", async () => {
    const epoch = EPOCHS[CURRENT_EPOCH - 1];
    // rNat month numbering is offset by 1 from our epoch numbering:
    // our epoch 19 (Dec) = rNat month 18, epoch 20 (Jan) = rNat month 19, etc.
    const rnatMonth = BigInt(CURRENT_EPOCH - 1);

    const info = await client.readContract({
      address: RNAT_ADDRESS,
      abi,
      functionName: "getProjectRewardsInfo",
      args: [CYCLO_PROJECT_ID, rnatMonth],
    });
    const assignedOnChain = info[0];

    expect(assignedOnChain).toBe(REWARD_POOL);
  }, 30_000);
});
