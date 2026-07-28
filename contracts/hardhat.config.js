require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY
  ? (process.env.DEPLOYER_PRIVATE_KEY.startsWith("0x")
      ? process.env.DEPLOYER_PRIVATE_KEY
      : "0x" + process.env.DEPLOYER_PRIVATE_KEY)
  : "0x" + "1".repeat(64); // dummy key so config loads without errors

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },

  networks: {
    // ── Mainnets ────────────────────────────────────────────────────────────
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      chainId: 1,
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: [PRIVATE_KEY],
      chainId: 8453,
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrage.io",
      accounts: [PRIVATE_KEY],
      chainId: 42161,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: [PRIVATE_KEY],
      chainId: 137,
    },

    // ── Local / Forked ───────────────────────────────────────────────────────
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // ── Hardhat in-process network (used by `npx hardhat test`) ─────────────
    hardhat: {
      // If FORK_RPC_URL is set, run against a live-state fork so Aave V3 /
      // Uniswap V3 pool contracts are available without local mocks.
      forking: process.env.FORK_RPC_URL
        ? {
            url: process.env.FORK_RPC_URL,
            blockNumber: process.env.FORK_BLOCK_NUMBER
              ? parseInt(process.env.FORK_BLOCK_NUMBER, 10)
              : undefined,
          }
        : undefined,
      chainId: 31337,
      // EDR needs an explicit hardfork history for OP-stack chains (e.g. Base
      // chainId 8453) when forking, otherwise eth_call at the fork block fails
      // with "No known hardfork for execution on historical block ...".
      chains: {
        8453: { hardforkHistory: { cancun: 0 } },
      },
    },
  },

  etherscan: {
    apiKey: {
      mainnet:        process.env.ETHERSCAN_API_KEY  || "",
      base:           process.env.BASESCAN_API_KEY   || "",
      arbitrumOne:    process.env.ARBISCAN_API_KEY   || "",
      polygon:        process.env.POLYGONSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL:     "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
