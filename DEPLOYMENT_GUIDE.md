# Arbitrage Bot System Architecture & Deployment Guide

## 1. How the System Works

This Arbitrage Bot is designed to find price differences between Decentralized Exchanges (DEXs) like Uniswap and Sushiswap, and execute profitable trades securely.

### The Workflow:
1.  **Scanning (The Eyes)**:
    *   The **Frontend** (or `scan` function) queries the blockchain for the current price of a token pair (e.g., WETH/USDT) on multiple DEXs simultaneously.
    *   It calculates the **Spread** (Price Difference).
    *   If `Spread > Profit Threshold`, it flags an **Opportunity**.

2.  **Execution (The Hands)**:
    *   When you click **"Execute"** (or Auto-Pilot triggers), the frontend sends the trade details to your secure **Backend** (Supabase Edge Function).
    *   It does **NOT** send the transaction directly to the public mempool (where it could be stolen/front-run).

3.  **Protection (The Shield - Flashbots)**:
    *   The Backend (`flashbots-executor`) wraps your transaction into a **Flashbots Bundle**.
    *   It simulates the trade to ensure it's profitable.
    *   It sends the bundle directly to miners/validators via a private relay.
    *   **Benefit**: If the trade fails (e.g., price moved), the transaction is never mined, and **you pay $0 in gas**.

## 2. Prerequisites

Before you can run this with real money, you need:

1.  **Dedicated Wallet**: Create a NEW MetaMask wallet. Do not use your main vault.
2.  **Funds**:
    *   **ETH**: For gas fees (start with ~0.05 - 0.1 ETH).
    *   **WETH/USDT**: Capital to trade with (unless using Flash Loans).
3.  **RPC Provider**: A fast connection to the blockchain (Alchemy, Infura, or QuickNode). Public nodes are too slow for arbitrage.
4.  **Supabase Project**: To host the secure backend logic.

## 3. Steps to Proceed

### Step 1: Configure Supabase (The Backend)
You need to set environment variables so the backend can sign transactions.

1.  Go to your Supabase Project Settings -> Edge Functions -> Secrets.
2.  Add the following secrets:
    *   `PRIVATE_KEY`: The private key of your trading wallet (Export from MetaMask).
    *   `FLASHBOTS_RELAY_SIGNING_KEY`: A *new, random* private key used just for Flashbots authentication (does not need funds).
    *   `ETHEREUM_RPC_URL`: Your Alchemy/Infura HTTPS URL (e.g., `https://eth-mainnet.g.alchemy.com/v2/...`).

### Step 2: Deploy Edge Functions
You need to push the code I wrote to the cloud.

1.  Install Supabase CLI if you haven't.
2.  Login:
    ```bash
    npx supabase login
    ```
3.  Deploy the executor:
    ```bash
    npx supabase functions deploy flashbots-executor --no-verify-jwt
    ```

### Step 3: Run the Frontend
1.  Start the app locally (`npm run dev`) or deploy to Vercel.
2.  Connect your wallet.
3.  Go to **Live Trading**.
4.  Set your "Min Profit" low ($1-$5) for testing.
5.  **Start Scanning**.

### Step 4: Verify
*   Watch the logs in your Supabase Dashboard.
*   When an opportunity is found and executed, check Etherscan.
*   A successful Flashbots bundle will appear as a normal transaction but will not have been seen in the pending pool.

## ⚠️ Risks
*   **Market Risk**: Prices change in milliseconds. A profitable trade can fail if someone else executes it first.
*   **Bad Config**: If `PRIVATE_KEY` is wrong, trades will fail.
*   **Approve Tokens**: Ensure your wallet has "Approved" the router contracts (Uniswap/Sushi) to spend your WETH/USDT.
