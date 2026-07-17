// authorize-caller.js — owner helper to grant/revoke executeArbitrage caller permission
// Usage:
//   CONTRACT_ADDRESS=0x... CALLER_ADDRESS=0x... npm run authorize:mainnet
//   CONTRACT_ADDRESS=0x... CALLER_ADDRESS=0x... AUTHORIZED=false npm run authorize:base

const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const callerAddress = process.env.CALLER_ADDRESS;
  const authorizedRaw = String(process.env.AUTHORIZED || "true").toLowerCase();
  const authorized = !(authorizedRaw === "false" || authorizedRaw === "0" || authorizedRaw === "no");

  if (!contractAddress || !hre.ethers.isAddress(contractAddress)) {
    throw new Error("CONTRACT_ADDRESS is required and must be a valid EVM address.");
  }
  if (!callerAddress || !hre.ethers.isAddress(callerAddress)) {
    throw new Error("CALLER_ADDRESS is required and must be a valid EVM address.");
  }

  const [owner] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt("FlashLoanArbitrage", contractAddress, owner);

  const onchainOwner = await contract.owner();
  if (onchainOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(`Connected signer ${owner.address} is not contract owner ${onchainOwner}.`);
  }

  const alreadyAuthorized = await contract.authorizedCallers(callerAddress);
  if (alreadyAuthorized === authorized) {
    console.log(`No change needed. authorizedCallers(${callerAddress}) is already ${authorized}.`);
    return;
  }

  const tx = await contract.setAuthorizedCaller(callerAddress, authorized);
  console.log(`Submitted tx: ${tx.hash}`);
  const receipt = await tx.wait();

  const updated = await contract.authorizedCallers(callerAddress);
  console.log(`Confirmed in block ${receipt.blockNumber}: authorizedCallers(${callerAddress})=${updated}`);
}

main().catch((error) => {
  console.error("Authorization update failed:", error.message || error);
  process.exitCode = 1;
});
