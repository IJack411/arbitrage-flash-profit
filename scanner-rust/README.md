# Rust MEV Scanner

Production-oriented Rust arbitrage scanner for the repository's `FlashLoanArbitrage` Solidity contract.

## Features
- Bellman-Ford negative-cycle arbitrage detection
- Fee-aware edge weights (`-ln(price * (1 - fee))`) net of every per-hop DEX swap fee
- Live Arbitrum multi-DEX pool data feed (Uniswap V3 + SushiSwap) — Phase 3
- Canonical opportunity payloads matching the TypeScript contract
- Local `revm` simulation before execution
- Flashbots bundle submission flow
- Prometheus metrics and optional Supabase telemetry

## Quick start
```bash
cp .env.example .env
cargo build
cargo test
cargo run
```

## Live Arbitrum pool feed (Phase 3)
`scanner.fetch_pools()` pulls REAL, current pool state from Arbitrum mainnet:

- **Venues / fee tiers:** Uniswap V3 (500 / 3000 / 10000 ppm) and SushiSwap
  (UniswapV2-style, 3000 ppm), pools discovered via factory `getPool`/`getPair`.
- **Tokens:** WETH, USDC (native), USDC.e, USDT, ARB, WBTC, GMX, PENDLE, MAGIC,
  RDNT, DAI (canonical, verified Arbitrum addresses).
- **Prices:** Uniswap V3 from `slot0().sqrtPriceX96`
  (`(sqrt/2^96)^2 * 10^(dec0-dec1)`); V2 from `getReserves()`
  (`reserve1/reserve0 * 10^(dec0-dec1)`). Both directions are emitted with the
  correct per-direction price and the pool's fee.
- **Decimals:** USDC/USDC.e/USDT = 6, WBTC = 8, others = 18. A wrong decimal
  factor manufactures fake spreads, so implausible prices are logged and skipped.
- **Liquidity guard:** on-chain `balanceOf` reserves are valued in USD (stables
  anchored at $1, other tokens derived from the observed graph) and pools below
  `SCANNER_MIN_POOL_LIQUIDITY_USD` (default $5000) are skipped as dust.
- **RPC resilience:** batched `eth_call`s, a request timeout, retries with
  backoff, and modest sequential chunking for rate-limited free tiers.

Run a detection-only live dry run (no execution, no broadcast):
```bash
# key is read from the environment; it is never hardcoded or printed
export ALCHEMY_API_KEY=...   # or SCANNER_RPC_URL=https://...
cargo run --example live_dry_run
```

## Environment
Set at least one RPC URL and the matching contract address for live execution.
For the Arbitrum pool feed set one of `SCANNER_RPC_URL`, `ARBITRUM_RPC_URL`, or
`ALCHEMY_API_KEY` / `VITE_ALCHEMY_API_KEY` (see `.env.example`).

## Contract integration
`FlashlightEncoder` encodes `executeArbitrage(address,uint256,address,address,address,bool,bool,uint24,uint24,uint256)` exactly as required by `FlashLoanArbitrage.sol`.
