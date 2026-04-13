# Cross-Chain Arbitrage & Flashbots Integration

## Overview

This module enables cross-chain arbitrage detection and MEV-protected execution via Flashbots and other private transaction pools.

## Features

### Cross-Chain Arbitrage
- **Bridge Protocol Support**: Stargate Finance, Hop Protocol, Across Protocol
- **Multi-Chain Scanning**: Ethereum, Polygon, Arbitrum, BSC
- **Cost Estimation**: Bridge fees, gas costs, slippage calculation
- **Profit Analysis**: Net profit after all costs

### Flashbots MEV Protection
- **Bundle Simulation**: Test bundles before submission
- **Multi-Block Targeting**: Submit to multiple consecutive blocks
- **Status Tracking**: Monitor bundle inclusion
- **Profit/Loss Reporting**: Track execution results

## Bridge Configurations

```typescript
const BRIDGES = {
  stargate: { baseFee: 0.5, feePercent: 0.06, time: 5 },
  hop: { baseFee: 0.3, feePercent: 0.04, time: 10 },
  across: { baseFee: 0.2, feePercent: 0.05, time: 2 },
};
```

## Private Transaction Pools

| Network | Pool | Endpoint |
|---------|------|----------|
| Ethereum | Flashbots | relay.flashbots.net |
| Polygon | Bor | polygon-rpc.com |
| Arbitrum | Sequencer | arb1.arbitrum.io/rpc |
| BSC | Private | bsc-dataseed1.binance.org |

## API Usage

### Simulate Bundle
```typescript
await supabase.functions.invoke('flashbots-executor', {
  body: {
    action: 'simulate-bundle',
    network: 'ethereum',
    params: { transactions: ['0x...'] }
  }
});
```

### Submit Bundle
```typescript
await supabase.functions.invoke('flashbots-executor', {
  body: {
    action: 'submit-bundle',
    network: 'ethereum',
    params: {
      signedTransactions: ['0x...'],
      targetBlock: 18500000,
      maxBlockNumber: 18500003
    }
  }
});
```

### Monitor Bundle
```typescript
await supabase.functions.invoke('flashbots-executor', {
  body: {
    action: 'monitor-bundle',
    params: { bundleHash: '0x...', maxBlocks: 5 }
  }
});
```

## Slippage Calculation

```typescript
const slippage = (tradeAmount / liquidity) * 100;
const maxSlippage = Math.min(slippage, 5); // Cap at 5%
```

## Risk Considerations

1. **Bridge Delays**: Cross-chain transfers take 2-10 minutes
2. **Price Volatility**: Prices may change during bridge time
3. **Gas Spikes**: Network congestion affects profitability
4. **MEV Competition**: Other searchers may front-run
