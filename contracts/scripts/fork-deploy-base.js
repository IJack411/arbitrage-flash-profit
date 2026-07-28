// fork-deploy-base.js — Deploy FlashLoanArbitrage against a Base mainnet FORK.
//
// This is a DRY / fork-only proof. No real key, no real funds, nothing broadcast.
// It uses Hardhat's funded test signer against forked Base state so we can confirm
// the contract deploys and its constructor wires the *Base* Aave V3 pool.
//
// Usage:
//   FORK_RPC_URL=https://base-rpc.publicnode.com npx hardhat run scripts/fork-deploy-base.js
//
// The `hardhat` network forks FORK_RPC_URL (see hardhat.config.js).

const hre = require("hardhat");

// Base mainnet Aave V3 Pool (NOT the Ethereum mainnet pool).
const AAVE_V3_POOL_BASE = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";

async function main() {
  if (!process.env.FORK_RPC_URL) {
    throw new Error(
      "FORK_RPC_URL is not set. Set it to a Base RPC, e.g.\n" +
      "  $env:FORK_RPC_URL='https://base-rpc.publicnode.com'"
    );
  }

  const net = await hre.ethers.provider.getNetwork();
  const forkBlock = await hre.ethers.provider.getBlockNumber();

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  FlashLoanArbitrage — BASE FORK deploy proof");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Fork RPC:      ${process.env.FORK_RPC_URL}`);
  console.log(`  Fork block:    ${forkBlock}`);
  console.log(`  HH chainId:    ${net.chainId} (in-process fork)`);
  console.log(`  Deployer:      ${deployer.address} (Hardhat test acct)`);
  console.log(`  Balance:       ${hre.ethers.formatEther(balance)} ETH (test funds)`);
  console.log(`  Aave Pool:     ${AAVE_V3_POOL_BASE}`);
  console.log("═══════════════════════════════════════════════\n");

  // Sanity: confirm the Base Aave pool actually exists in the forked state.
  const poolCode = await hre.ethers.provider.getCode(AAVE_V3_POOL_BASE);
  if (poolCode === "0x") {
    throw new Error(
      "No contract code at the Base Aave pool address on this fork. " +
      "The RPC may not be forking Base state correctly."
    );
  }
  console.log(`✔ Base Aave V3 pool has code on the fork (${(poolCode.length - 2) / 2} bytes).`);

  const Factory = await hre.ethers.getContractFactory("FlashLoanArbitrage");
  const contract = await Factory.deploy(AAVE_V3_POOL_BASE);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  const wiredPool = await contract.POOL();
  const owner = await contract.owner();

  console.log("\n✅  Contract deployed on the Base fork!\n");
  console.log(`   FlashLoanArbitrage : ${address}`);
  console.log(`   POOL() wired to    : ${wiredPool}`);
  console.log(`   owner()            : ${owner}`);

  if (wiredPool.toLowerCase() !== AAVE_V3_POOL_BASE.toLowerCase()) {
    throw new Error("Constructor did NOT wire the Base Aave pool!");
  }
  console.log("\n✔ Constructor correctly wired the BASE Aave V3 pool.");
  console.log("✔ Fork-deploy proof PASSED (dry / no broadcast).\n");

  return address;
}

main().catch((err) => {
  console.error("\n❌  Fork deploy failed:", err.message || err);
  if (err.stack) console.error(err.stack);
  process.exitCode = 1;
});
