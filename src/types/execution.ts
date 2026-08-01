/**
 * CANONICAL EXECUTION PAYLOAD SCHEMA
 * 
 * This type defines the parameters for a 2-hop arbitrage execution.
 * 
 * NOTE (Phase 5): The on-chain contract `FlashLoanArbitrage.executeArbitrage` was
 * generalized to an arbitrary multi-hop `Hop[]` path
 * (`executeArbitrage(address asset, uint256 amount, Hop[] hops)`), where
 * `Hop = { router, tokenOut, isV3, fee, amountOutMin }`. This 2-hop payload maps
 * to a 2-element Hop[] (asset→tokenB via routerA, then tokenB→asset via routerB).
 * Generalizing this off-chain payload/pipeline to N-hop is deferred to a follow-up
 * (Phase 6 off-chain payload generalization); execution remains disabled here.
 * 
 * Maps to:
 * @see contracts/contracts/FlashLoanArbitrage.sol::executeArbitrage()
 * 
 * The (legacy 2-hop) parameter set is:
 * executeArbitrage(
 *   address asset,
 *   uint256 amount,
 *   address routerA,
 *   address routerB,
 *   address tokenB,
 *   bool routerAisV3,
 *   bool routerBisV3,
 *   uint24 feeA,
 *   uint24 feeB,
 *   uint256 amountBMin
 * )
 */

export interface ExecutionPayload {
  /**
   * The asset token to borrow from Aave V3 flash loan
   * e.g., USDC (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 on Ethereum mainnet)
   */
  asset: string; // EIP-55 checksummed address

  /**
   * Amount of asset to borrow, in token's native units (not wei)
   * e.g., 1000 USDC = "1000000000" (6 decimals)
   * Known to evaluateExecutionCandidate as executableLoanAmount
   */
  amount: string; // numeric string for uint256 compatibility

  /**
   * First DEX router contract address
   * Performs the initial swap: asset → tokenB at buyPrice
   * Examples:
   * - Uniswap V3 SwapRouter: 0xE592427A0AEce92De3Edee1F18E0157C05861564
   * - Uniswap V2 Router: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
   * - SushiSwap Router: 0xd9e1cE17f2641f24aE9d90c5c91B2DA78cED6f1a
   */
  routerA: string; // EIP-55 checksummed address

  /**
   * Second DEX router contract address
   * Performs the arbitrage swap: tokenB → asset at sellPrice
   * Must be different from routerA to create cross-DEX spread
   */
  routerB: string; // EIP-55 checksummed address

  /**
   * Intermediate token address (the spread token)
   * The token being arbitraged between two DEXes
   * e.g., WBTC, WETH, etc.
   */
  tokenB: string; // EIP-55 checksummed address

  /**
   * Whether routerA is Uniswap V3 style (true) or V2 style (false)
   * V3 requires feeA to be set; V2 ignores it
   */
  routerAisV3: boolean;

  /**
   * Whether routerB is Uniswap V3 style (true) or V2 style (false)
   * V3 requires feeB to be set; V2 ignores it
   */
  routerBisV3: boolean;

  /**
   * Uniswap V3 fee tier for routerA (ignored if routerAisV3 = false)
   * Valid values: 100, 500, 3000, 10000 (representing 0.01%, 0.05%, 0.30%, 1.00%)
   * Set to 0 if routerA is V2 style
   */
  feeA: number; // uint24

  /**
   * Uniswap V3 fee tier for routerB (ignored if routerBisV3 = false)
   * Valid values: 100, 500, 3000, 10000 (representing 0.01%, 0.05%, 0.30%, 1.00%)
   * Set to 0 if routerB is V2 style
   */
  feeB: number; // uint24

  /**
   * Minimum amount of tokenB to receive from the first swap (asset → tokenB)
   * Acts as slippage protection for the buy leg
   * Denominated in tokenB's native units
   * Calculated by scanner as: (expectBAmount * (1 - maxSlippagePercent))
   * Known to evaluateExecutionCandidate; scanner should include as safety margin
   */
  amountBMin: string; // numeric string for uint256 compatibility
}

/**
 * Extended payload with telemetry and provenance
 * Used internally to track where the payload came from and what the scanner predicted
 */
export interface ExecutionPayloadWithMetadata extends ExecutionPayload {
  /**
   * Internal scanner reference for this opportunity
   * Used to link execution results back to scan diagnostics
   */
  scanCandidateId: string;

  /**
   * Token pair symbol (e.g., "ETH/USDC")
   * For operational logging and UI display only
   */
  tokenPair: string;

  /**
   * DEX name for the buy leg (for operational logging)
   * e.g., "Uniswap V3", "SushiSwap", "Curve"
   */
  buyDex: 'Uniswap V3' | 'Uniswap V2' | 'SushiSwap' | 'Balancer' | 'Curve';

  /**
   * DEX name for the sell leg (for operational logging)
   */
  sellDex: 'Uniswap V3' | 'Uniswap V2' | 'SushiSwap' | 'Balancer' | 'Curve';

  /**
   * Network where execution will occur
   */
  network: 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'bsc';

  /**
   * Scanner's predicted gross profit (before gas and slippage costs)
   * In USD equivalent at time of scan
   */
  predictedGrossProfit: number;

  /**
   * Scanner's predicted net profit (after gas, slippage, and protocol fees)
   * In USD equivalent at time of scan
   */
  predictedNetProfit: number;

  /**
   * Scanner's estimated gas cost for this transaction
   */
  estimatedGasCost: number;

  /**
   * Combined slippage estimate (buy impact + sell impact + protocol penalties)
   * In basis points
   */
  estimatedSlippageBps: number;

  /**
   * Timestamp when scanner generated this payload
   * ISO 8601 format
   */
  scanTimestamp: string;

  /**
   * Confidence score from scanner (0-100)
   */
  confidenceScore: number;
}
