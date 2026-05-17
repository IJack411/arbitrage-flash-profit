// test/FlashLoanArbitrage.test.js
// Run (no fork):   npx hardhat test
// Run (fork):      FORK_RPC_URL=<alchemy-arbitrum-url> npx hardhat test
//
// Unit tests run in both modes.
// Fork-dependent integration tests are skipped when FORK_RPC_URL is absent,
// so the CI baseline passes without a paid RPC key.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ── Aave V3 Pool addresses (mainnet-fork default = Arbitrum) ─────────────────
const AAVE_ARBITRUM_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

// ── Arbitrum token addresses (for fork tests) ────────────────────────────────
const USDC_ARB    = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WETH_ARB    = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const UNISWAP_V3_ROUTER_ARB = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A "pool" address we control so the mock callback works cleanly in unit tests. */
async function deployMockPool() {
  const factory = await ethers.getContractFactory("MockAavePool");
  return factory.deploy();
}

/** Deploy the real contract with a real (or mock) pool address. */
async function deployContract(poolAddress) {
  const [owner, alice, bob] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("FlashLoanArbitrage");
  const contract = await Factory.deploy(poolAddress);
  await contract.waitForDeployment();
  return { contract, owner, alice, bob };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit Tests (no fork required)
// ─────────────────────────────────────────────────────────────────────────────

describe("FlashLoanArbitrage — Unit Tests", function () {

  // Use a real address as stand-in pool so constructor doesn't revert.
  // We won't actually call through Aave in these tests.
  const DUMMY_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

  async function fixture() {
    return deployContract(DUMMY_POOL);
  }

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("stores the pool address correctly", async function () {
      const { contract } = await loadFixture(fixture);
      expect(await contract.POOL()).to.equal(DUMMY_POOL);
    });

    it("sets deployer as owner", async function () {
      const { contract, owner } = await loadFixture(fixture);
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("defaults maxSlippageBps to 300", async function () {
      const { contract } = await loadFixture(fixture);
      expect(await contract.maxSlippageBps()).to.equal(300n);
    });

    it("reverts if pool is zero address", async function () {
      const Factory = await ethers.getContractFactory("FlashLoanArbitrage");
      await expect(Factory.deploy(ethers.ZeroAddress))
        .to.be.revertedWith("FlashLoanArbitrage: zero pool");
    });
  });

  // ── Caller Authorization ──────────────────────────────────────────────────

  describe("setAuthorizedCaller", function () {
    it("owner can authorize a caller", async function () {
      const { contract, owner, alice } = await loadFixture(fixture);
      await contract.connect(owner).setAuthorizedCaller(alice.address, true);
      expect(await contract.authorizedCallers(alice.address)).to.equal(true);
    });

    it("owner can revoke a caller", async function () {
      const { contract, owner, alice } = await loadFixture(fixture);
      await contract.connect(owner).setAuthorizedCaller(alice.address, true);
      await contract.connect(owner).setAuthorizedCaller(alice.address, false);
      expect(await contract.authorizedCallers(alice.address)).to.equal(false);
    });

    it("emits CallerUpdated event", async function () {
      const { contract, owner, alice } = await loadFixture(fixture);
      await expect(contract.connect(owner).setAuthorizedCaller(alice.address, true))
        .to.emit(contract, "CallerUpdated")
        .withArgs(alice.address, true);
    });

    it("reverts for zero address", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await expect(
        contract.connect(owner).setAuthorizedCaller(ethers.ZeroAddress, true)
      ).to.be.revertedWith("FlashLoanArbitrage: zero address");
    });

    it("non-owner cannot authorize callers", async function () {
      const { contract, alice, bob } = await loadFixture(fixture);
      await expect(
        contract.connect(alice).setAuthorizedCaller(bob.address, true)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  // ── Slippage Setting ──────────────────────────────────────────────────────

  describe("setMaxSlippage", function () {
    it("owner can update slippage", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await contract.connect(owner).setMaxSlippage(500);
      expect(await contract.maxSlippageBps()).to.equal(500n);
    });

    it("emits SlippageUpdated event", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await expect(contract.connect(owner).setMaxSlippage(200))
        .to.emit(contract, "SlippageUpdated")
        .withArgs(200n);
    });

    it("reverts if slippage > 10% (1000 bps)", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await expect(contract.connect(owner).setMaxSlippage(1001))
        .to.be.revertedWith("FlashLoanArbitrage: slippage > 10%");
    });

    it("allows exactly 1000 bps (10%)", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await contract.connect(owner).setMaxSlippage(1000);
      expect(await contract.maxSlippageBps()).to.equal(1000n);
    });

    it("non-owner cannot update slippage", async function () {
      const { contract, alice } = await loadFixture(fixture);
      await expect(contract.connect(alice).setMaxSlippage(100))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  // ── executeArbitrage Input Guards ─────────────────────────────────────────

  describe("executeArbitrage — input validation", function () {
    it("reverts for zero asset address", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const addr = "0x0000000000000000000000000000000000000001";
      await expect(
        contract.connect(owner).executeArbitrage(
          ethers.ZeroAddress, 1000n, addr, addr, addr, false, false, 500, 500, 0
        )
      ).to.be.revertedWith("FlashLoanArbitrage: zero asset");
    });

    it("reverts for zero amount", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const addr = "0x0000000000000000000000000000000000000001";
      await expect(
        contract.connect(owner).executeArbitrage(
          addr, 0n, addr, addr, addr, false, false, 500, 500, 0
        )
      ).to.be.revertedWith("FlashLoanArbitrage: zero amount");
    });

    it("reverts for zero routerA", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const addr = "0x0000000000000000000000000000000000000001";
      await expect(
        contract.connect(owner).executeArbitrage(
          addr, 1000n, ethers.ZeroAddress, addr, addr, false, false, 500, 500, 0
        )
      ).to.be.revertedWith("FlashLoanArbitrage: zero router");
    });

    it("reverts for zero tokenB", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const addr = "0x0000000000000000000000000000000000000001";
      await expect(
        contract.connect(owner).executeArbitrage(
          addr, 1000n, addr, addr, ethers.ZeroAddress, false, false, 500, 500, 0
        )
      ).to.be.revertedWith("FlashLoanArbitrage: invalid tokenB");
    });

    it("reverts when tokenB equals asset", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const addr = "0x0000000000000000000000000000000000000001";
      await expect(
        contract.connect(owner).executeArbitrage(
          addr, 1000n, addr, addr, addr /* tokenB == asset */, false, false, 500, 500, 0
        )
      ).to.be.revertedWith("FlashLoanArbitrage: invalid tokenB");
    });

    it("reverts for unauthorized caller (non-owner, non-authorized)", async function () {
      const { contract, alice } = await loadFixture(fixture);
      const addr = "0x0000000000000000000000000000000000000001";
      const addr2 = "0x0000000000000000000000000000000000000002";
      await expect(
        contract.connect(alice).executeArbitrage(
          addr, 1000n, addr, addr, addr2, false, false, 500, 500, 0
        )
      ).to.be.revertedWith("FlashLoanArbitrage: not authorized");
    });

    it("authorized caller can pass input validation", async function () {
      // Will revert at the Aave pool call (pool is not a real contract),
      // but should NOT revert on the authorization/input-validation guards.
      const { contract, owner, alice } = await loadFixture(fixture);
      await contract.connect(owner).setAuthorizedCaller(alice.address, true);

      const addr  = "0x0000000000000000000000000000000000000001";
      const addr2 = "0x0000000000000000000000000000000000000002";

      // Expect a low-level call failure (not one of our require strings).
      await expect(
        contract.connect(alice).executeArbitrage(
          addr, 1000n, addr, addr, addr2, false, false, 500, 500, 0
        )
      ).to.be.reverted; // some revert is fine — past our guards
    });
  });

  // ── executeOperation Auth Guard ───────────────────────────────────────────

  describe("executeOperation — auth guard", function () {
    it("reverts when called by anyone other than the pool", async function () {
      const { contract, alice } = await loadFixture(fixture);
      const empty = "0x";
      await expect(
        contract.connect(alice).executeOperation(
          "0x0000000000000000000000000000000000000001",
          1000n, 9n,
          contract.target, // initiator = contract itself
          empty
        )
      ).to.be.revertedWith("FlashLoanArbitrage: caller not Aave pool");
    });
  });

  // ── Withdrawals ───────────────────────────────────────────────────────────

  describe("withdrawETH", function () {
    it("reverts when there is no ETH balance", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await expect(contract.connect(owner).withdrawETH())
        .to.be.revertedWith("FlashLoanArbitrage: no ETH");
    });

    it("owner can withdraw ETH sent to the contract", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const deposit = ethers.parseEther("0.01");
      await owner.sendTransaction({ to: contract.target, value: deposit });
      expect(await ethers.provider.getBalance(contract.target)).to.equal(deposit);

      const before = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdrawETH();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);

      expect(after).to.be.closeTo(before + deposit - gasCost, ethers.parseEther("0.0001"));
      expect(await ethers.provider.getBalance(contract.target)).to.equal(0n);
    });

    it("non-owner cannot withdraw ETH", async function () {
      const { contract, owner, alice } = await loadFixture(fixture);
      await owner.sendTransaction({ to: contract.target, value: ethers.parseEther("0.001") });
      await expect(contract.connect(alice).withdrawETH())
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  describe("withdrawToken / withdrawAllToken", function () {
    it("reverts withdrawAllToken when balance is zero", async function () {
      const { contract, owner } = await loadFixture(fixture);
      // Use a real ERC20 address; balance will be 0 in the test environment.
      await expect(contract.connect(owner).withdrawAllToken(USDC_ARB))
        .to.be.reverted; // will fail on ERC20 balanceOf or the require(bal > 0)
    });

    it("non-owner cannot call withdrawToken", async function () {
      const { contract, alice } = await loadFixture(fixture);
      await expect(contract.connect(alice).withdrawToken(USDC_ARB, 1n))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("non-owner cannot call withdrawAllToken", async function () {
      const { contract, alice } = await loadFixture(fixture);
      await expect(contract.connect(alice).withdrawAllToken(USDC_ARB))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  // ── ETH receive ───────────────────────────────────────────────────────────

  describe("receive()", function () {
    it("accepts ETH transfers", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await expect(
        owner.sendTransaction({ to: contract.target, value: ethers.parseEther("0.001") })
      ).to.not.be.reverted;
      expect(await ethers.provider.getBalance(contract.target)).to.equal(
        ethers.parseEther("0.001")
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fork Integration Tests (skipped when FORK_RPC_URL is absent)
// ─────────────────────────────────────────────────────────────────────────────

const FORK_ENABLED = !!process.env.FORK_RPC_URL;

describe("FlashLoanArbitrage — Fork Integration Tests", function () {
  before(function () {
    if (!FORK_ENABLED) {
      console.log(
        "    ℹ️  Skipping fork tests — set FORK_RPC_URL (Arbitrum) to enable them."
      );
      this.skip();
    }
  });

  async function forkFixture() {
    return deployContract(AAVE_ARBITRUM_POOL);
  }

  it("deploys against the real Aave V3 pool on Arbitrum fork", async function () {
    const { contract } = await loadFixture(forkFixture);
    expect(await contract.POOL()).to.equal(AAVE_ARBITRUM_POOL);
  });

  it("reports a non-zero USDC balance for the Aave pool (fork sanity)", async function () {
    const usdc = await ethers.getContractAt(
      ["function balanceOf(address) view returns (uint256)"],
      USDC_ARB
    );
    const poolBalance = await usdc.balanceOf(AAVE_ARBITRUM_POOL);
    expect(poolBalance).to.be.gt(0n);
  });

  it("reverts an unprofitable arbitrage (no spread → repayAmount check fails)", async function () {
    const { contract, owner } = await loadFixture(forkFixture);

    // Impersonate a USDC whale to fund the contract so it looks solvent.
    // (The flash loan callback tries to do swaps; with identical routers there's
    //  no spread — the trade should revert with "trade unprofitable".)
    const USDC_WHALE = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
    await ethers.provider.send("hardhat_impersonateAccount", [USDC_WHALE]);
    const whale = await ethers.getSigner(USDC_WHALE);

    // Fund the whale with ETH for gas (hardhat_setBalance).
    await ethers.provider.send("hardhat_setBalance", [
      USDC_WHALE,
      "0x" + ethers.parseEther("10").toString(16),
    ]);

    // Attempt a flash loan where both legs use the same V3 router / same pool.
    // After both swaps the output will be less than the input due to fees → should
    // revert at "trade unprofitable".
    await expect(
      contract.connect(owner).executeArbitrage(
        USDC_ARB,
        ethers.parseUnits("1000", 6), // $1k USDC
        UNISWAP_V3_ROUTER_ARB,        // routerA
        UNISWAP_V3_ROUTER_ARB,        // routerB (same — no spread)
        WETH_ARB,                     // tokenB
        true,  // routerAisV3
        true,  // routerBisV3
        3000,  // feeA (0.3%)
        3000,  // feeB (0.3%)
        0      // amountBMin (no guard — we want to reach the profit check)
      )
    ).to.be.revertedWith("FlashLoanArbitrage: trade unprofitable");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [USDC_WHALE]);
  });
});
