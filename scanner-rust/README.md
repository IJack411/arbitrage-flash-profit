# MEV Scanner (Rust) — Quick Start

A high-performance Rust MEV arbitrage scanner that detects cross-DEX opportunities using Bellman-Ford and executes them via your deployed **FlashLoanArbitrage** Solidity contract and the Flashbots relay.

## Architecture Overview

```
The Graph / RPC
       │  pool prices
       ▼
  ┌─────────────┐
  │  scanner.rs │  Bellman-Ford negative-cycle detection
  └──────┬──────┘
         │ Opportunity
         ▼
  ┌─────────────────┐
  │  flashlight.rs  │  ABI-encode executeArbitrage calldata
  └────────┬────────┘
           │ Bytes calldata
           ▼
  ┌─────────────┐
  │ executor.rs │  Build + sign Flashbots bundle
  └──────┬──────┘
         │ POST /eth_sendBundle
         ▼
  Flashbots Relay ──► Ethereum / Arbitrum / Base / Polygon
         │
         ▼
  FlashLoanArbitrage.sol
   executeArbitrage(...)
   → Aave V3 flash loan
   → Swap A→B on DEX1
   → Swap B→A on DEX2
   → Repay loan + fee
   → Keep profit
```

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Rust | ≥ 1.78  | Install via [rustup](https://rustup.rs) |
| Docker | ≥ 24 | For containerised deployment |
| docker-compose | ≥ 2 | |

## Quick Start

### 1. Configure environment

```bash
cd scanner-rust
cp .env.example .env
# Edit .env — fill in required fields (see below)
```

**Required fields in `.env`:**

| Variable | Description |
|----------|-------------|
| `FLASHLIGHT_CONTRACT_ADDRESS` | Your deployed FlashLoanArbitrage contract |
| `SCANNER_PRIVATE_KEY` | Private key of the authorized caller wallet |
| `FLASHBOTS_SIGNER_PRIVATE_KEY` | Private key for Flashbots bundle signing |
| `ARBITRUM_RPC_URL` (or `ETHEREUM_RPC_URL`) | RPC endpoint for your target network |

### 2. Shadow mode first (recommended)

Leave `SCANNER_SHADOW_MODE=true` in `.env`. The scanner will detect and log opportunities without submitting any transactions. This is safe to run immediately.

### 3. Run with Cargo (development)

```bash
cd scanner-rust
cargo run --release
```

### 4. Run with Docker Compose (production-like)

```bash
cd scanner-rust
docker-compose up --build -d
```

Access:
- **Prometheus metrics**: http://localhost:9090/metrics
- **Prometheus UI**: http://localhost:9191
- **Grafana dashboards**: http://localhost:3001 (admin / admin)

## Configuration Reference

See [`.env.example`](.env.example) for all available environment variables with descriptions.

Key variables:

```env
# Networks to scan (comma-separated)
SCANNER_NETWORKS=arbitrum

# Shadow mode: true = detect only, false = live execution
SCANNER_SHADOW_MODE=true

# Minimum net profit to attempt execution (USD)
SCANNER_MIN_NET_PROFIT_USD=10

# Flash loan size per attempt (USD)
SCANNER_LOAN_AMOUNT_USD=10000

# Scan cycle frequency (ms)
SCANNER_POLL_INTERVAL_MS=5000
```

## Running Tests

```bash
cd scanner-rust
cargo test
```

Tests cover:
- Bellman-Ford cycle detection (balanced markets produce no cycles)
- Spread detection (mismatched prices produce cycles)
- Deterministic candidate ID generation (parity with TypeScript)
- Calldata ABI encoding and selector verification
- Configuration validation

## Live Mode

Once shadow-mode output looks correct:

1. Authorise your scanner wallet on-chain:
   ```solidity
   FlashLoanArbitrage.setAuthorizedCaller(SCANNER_WALLET, true)
   ```

2. Set `SCANNER_SHADOW_MODE=false` in `.env`

3. Restart the scanner

4. Monitor via Grafana or the Prometheus metrics endpoint

## Data Flow

1. Scanner polls pool prices every `SCANNER_POLL_INTERVAL_MS` ms
2. Bellman-Ford detects negative cycles (arbitrage opportunities)
3. Each opportunity is validated (spread, profit threshold, quote freshness)
4. `flashlight.rs` ABI-encodes the `executeArbitrage` calldata
5. `executor.rs` builds and signs a Flashbots EIP-1559 bundle
6. Bundle is submitted to the Flashbots relay
7. `FlashLoanArbitrage.sol` executes atomically on-chain
8. Results are logged and metrics updated

## Security Notes

- Never commit `.env` to git
- Use a dedicated wallet for `SCANNER_PRIVATE_KEY` with minimal ETH for gas
- Start on testnet, then move to mainnet with small capital
- Run in shadow mode alongside the TypeScript scanner first for A/B validation

## Troubleshooting

See [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).
