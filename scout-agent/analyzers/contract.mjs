// Contract performance analyzer — read-only on-chain monitoring
import { ethers } from 'ethers';

const ARB_ABI = [
  'event ArbitrageExecuted(address indexed asset, uint256 loanAmount, uint256 profit, address indexed initiator)',
  'event CallerUpdated(address indexed caller, bool authorized)',
  'event SlippageUpdated(uint256 bps)',
  'function maxSlippageBps() view returns (uint256)',
  'function owner() view returns (address)',
  'function authorizedCallers(address) view returns (bool)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// Common tokens to check balances for
const TOKENS = {
  WETH:  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC:  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT:  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI:   '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  WBTC:  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
};

export async function analyzeContract(provider, contractAddress) {
  const contract = new ethers.Contract(contractAddress, ARB_ABI, provider);
  const findings = [];

  // 1. Check contract balances (accumulated profit)
  const balances = {};
  for (const [symbol, addr] of Object.entries(TOKENS)) {
    try {
      const token = new ethers.Contract(addr, ERC20_ABI, provider);
      const [bal, decimals] = await Promise.all([
        token.balanceOf(contractAddress),
        token.decimals(),
      ]);
      const formatted = parseFloat(ethers.formatUnits(bal, decimals));
      if (formatted > 0) balances[symbol] = formatted;
    } catch { /* token may not exist or contract may revert */ }
  }

  // Check ETH balance too
  const ethBal = parseFloat(ethers.formatEther(await provider.getBalance(contractAddress)));
  if (ethBal > 0) balances['ETH'] = ethBal;

  if (Object.keys(balances).length > 0) {
    findings.push({
      type: 'balance_report',
      severity: 'info',
      title: 'Contract Token Balances',
      detail: Object.entries(balances).map(([s, b]) => `${s}: ${b.toFixed(6)}`).join(', '),
      action: null,
    });
  }

  // 2. Check current slippage config
  try {
    const slippage = Number(await contract.maxSlippageBps());
    if (slippage > 500) {
      findings.push({
        type: 'config_issue',
        severity: 'warning',
        title: 'High Slippage Tolerance',
        detail: `maxSlippageBps is ${slippage} (${slippage / 100}%). Values above 5% increase sandwich attack risk.`,
        action: `Consider calling setMaxSlippage(200) to reduce to 2%.`,
      });
    } else if (slippage < 50) {
      findings.push({
        type: 'config_issue',
        severity: 'warning',
        title: 'Very Tight Slippage',
        detail: `maxSlippageBps is ${slippage} (${slippage / 100}%). This may cause excessive reverts during volatility.`,
        action: `Consider setMaxSlippage(150) for 1.5% to balance safety and execution.`,
      });
    }
  } catch { /* may fail if contract doesn't expose this */ }

  // 3. Analyze recent ArbitrageExecuted events (last ~2000 blocks ≈ 7 hours)
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 2000);
  try {
    const events = await contract.queryFilter('ArbitrageExecuted', fromBlock, currentBlock);
    if (events.length > 0) {
      let totalProfit = 0n;
      let totalLoaned = 0n;
      const assetSet = new Set();
      for (const e of events) {
        totalProfit += e.args.profit;
        totalLoaned += e.args.loanAmount;
        assetSet.add(e.args.asset);
      }
      findings.push({
        type: 'performance',
        severity: 'info',
        title: `Recent Activity: ${events.length} trades in last ~7h`,
        detail: `Total profit: ${ethers.formatEther(totalProfit)} (raw units). Assets: ${[...assetSet].join(', ')}`,
        action: null,
      });
    } else {
      findings.push({
        type: 'performance',
        severity: 'info',
        title: 'No trades in last ~7 hours',
        detail: 'Contract has been idle. This is normal during low-spread periods.',
        action: null,
      });
    }
  } catch {
    findings.push({
      type: 'error',
      severity: 'info',
      title: 'Could not query recent events',
      detail: 'Event log query failed — RPC may limit historical lookups.',
      action: null,
    });
  }

  return findings;
}
