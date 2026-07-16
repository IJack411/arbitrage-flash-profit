# Rust MEV Scanner

Production-oriented Rust arbitrage scanner for the repository's `FlashLoanArbitrage` Solidity contract.

## Features
- Bellman-Ford negative-cycle arbitrage detection
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

## Environment
Set at least one RPC URL and the matching contract address for live execution.

## Contract integration
`FlashlightEncoder` encodes `executeArbitrage(address,uint256,address,address,address,bool,bool,uint24,uint24,uint256)` exactly as required by `FlashLoanArbitrage.sol`.
