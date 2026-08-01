// test/FlashLoanArbitrage.test.js
// Run (no fork):   npx hardhat test
// Run (fork):      FORK_RPC_URL=<alchemy-arbitrum-url> npx hardhat test
//
// Unit + mock-integration tests run in both modes (no paid RPC required).
// Fork-dependent integration tests are skipped when FORK_RPC_URL is absent,
// so the CI baseline passes without a paid RPC key.
//
// Phase 5: the contract now takes an arbitrary multi-hop `Hop[]` path instead of
// a fixed 2-hop tuple. Tests cover 2-hop regression, 3-hop happy path, and all
// fail-closed guards (path closure, path length, profit gate, auth, reentrancy).

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ── Aave V3 Pool addresses (mainnet-fork default = Arbitrum) ─────────────────
const AAVE_ARBITRUM_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

// ── Arbitrum token addresses (for fork tests) ────────────────────────────────
const USDC_ARB    = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WETH_ARB    = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const ARB_TOKEN   = "0x912CE59144191C1204E64559FE8253a0e49E6548";
const UNISWAP_V3_ROUTER_ARB = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Hop tuple in the order the ABI expects. */
function hop(router, tokenOut, { isV3 = false, fee = 0, amountOutMin = 0 } = {}) {
  return [router, tokenOut, isV3, fee, amountOutMin];
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

  const ASSET   = "0x0000000000000000000000000000000000000010";
  const TOKEN_B = "0x0000000000000000000000000000000000000011";
  const ROUTER  = "0x0000000000000000000000000000000000000021";

  /** A structurally-valid 2-hop path that closes back to ASSET. */
  function validHops(asset = ASSET) {
    return [hop(ROUTER, TOKEN_B), hop(ROUTER, asset)];
  }

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

    it("exposes MIN_HOPS = 2 and MAX_HOPS = 5", async function () {
      const { contract } = await loadFixture(fixture);
      expect(await contract.MIN_HOPS()).to.equal(2n);
      expect(await contract.MAX_HOPS()).to.equal(5n);
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

  // ── executeArbitrage Input Guards (Hop[] signature) ───────────────────────

  describe("executeArbitrage — input validation", function () {
    it("reverts for zero asset address", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await expect(
        contract.connect(owner).executeArbitrage(ethers.ZeroAddress, 1000n, validHops())
      ).to.be.revertedWith("FlashLoanArbitrage: zero asset");
    });

    it("reverts for zero amount", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await expect(
        contract.connect(owner).executeArbitrage(ASSET, 0n, validHops())
      ).to.be.revertedWith("FlashLoanArbitrage: zero amount");
    });

    it("reverts for too-short path (< MIN_HOPS)", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const oneHop = [hop(ROUTER, ASSET)];
      await expect(
        contract.connect(owner).executeArbitrage(ASSET, 1000n, oneHop)
      ).to.be.revertedWith("FlashLoanArbitrage: bad path length");
    });

    it("reverts for empty path", async function () {
      const { contract, owner } = await loadFixture(fixture);
      await expect(
        contract.connect(owner).executeArbitrage(ASSET, 1000n, [])
      ).to.be.revertedWith("FlashLoanArbitrage: bad path length");
    });

    it("reverts for too-long path (> MAX_HOPS)", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const tks = [
        "0x0000000000000000000000000000000000000031",
        "0x0000000000000000000000000000000000000032",
        "0x0000000000000000000000000000000000000033",
        "0x0000000000000000000000000000000000000034",
        "0x0000000000000000000000000000000000000035",
      ];
      const sixHops = [
        hop(ROUTER, tks[0]), hop(ROUTER, tks[1]), hop(ROUTER, tks[2]),
        hop(ROUTER, tks[3]), hop(ROUTER, tks[4]), hop(ROUTER, ASSET),
      ];
      await expect(
        contract.connect(owner).executeArbitrage(ASSET, 1000n, sixHops)
      ).to.be.revertedWith("FlashLoanArbitrage: bad path length");
    });

    it("reverts for a zero router in any hop", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const hops = [hop(ethers.ZeroAddress, TOKEN_B), hop(ROUTER, ASSET)];
      await expect(
        contract.connect(owner).executeArbitrage(ASSET, 1000n, hops)
      ).to.be.revertedWith("FlashLoanArbitrage: zero router");
    });

    it("reverts for a zero tokenOut in any hop", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const hops = [hop(ROUTER, TOKEN_B), hop(ROUTER, ethers.ZeroAddress)];
      await expect(
        contract.connect(owner).executeArbitrage(ASSET, 1000n, hops)
      ).to.be.revertedWith("FlashLoanArbitrage: zero tokenOut");
    });

    it("reverts when the path does not close back to the borrowed asset", async function () {
      const { contract, owner } = await loadFixture(fixture);
      const hops = [hop(ROUTER, TOKEN_B), hop(ROUTER, TOKEN_B)];
      await expect(
        contract.connect(owner).executeArbitrage(ASSET, 1000n, hops)
      ).to.be.revertedWith("FlashLoanArbitrage: path must close to asset");
    });

    it("reverts for unauthorized caller (non-owner, non-authorized)", async function () {
      const { contract, alice } = await loadFixture(fixture);
      await expect(
        contract.connect(alice).executeArbitrage(ASSET, 1000n, validHops())
      ).to.be.revertedWith("FlashLoanArbitrage: not authorized");
    });

    it("authorized caller passes input validation (fails later at pool call)", async function () {
      const { contract, owner, alice } = await loadFixture(fixture);
      await contract.connect(owner).setAuthorizedCaller(alice.address, true);
      // DUMMY_POOL is not a real pool contract → low-level call fails AFTER our guards.
      await expect(
        contract.connect(alice).executeArbitrage(ASSET, 1000n, validHops())
      ).to.be.reverted;
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
// Multi-hop Mock Integration Tests (no fork required — full execution path)
//
// These use in-repo mocks (MockAavePool + MockRouter + MockERC20) so we can run
// real flash-loan → multi-hop swap → repay flows without a paid fork RPC.
// ─────────────────────────────────────────────────────────────────────────────

describe("FlashLoanArbitrage — Multi-hop Mock Integration", function () {
  const UNIT = 10n ** 18n; // all mock tokens use 18 decimals for simple math
  const AMOUNT = 1000n * UNIT;

  async function mockFixture() {
    const [owner, alice] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockERC20");
    const asset  = await ERC20.deploy("Asset", "AST", 18);
    const tokenB = await ERC20.deploy("TokenB", "TKB", 18);
    const tokenC = await ERC20.deploy("TokenC", "TKC", 18);
    await Promise.all([asset.waitForDeployment(), tokenB.waitForDeployment(), tokenC.waitForDeployment()]);

    const Router = await ethers.getContractFactory("MockRouter");
    const router = await Router.deploy();
    await router.waitForDeployment();

    const Pool = await ethers.getContractFactory("MockAavePool");
    const pool = await Pool.deploy();
    await pool.waitForDeployment();

    const Factory = await ethers.getContractFactory("FlashLoanArbitrage");
    const contract = await Factory.deploy(await pool.getAddress());
    await contract.waitForDeployment();

    // Fund the pool so it can lend `asset`.
    await asset.mint(await pool.getAddress(), 10_000_000n * UNIT);

    return { owner, alice, asset, tokenB, tokenC, router, pool, contract };
  }

  it("executes a profitable 2-hop path and repays the loan (regression)", async function () {
    const { owner, asset, tokenB, router, contract } = await loadFixture(mockFixture);
    const R = await router.getAddress();
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();

    // asset -> B at 2x, then B -> asset at 0.6x  => 1000 * 2 * 0.6 = 1200 asset out
    await router.setRate(AST, B, 2, 1);
    await router.setRate(B, AST, 6, 10);

    await tokenB.mint(R, 10_000_000n * UNIT);
    await asset.mint(R, 10_000_000n * UNIT);

    const hops = [
      hop(R, B,   { isV3: true, fee: 3000 }),
      hop(R, AST, { isV3: true, fee: 3000 }),
    ];

    await expect(contract.connect(owner).executeArbitrage(AST, AMOUNT, hops))
      .to.emit(contract, "ArbitrageExecuted");

    // premium = 0.05% of 1000 = 0.5; profit = 1200 - 1000.5 = 199.5 asset retained.
    const premium = (AMOUNT * 5n) / 10_000n;
    const expectedProfit = (AMOUNT * 12n) / 10n - (AMOUNT + premium);
    expect(await asset.balanceOf(await contract.getAddress())).to.equal(expectedProfit);
  });

  it("executes a profitable 3-hop path (asset -> B -> C -> asset)", async function () {
    const { owner, asset, tokenB, tokenC, router, contract } = await loadFixture(mockFixture);
    const R = await router.getAddress();
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();
    const C = await tokenC.getAddress();

    // 1000 * 2 (A->B) * 1 (B->C) * 0.6 (C->A) = 1200 asset out
    await router.setRate(AST, B, 2, 1);
    await router.setRate(B, C, 1, 1);
    await router.setRate(C, AST, 6, 10);

    await tokenB.mint(R, 10_000_000n * UNIT);
    await tokenC.mint(R, 10_000_000n * UNIT);
    await asset.mint(R, 10_000_000n * UNIT);

    const hops = [
      hop(R, B,   { isV3: false }),          // V2 leg
      hop(R, C,   { isV3: true, fee: 500 }), // V3 leg
      hop(R, AST, { isV3: false }),          // V2 leg
    ];

    await expect(contract.connect(owner).executeArbitrage(AST, AMOUNT, hops))
      .to.emit(contract, "ArbitrageExecuted");

    const premium = (AMOUNT * 5n) / 10_000n;
    const expectedProfit = (AMOUNT * 12n) / 10n - (AMOUNT + premium);
    expect(await asset.balanceOf(await contract.getAddress())).to.equal(expectedProfit);
  });

  it("executes the maximum-length path (MAX_HOPS = 5)", async function () {
    const { owner, asset, tokenB, tokenC, router, contract } = await loadFixture(mockFixture);
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const tokenD = await ERC20.deploy("TokenD", "TKD", 18);
    const tokenE = await ERC20.deploy("TokenE", "TKE", 18);
    await Promise.all([tokenD.waitForDeployment(), tokenE.waitForDeployment()]);

    const R = await router.getAddress();
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();
    const C = await tokenC.getAddress();
    const D = await tokenD.getAddress();
    const E = await tokenE.getAddress();

    // 1000 * 2 * 1 * 1 * 1 * 0.6 = 1200 asset out
    await router.setRate(AST, B, 2, 1);
    await router.setRate(B, C, 1, 1);
    await router.setRate(C, D, 1, 1);
    await router.setRate(D, E, 1, 1);
    await router.setRate(E, AST, 6, 10);

    for (const t of [tokenB, tokenC, tokenD, tokenE, asset]) {
      await t.mint(R, 10_000_000n * UNIT);
    }

    const hops = [
      hop(R, B,   { isV3: true, fee: 3000 }),
      hop(R, C,   { isV3: false }),
      hop(R, D,   { isV3: true, fee: 3000 }),
      hop(R, E,   { isV3: false }),
      hop(R, AST, { isV3: true, fee: 3000 }),
    ];

    await expect(contract.connect(owner).executeArbitrage(AST, AMOUNT, hops))
      .to.emit(contract, "ArbitrageExecuted");
  });

  it("reverts an unprofitable path at the on-chain profit gate", async function () {
    const { owner, asset, tokenB, router, contract } = await loadFixture(mockFixture);
    const R = await router.getAddress();
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();

    // asset -> B at 1x, B -> asset at 0.9x  => 900 asset out < 1000 + premium
    await router.setRate(AST, B, 1, 1);
    await router.setRate(B, AST, 9, 10);

    await tokenB.mint(R, 10_000_000n * UNIT);
    await asset.mint(R, 10_000_000n * UNIT);

    const hops = [
      hop(R, B,   { isV3: true, fee: 3000 }),
      hop(R, AST, { isV3: true, fee: 3000 }),
    ];

    await expect(contract.connect(owner).executeArbitrage(AST, AMOUNT, hops))
      .to.be.revertedWith("FlashLoanArbitrage: trade unprofitable");
  });

  it("enforces per-hop amountOutMin (slippage guard) inside the loop", async function () {
    const { owner, asset, tokenB, router, contract } = await loadFixture(mockFixture);
    const R = await router.getAddress();
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();

    await router.setRate(AST, B, 2, 1);   // 1000 -> 2000 B
    await router.setRate(B, AST, 6, 10);

    await tokenB.mint(R, 10_000_000n * UNIT);
    await asset.mint(R, 10_000_000n * UNIT);

    // Demand 3000 B out of the first hop, but only 2000 is achievable.
    const hops = [
      hop(R, B,   { isV3: true, fee: 3000, amountOutMin: 3000n * UNIT }),
      hop(R, AST, { isV3: true, fee: 3000 }),
    ];

    await expect(contract.connect(owner).executeArbitrage(AST, AMOUNT, hops))
      .to.be.revertedWith("MockRouter: insufficient output amount");
  });

  it("authorized (non-owner) caller can execute; unauthorized cannot", async function () {
    const { owner, alice, asset, tokenB, router, contract } = await loadFixture(mockFixture);
    const R = await router.getAddress();
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();

    await router.setRate(AST, B, 2, 1);
    await router.setRate(B, AST, 6, 10);
    await tokenB.mint(R, 10_000_000n * UNIT);
    await asset.mint(R, 10_000_000n * UNIT);

    const hops = [
      hop(R, B,   { isV3: true, fee: 3000 }),
      hop(R, AST, { isV3: true, fee: 3000 }),
    ];

    // Unauthorized alice is blocked at the entry guard.
    await expect(contract.connect(alice).executeArbitrage(AST, AMOUNT, hops))
      .to.be.revertedWith("FlashLoanArbitrage: not authorized");

    // Owner authorizes alice → she can execute.
    await contract.connect(owner).setAuthorizedCaller(alice.address, true);
    await expect(contract.connect(alice).executeArbitrage(AST, AMOUNT, hops))
      .to.emit(contract, "ArbitrageExecuted");
  });

  it("blocks reentrancy: a malicious router cannot re-enter executeArbitrage", async function () {
    const { owner, asset, tokenB, contract } = await loadFixture(mockFixture);
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();

    const Reentrant = await ethers.getContractFactory("ReentrantRouter");
    const evil = await Reentrant.deploy();
    await evil.waitForDeployment();
    await evil.configure(await contract.getAddress(), AST);

    await tokenB.mint(await evil.getAddress(), 10_000_000n * UNIT);
    await asset.mint(await evil.getAddress(), 10_000_000n * UNIT);

    const R = await evil.getAddress();
    const hops = [
      hop(R, B,   { isV3: true, fee: 3000 }),
      hop(R, AST, { isV3: true, fee: 3000 }),
    ];

    // The nested executeArbitrage call hits nonReentrant → the whole tx reverts.
    await expect(contract.connect(owner).executeArbitrage(AST, AMOUNT, hops))
      .to.be.reverted;
  });

  it("reverts in the callback when the decoded path does not close to asset", async function () {
    // Drive executeOperation directly (impersonating the pool) with a non-closing
    // path to prove the fail-closed re-check inside the fund-moving code path.
    const { asset, tokenB, pool, contract } = await loadFixture(mockFixture);
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();
    const Router = await ethers.getContractFactory("MockRouter");
    const R = await Router.deploy();
    await R.waitForDeployment();
    const Raddr = await R.getAddress();

    const hopType = "tuple(address router,address tokenOut,bool isV3,uint24 fee,uint256 amountOutMin)[]";
    const badParams = ethers.AbiCoder.defaultAbiCoder().encode(
      [hopType],
      [[ [Raddr, B, true, 3000, 0], [Raddr, B, true, 3000, 0] ]] // final tokenOut = B, not AST
    );

    const poolAddr = await pool.getAddress();
    await ethers.provider.send("hardhat_impersonateAccount", [poolAddr]);
    await ethers.provider.send("hardhat_setBalance", [poolAddr, "0x" + ethers.parseEther("1").toString(16)]);
    const poolSigner = await ethers.getSigner(poolAddr);

    await expect(
      contract.connect(poolSigner).executeOperation(AST, AMOUNT, 0n, await contract.getAddress(), badParams)
    ).to.be.revertedWith("FlashLoanArbitrage: path must close to asset");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [poolAddr]);
  });

  it("reverts in the callback for a per-hop zero router (fail-closed re-check)", async function () {
    // A path that closes to asset but contains a zero router must still revert
    // inside executeOperation, proving the callback is self-contained.
    const { asset, tokenB, pool, contract } = await loadFixture(mockFixture);
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();

    const hopType = "tuple(address router,address tokenOut,bool isV3,uint24 fee,uint256 amountOutMin)[]";
    const badParams = ethers.AbiCoder.defaultAbiCoder().encode(
      [hopType],
      [[ [ethers.ZeroAddress, B, true, 3000, 0], [ethers.ZeroAddress, AST, true, 3000, 0] ]]
    );

    const poolAddr = await pool.getAddress();
    await ethers.provider.send("hardhat_impersonateAccount", [poolAddr]);
    await ethers.provider.send("hardhat_setBalance", [poolAddr, "0x" + ethers.parseEther("1").toString(16)]);
    const poolSigner = await ethers.getSigner(poolAddr);

    await expect(
      contract.connect(poolSigner).executeOperation(AST, AMOUNT, 0n, await contract.getAddress(), badParams)
    ).to.be.revertedWith("FlashLoanArbitrage: zero router");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [poolAddr]);
  });

  it("emits ArbitrageExecuted with the Aave initiator (address(this))", async function () {
    const { owner, asset, tokenB, router, contract } = await loadFixture(mockFixture);
    const R = await router.getAddress();
    const AST = await asset.getAddress();
    const B = await tokenB.getAddress();

    await router.setRate(AST, B, 2, 1);
    await router.setRate(B, AST, 6, 10);
    await tokenB.mint(R, 10_000_000n * UNIT);
    await asset.mint(R, 10_000_000n * UNIT);

    const hops = [
      hop(R, B,   { isV3: true, fee: 3000 }),
      hop(R, AST, { isV3: true, fee: 3000 }),
    ];

    const premium = (AMOUNT * 5n) / 10_000n;
    const expectedProfit = (AMOUNT * 12n) / 10n - (AMOUNT + premium);

    // initiator is the Aave flash-loan initiator == the contract itself (not tx.origin).
    await expect(contract.connect(owner).executeArbitrage(AST, AMOUNT, hops))
      .to.emit(contract, "ArbitrageExecuted")
      .withArgs(AST, AMOUNT, expectedProfit, await contract.getAddress());
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

  it("reverts an unprofitable 2-hop arbitrage (no spread → profit gate fails)", async function () {
    const { contract, owner } = await loadFixture(forkFixture);

    const USDC_WHALE = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
    await ethers.provider.send("hardhat_impersonateAccount", [USDC_WHALE]);
    await ethers.provider.send("hardhat_setBalance", [
      USDC_WHALE,
      "0x" + ethers.parseEther("10").toString(16),
    ]);

    // Both legs use the same V3 router / same pool → output < input after fees.
    const hops = [
      hop(UNISWAP_V3_ROUTER_ARB, WETH_ARB, { isV3: true, fee: 3000 }),
      hop(UNISWAP_V3_ROUTER_ARB, USDC_ARB, { isV3: true, fee: 3000 }),
    ];

    await expect(
      contract.connect(owner).executeArbitrage(
        USDC_ARB,
        ethers.parseUnits("1000", 6),
        hops
      )
    ).to.be.revertedWith("FlashLoanArbitrage: trade unprofitable");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [USDC_WHALE]);
  });

  it("supports a 3-hop path shape on fork (skipped without a curated spread block)", async function () {
    // A genuinely profitable USDC->WETH->ARB->USDC cycle requires pinning a block
    // with a real spread; left skipped so the fork suite stays green without a
    // curated fixture. The mock-integration suite covers the 3-hop execution path.
    void ARB_TOKEN;
    this.skip();
  });
});
