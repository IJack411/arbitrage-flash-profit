// probe-base.js — read-only fork probe: verify routers, pools, factories exist
// and pull quotes for the AERO/WETH legs.
//
// Usage: FORK_RPC_URL=https://mainnet.base.org npx hardhat run scripts/probe-base.js

const hre = require("hardhat");
const { ethers } = hre;

const WETH = "0x4200000000000000000000000000000000000006";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";

const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERODROME_POOL   = "0x7f670f78B17dEC44d5Ef68a48740b6f8849cc2e6";

// Candidate PancakeSwap V3 addresses on Base
const PANCAKE_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const PANCAKE_V3_ROUTER  = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const PANCAKE_QUOTER_V2  = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";

async function codeSize(addr) {
  const c = await ethers.provider.getCode(addr);
  return (c.length - 2) / 2;
}

async function main() {
  // Mine one local block so "latest" is a post-fork Hardhat block; this avoids
  // EDR's historical-hardfork lookup for OP-stack Base at the exact fork block.
  await ethers.provider.send("evm_mine", []);
  console.log("Fork block:", await ethers.provider.getBlockNumber());

  console.log("\n── Code presence ──");
  for (const [name, addr] of [
    ["WETH", WETH], ["AERO", AERO],
    ["Aerodrome Router", AERODROME_ROUTER],
    ["Aerodrome Pool", AERODROME_POOL],
    ["Pancake V3 Factory", PANCAKE_V3_FACTORY],
    ["Pancake V3 Router", PANCAKE_V3_ROUTER],
    ["Pancake Quoter V2", PANCAKE_QUOTER_V2],
  ]) {
    console.log(`  ${name.padEnd(20)} ${addr}  code=${await codeSize(addr)}B`);
  }

  // ── Aerodrome pool metadata ──
  console.log("\n── Aerodrome pool ──");
  const pool = await ethers.getContractAt([
    "function factory() view returns (address)",
    "function stable() view returns (bool)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint256,uint256,uint256)",
  ], AERODROME_POOL);
  const factory = await pool.factory();
  const stable = await pool.stable();
  const t0 = await pool.token0();
  const t1 = await pool.token1();
  console.log("  factory:", factory);
  console.log("  stable :", stable);
  console.log("  token0 :", t0, t0.toLowerCase()===WETH.toLowerCase()?"(WETH)":t0.toLowerCase()===AERO.toLowerCase()?"(AERO)":"");
  console.log("  token1 :", t1, t1.toLowerCase()===WETH.toLowerCase()?"(WETH)":t1.toLowerCase()===AERO.toLowerCase()?"(AERO)":"");
  const res = await pool.getReserves();
  console.log("  reserves:", res[0].toString(), res[1].toString());

  // ── Aerodrome quote: 1 WETH -> AERO (buy AERO) ──
  console.log("\n── Aerodrome quote (Solidly getAmountsOut with Route[]) ──");
  const aeroRouter = await ethers.getContractAt([
    "function getAmountsOut(uint256 amountIn, (address from,address to,bool stable,address factory)[] routes) view returns (uint256[] amounts)",
  ], AERODROME_ROUTER);
  const amountIn = ethers.parseEther("1");
  const routes = [{ from: WETH, to: AERO, stable: false, factory }];
  try {
    const outs = await aeroRouter.getAmountsOut(amountIn, routes);
    console.log("  1 WETH ->", ethers.formatEther(outs[outs.length-1]), "AERO");
  } catch (e) {
    console.log("  getAmountsOut FAILED:", e.message);
  }

  // ── Pancake V3 pool + quote AERO -> WETH @ 0.05% ──
  console.log("\n── Pancake V3 pool (AERO/WETH @ 500) ──");
  const pf = await ethers.getContractAt([
    "function getPool(address,address,uint24) view returns (address)",
  ], PANCAKE_V3_FACTORY);
  const pv3pool = await pf.getPool(AERO, WETH, 500);
  console.log("  pool(500):", pv3pool, "code=", pv3pool==ethers.ZeroAddress?0:await codeSize(pv3pool),"B");
  for (const fee of [100, 500, 2500, 10000]) {
    const p = await pf.getPool(AERO, WETH, fee);
    console.log(`  fee ${fee}: ${p}`);
  }

  // Quote via QuoterV2 (need an AERO amount ~ output of leg1)
  console.log("\n── Pancake QuoterV2 (AERO -> WETH @ 500) ──");
  const quoter = await ethers.getContractAt([
    "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)",
  ], PANCAKE_QUOTER_V2);
  try {
    const aeroAmt = ethers.parseEther("1000");
    const q = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: AERO, tokenOut: WETH, amountIn: aeroAmt, fee: 500, sqrtPriceLimitX96: 0,
    });
    console.log("  1000 AERO ->", ethers.formatEther(q[0]), "WETH");
  } catch (e) {
    console.log("  Quoter FAILED:", e.message);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
