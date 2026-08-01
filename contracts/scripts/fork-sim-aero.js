// fork-sim-aero.js — Simulate the AERO/WETH round trip on a Base fork.
//
// The FlashLoanArbitrage contract CANNOT route Aerodrome (Solidly Route[] ABI),
// so per the task we simulate the two legs DIRECTLY against the forked routers at
// real execution sizes to confirm whether the buy-Aerodrome / sell-PancakeV3 lead
// nets a profit on real Base liquidity. Dry only — nothing broadcast.
//
// Usage: FORK_RPC_URL=https://mainnet.base.org npx hardhat run scripts/fork-sim-aero.js

const hre = require("hardhat");
const { ethers } = hre;

const WETH = "0x4200000000000000000000000000000000000006";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const AERODROME_ROUTER  = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da"; // volatile pool factory
const PANCAKE_V3_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";

const AAVE_PREMIUM_BPS = 5n; // Aave V3 flashLoanSimple premium = 0.05%

const WETH_ABI = [
  "function deposit() payable",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
const AERO_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
const AERO_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) returns (uint256[] amounts)",
];
const PANCAKE_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
];

async function simulate(signer, amountInWeth) {
  const weth = new ethers.Contract(WETH, WETH_ABI, signer);
  const aero = new ethers.Contract(AERO, AERO_ABI, signer);
  const aeroRouter = new ethers.Contract(AERODROME_ROUTER, AERO_ROUTER_ABI, signer);
  const pancake = new ethers.Contract(PANCAKE_V3_ROUTER, PANCAKE_ABI, signer);

  // Fund WETH by wrapping test ETH.
  await (await weth.deposit({ value: amountInWeth })).wait();
  const startWeth = await weth.balanceOf(signer.address);

  // ── Leg 1: BUY AERO on Aerodrome (WETH -> AERO) ──
  await (await weth.approve(AERODROME_ROUTER, amountInWeth)).wait();
  const routes = [{ from: WETH, to: AERO, stable: false, factory: AERODROME_FACTORY }];
  const deadline = (await ethers.provider.getBlock("latest")).timestamp + 600;
  await (await aeroRouter.swapExactTokensForTokens(amountInWeth, 0, routes, signer.address, deadline)).wait();
  const aeroGot = await aero.balanceOf(signer.address);

  // ── Leg 2: SELL AERO on PancakeSwap V3 @ 0.05% (AERO -> WETH) ──
  await (await aero.approve(PANCAKE_V3_ROUTER, aeroGot)).wait();
  await (await pancake.exactInputSingle({
    tokenIn: AERO, tokenOut: WETH, fee: 500, recipient: signer.address,
    deadline, amountIn: aeroGot, amountOutMinimum: 0, sqrtPriceLimitX96: 0,
  })).wait();
  const endWeth = await weth.balanceOf(signer.address);

  const wethBack = endWeth - (startWeth - amountInWeth);
  const gross = wethBack - amountInWeth;
  const premium = (amountInWeth * AAVE_PREMIUM_BPS) / 10_000n;
  const net = gross - premium;

  const f = (x) => ethers.formatEther(x);
  const pct = (num) => (Number(num * 1000000n / amountInWeth) / 10000).toFixed(4);

  console.log(`\n── size = ${f(amountInWeth)} WETH ──`);
  console.log(`  Leg1 Aerodrome:  ${f(amountInWeth)} WETH -> ${f(aeroGot)} AERO`);
  console.log(`  Leg2 PancakeV3:  ${f(aeroGot)} AERO -> ${f(wethBack)} WETH`);
  console.log(`  gross P/L:       ${f(gross)} WETH (${pct(gross)}%)`);
  console.log(`  Aave premium:    -${f(premium)} WETH (0.05%)`);
  console.log(`  NET P/L:         ${f(net)} WETH (${pct(net)}%)  => ${net > 0n ? "PROFIT ✅" : "LOSS ❌"}`);

  return net;
}

async function main() {
  await ethers.provider.send("evm_mine", []);
  console.log("Fork block:", await ethers.provider.getBlockNumber());
  console.log("Direction: BUY AERO on Aerodrome V1 (1% fee) -> SELL AERO on PancakeSwap V3 (0.05%)");

  for (const size of ["0.1", "0.5", "1", "2"]) {
    // fresh signer per size so balances stay clean
    const [s0, s1, s2, s3] = await ethers.getSigners();
    const signer = { "0.1": s0, "0.5": s1, "1": s2, "2": s3 }[size];
    try {
      await simulate(signer, ethers.parseEther(size));
    } catch (e) {
      console.log(`\n── size = ${size} WETH ──  FAILED: ${e.message}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
