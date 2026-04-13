// MEV Protection Types

export interface SandwichAttack {
  id: string;
  frontrunTx: MempoolTx;
  victimTx: MempoolTx;
  backrunTx: MempoolTx;
  attackerAddress: string;
  estimatedProfit: number;
  targetToken: string;
  targetDex: string;
  detectedAt: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'detected' | 'confirmed' | 'executed' | 'failed';
}

export interface MempoolTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasPrice: number;
  maxPriorityFee: number;
  maxFeePerGas: number;
  nonce: number;
  data: string;
  timestamp: number;
  methodId: string;
  decodedMethod?: string;
}

export interface SimulationResult {
  success: boolean;
  gasUsed: number;
  effectiveGasPrice: number;
  returnValue: string;
  revertReason?: string;
  logs: SimulationLog[];
  stateChanges: StateChange[];
  profitEstimate: number;
  slippageImpact: number;
}

export interface SimulationLog {
  address: string;
  topics: string[];
  data: string;
  decoded?: { name: string; args: Record<string, unknown> };
}

export interface StateChange {
  address: string;
  slot: string;
  before: string;
  after: string;
}

export interface SlippageConfig {
  maxSlippage: number;
  dynamicSlippage: boolean;
  volatilityAdjustment: boolean;
  minOutput: number;
  deadline: number;
}

export interface ProtectionConfig {
  enabled: boolean;
  useFlashbotsProtect: boolean;
  privateMempool: boolean;
  maxGasPrice: number;
  sandwichDetection: boolean;
  frontrunProtection: boolean;
  backrunProtection: boolean;
  slippage: SlippageConfig;
}

export interface MempoolStats {
  pendingTxCount: number;
  avgGasPrice: number;
  highPriorityCount: number;
  suspiciousTxCount: number;
  lastBlockTxs: number;
  congestionLevel: 'low' | 'medium' | 'high' | 'extreme';
}
