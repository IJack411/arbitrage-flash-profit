// deploy.js — FlashLoanArbitrage deployment script
// Usage: npm run deploy:<network>  (see package.json scripts)

const hre = require("hardhat");

// ── Aave V3 Pool addresses per network ─────────────────────────────────────────
// These are the official Aave V3 lending pool proxy addresses.
// DO NOT change these — they are Aave's contracts, not yours.
const AAVE_V3_POOLS = {
  mainnet:   "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  base:      "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  arbitrum:  "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  polygon:   "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  localhost: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", // used in mainnet fork
};

async function main() {
  const networkName = hre.network.name;
  const poolAddress = AAVE_V3_POOLS[networkName];

  if (!poolAddress) {
    throw new Error(
      `No Aave V3 pool configured for network "${networkName}".\n` +
      `Add it to AAVE_V3_POOLS in scripts/deploy.js.`
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  FlashLoanArbitrage Deployment");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Network:   ${networkName}`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Balance:   ${hre.ethers.formatEther(balance)} ETH`);
  console.log(`  Aave Pool: ${poolAddress}`);
  console.log("═══════════════════════════════════════════════\n");

  const minBalance = networkName === "mainnet" ? 0.05 : 0.005;
  if (parseFloat(hre.ethers.formatEther(balance)) < minBalance && networkName !== "localhost") {
    throw new Error(`Deployer wallet balance is too low. Fund it with at least ${minBalance} ETH for gas.`);
  }

  const Factory = await hre.ethers.getContractFactory("FlashLoanArbitrage");
  const contract = await Factory.deploy(poolAddress);
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log("✅  Contract deployed successfully!\n");
  console.log(`   FlashLoanArbitrage : ${address}`);
  console.log(`   Aave V3 Pool used  : ${poolAddress}`);
  console.log(`   Network            : ${networkName}`);
  console.log(`   Deployer (owner)   : ${deployer.address}`);

  console.log("\n───────────────────────────────────────────────");
  console.log("  Copy these values into your ROOT .env file:");
  console.log("───────────────────────────────────────────────");
  console.log(`VITE_ARBITRAGE_CONTRACT_ADDRESS=${address}`);
  console.log(`VITE_FLASH_LOAN_PROVIDER_ADDRESS=${poolAddress}`);
  console.log("───────────────────────────────────────────────\n");

  // ── Verify on block explorer (skip local) ────────────────────────────────
  if (networkName !== "localhost" && process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting for 5 block confirmations before verification...");
    const deployTx = contract.deploymentTransaction();
    if (deployTx) await deployTx.wait(5);

    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: [poolAddress],
      });
      console.log("✅  Contract verified on block explorer!");
    } catch (err) {
      console.warn("⚠️  Verification failed (you can retry manually):", err.message);
    }
  }

  return address;
}

main().catch((err) => {
  console.error("\n❌  Deployment failed:", err.message || err);
  if (err.stack) console.error(err.stack);
  process.exitCode = 1;
});
