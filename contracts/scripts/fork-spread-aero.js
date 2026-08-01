// fork-spread-aero.js — quantify the raw AERO/WETH mid-price spread and test the
// REVERSE direction, to explain WHY the lead's +0.83% does not survive real fees.
// Dry / read-mostly on a Base fork.
//
// Usage: FORK_RPC_URL=https://mainnet.base.org npx hardhat run scripts/fork-spread-aero.js

const hre = require("hardhat");
const { ethers } = hre;

const WETH = "0x4200000000000000000000000000000000000006";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const AERODROME_ROUTER  = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
const PANCAKE_QUOTER_V2  = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";

async function main() {
  await ethers.provider.send("evm_mine", []);
  const [s] = await ethers.getSigners();

  const aeroRouter = new ethers.Contract(AERODROME_ROUTER, [
    "function getAmountsOut(uint256,(address from,address to,bool stable,address factory)[]) view returns (uint256[])",
  ], s);
  const quoter = new ethers.Contract(PANCAKE_QUOTER_V2, [
    "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)",
  ], s);

  // Tiny size to approximate mid price (minimal slippage).
  const tiny = ethers.parseEther("0.001");
  const routeBuy = [{ from: WETH, to: AERO, stable: false, factory: AERODROME_FACTORY }];
  const aeroOut = (await aeroRouter.getAmountsOut(tiny, routeBuy))[1];
  const aeroPerWeth_Aero = Number(ethers.formatEther(aeroOut)) / 0.001; // AERO per WETH (incl 1% fee)

  // Pancake: quote AERO->WETH for the AERO we'd get, to get WETH per AERO (incl 0.05%)
  const q = await quoter.quoteExactInputSingle.staticCall({
    tokenIn: AERO, tokenOut: WETH, amountIn: aeroOut, fee: 500, sqrtPriceLimitX96: 0,
  });
  const wethBack = Number(ethers.formatEther(q[0]));

  console.log("Fork block:", await ethers.provider.getBlockNumber());
  console.log("\n── Effective prices at ~0.001 WETH (near-mid, fees included) ──");
  console.log(`  Aerodrome BUY : 1 WETH -> ${aeroPerWeth_Aero.toFixed(2)} AERO (1% fee)`);
  console.log(`  Pancake SELL  : ${Number(ethers.formatEther(aeroOut)).toFixed(4)} AERO -> ${wethBack.toFixed(8)} WETH (0.05% fee)`);
  const rt = wethBack / 0.001;
  console.log(`  Round trip    : 0.001 WETH -> ${(wethBack).toFixed(8)} WETH  => ${((rt-1)*100).toFixed(4)}% before Aave premium`);
  console.log(`  Conclusion    : gross round-trip is ${rt>1?"positive":"NEGATIVE"} even at near-zero size.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
