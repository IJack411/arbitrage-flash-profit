import { ethers } from 'npm:ethers@6.7.0';
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from 'npm:@flashbots/ethers-provider-bundle@1.0.0';
import {
  classifySimulationGate,
  OPPORTUNITY_REASON_CODES,
  validateOpportunityParity,
  type CanonicalOpportunity,
} from '../_shared/opportunity-contract.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const canPersistTelemetry = () => Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const persistExecutionAttempt = async (row: Record<string, unknown>) => {
  if (!canPersistTelemetry()) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/execution_attempts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([row]),
    });
  } catch (error) {
    console.warn('Failed to persist execution telemetry:', error);
  }
};

const updateExecutionAttemptByBundleHash = async (
  bundleHash: string,
  patch: Record<string, unknown>,
) => {
  if (!canPersistTelemetry() || !bundleHash) return;
  try {
    const query = new URLSearchParams({ bundle_hash: `eq.${bundleHash}` });
    await fetch(`${SUPABASE_URL}/rest/v1/execution_attempts?${query.toString()}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    });
  } catch (error) {
    console.warn('Failed to update execution attempt telemetry:', error);
  }
};

const listPersistedExecutionAttempts = async (limit: number) => {
  if (!canPersistTelemetry()) return [];
  try {
    const query = new URLSearchParams({
      select: 'id,scan_run_id,candidate_id,bundle_hash,target_block,included,failure_reason,submitted_at,latency_ms,metadata',
      order: 'submitted_at.desc',
      limit: String(limit),
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/execution_attempts?${query.toString()}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) return [];
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn('Failed to list execution attempts:', error);
    return [];
  }
};

const txHashFromSignedTx = (signedTx?: string): string | null => {
  if (!signedTx || typeof signedTx !== 'string' || !signedTx.startsWith('0x')) return null;
  try {
    return ethers.keccak256(signedTx);
  } catch {
    return null;
  }
};

const isAddress = (value: unknown): value is string => {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
};

const toBigIntSafe = (value: unknown): bigint | null => {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return BigInt(Math.floor(value));
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    return null;
  } catch {
    return null;
  }
};

const toBooleanSafe = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const readPolicyNumber = (key: string, fallback: number, min?: number, max?: number): number => {
  const parsed = Number(Deno.env.get(key));
  let value = Number.isFinite(parsed) ? parsed : fallback;
  if (typeof min === 'number' && value < min) value = min;
  if (typeof max === 'number' && value > max) value = max;
  return value;
};

const EXEC_POLICY_MIN_NET_PROFIT_USD = readPolicyNumber('EXEC_MIN_NET_PROFIT_USD', 15, 0);
const EXEC_POLICY_MAX_GAS_TO_NET_RATIO = readPolicyNumber('EXEC_MAX_GAS_TO_NET_RATIO', 0.6, 0.05, 5);
const EXEC_POLICY_MIN_CONFIDENCE_SCORE = Math.round(readPolicyNumber('EXEC_MIN_CONFIDENCE_SCORE', 35, 0, 100));
const EXEC_POLICY_MAX_QUOTE_AGE_MS = Math.max(10_000, Math.round(readPolicyNumber('EXEC_MAX_QUOTE_AGE_MS', 90_000, 10_000, 900_000)));

const loadScannerCandidateBoundary = async (candidateId: string) => {
  if (!canPersistTelemetry() || !candidateId) return null;
  try {
    const query = new URLSearchParams({
      select: 'id,scan_run_id,status',
      id: `eq.${candidateId}`,
      limit: '1',
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/scanner_candidates?${query.toString()}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    const rows = await response.json() as Array<Record<string, unknown>>;
    return rows[0] || null;
  } catch {
    return null;
  }
};

const estimateActualGasUsd = (
  receipt: ethers.TransactionReceipt | null,
  network: string,
): number | null => {
  if (!receipt) return null;
  const nativeUsdPrice = network === 'base'
    ? readPolicyNumber('EXEC_NATIVE_TOKEN_USD_BASE', readPolicyNumber('EXEC_NATIVE_TOKEN_USD_ETHEREUM', 3500, 1), 1)
    : readPolicyNumber('EXEC_NATIVE_TOKEN_USD_ETHEREUM', 3500, 1);
  const gasUsed = receipt.gasUsed;
  const gasPrice = receipt.gasPrice ?? receipt.effectiveGasPrice;
  if (gasUsed === null || gasUsed === undefined || gasPrice === null || gasPrice === undefined) return null;
  const weiSpent = gasUsed * gasPrice;
  const nativeSpent = Number(ethers.formatEther(weiSpent));
  if (!Number.isFinite(nativeSpent)) return null;
  return nativeSpent * nativeUsdPrice;
};

const estimateRealizedNetProfitUsd = ({
  predictedNetProfitUsd,
  predictedGasCostUsd,
  receipt,
  network,
}: {
  predictedNetProfitUsd: number;
  predictedGasCostUsd: number;
  receipt: ethers.TransactionReceipt | null;
  network: string;
}): number | null => {
  const actualGasUsd = estimateActualGasUsd(receipt, network);
  if (actualGasUsd === null) return null;
  return predictedNetProfitUsd + predictedGasCostUsd - actualGasUsd;
};

const parseExecutionPayload = (opportunity: Record<string, unknown> | undefined) => {
  const rawPayload = opportunity?.executionPayload;
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const payload = rawPayload as Record<string, unknown>;

  const asset = payload.asset;
  const amount = toBigIntSafe(payload.amount);
  const routerA = payload.routerA;
  const routerB = payload.routerB;
  const tokenB = payload.tokenB;
  const routerAisV3 = toBooleanSafe(payload.routerAisV3);
  const routerBisV3 = toBooleanSafe(payload.routerBisV3);
  const feeA = toNumberSafe(payload.feeA, 0);
  const feeB = toNumberSafe(payload.feeB, 0);
  const amountBMin = toBigIntSafe(payload.amountBMin);
  const network = typeof payload.network === 'string' ? payload.network.toLowerCase() : null;

  if (!isAddress(asset) || !isAddress(routerA) || !isAddress(routerB) || !isAddress(tokenB)) return null;
  if (amount === null || amountBMin === null) return null;

  return {
    network,
    args: [asset, amount, routerA, routerB, tokenB, routerAisV3, routerBisV3, feeA, feeB, amountBMin] as const,
  };
};

// ABI aligned with contracts/contracts/FlashLoanArbitrage.sol
const ARB_ABI = [
  'function executeArbitrage(address asset, uint256 amount, address routerA, address routerB, address tokenB, bool routerAisV3, bool routerBisV3, uint24 feeA, uint24 feeB, uint256 amountBMin)',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, params = {} } = await req.json().catch(() => ({}));

    if (action === 'simulate-bundle') {
      const transactions = Array.isArray(params.transactions) ? params.transactions : [];
      const firstTx = transactions[0];
      if (typeof firstTx !== 'string' || !firstTx.startsWith('0x')) {
        return new Response(
          JSON.stringify({
            success: false,
            simulation: {
              success: false,
              totalGasUsed: '0',
              estimatedProfitUsd: 0,
              blockNumber: params.blockNumber ?? null,
            },
            error: 'A signed transaction hex is required for simulation',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const provider = new ethers.JsonRpcProvider(Deno.env.get('ETHEREUM_RPC_URL') || 'https://rpc.ankr.com/eth');
      const authSigner = new ethers.Wallet(Deno.env.get('FLASHBOTS_RELAY_SIGNING_KEY') || ethers.Wallet.createRandom().privateKey);
      const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner);
      const nextBlock = (await provider.getBlockNumber()) + 1;

      try {
        const simulation = await flashbotsProvider.simulate(transactions as string[], nextBlock);
        return new Response(
          JSON.stringify({
            success: true,
            simulation: {
              success: !('error' in simulation),
              blockNumber: nextBlock,
              result: simulation,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (simulationError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: simulationError instanceof Error ? simulationError.message : 'Simulation failed',
            simulation: {
              success: false,
              blockNumber: nextBlock,
            },
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    if (action === 'list-bundles') {
      const limit = Math.max(1, Math.min(200, Number(params.limit ?? 50)));
      const persisted = await listPersistedExecutionAttempts(limit);
      return new Response(
        JSON.stringify({
          success: true,
          bundles: persisted,
          message: canPersistTelemetry()
            ? `Returned ${persisted.length} persisted execution attempt(s)`
            : 'No bundle persistence backend configured',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'execute-arbitrage' || action === 'submit-bundle') {
      const {
        walletAddress,
        contractAddress,
        opportunity,
        scanRunId,
        candidateId,
      } = params;
      const resolvedScanRunId = scanRunId || opportunity?.scanRunId || null;
      const resolvedCandidateId = candidateId || opportunity?.candidateId || null;
      const executionAttemptId = crypto.randomUUID();
      const startedAt = Date.now();

      if (!contractAddress) {
        const failureReason = 'validation_missing_contract';
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: failureReason,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: { walletAddress: walletAddress || null, action, error: 'contractAddress is required to execute arbitrage' },
        });
        throw new Error('contractAddress is required to execute arbitrage');
      }

      const opportunityValidation = validateOpportunityParity(opportunity, {
        maxQuoteAgeMs: EXEC_POLICY_MAX_QUOTE_AGE_MS,
      });
      if (!opportunityValidation.ok) {
        const failureReason = opportunityValidation.errors.includes(OPPORTUNITY_REASON_CODES.executionQuoteStale)
          ? OPPORTUNITY_REASON_CODES.executionQuoteStale
          : opportunityValidation.errors.includes(OPPORTUNITY_REASON_CODES.executionParityMismatch)
            ? OPPORTUNITY_REASON_CODES.executionParityMismatch
            : OPPORTUNITY_REASON_CODES.executionBoundaryInvalid;
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: failureReason,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: {
            walletAddress: walletAddress || null,
            action,
            validationErrors: opportunityValidation.errors,
          },
        });
        throw new Error(`Opportunity boundary validation failed: ${opportunityValidation.errors.join(', ')}`);
      }

      const canonicalOpportunity = opportunityValidation.value;
      if (canonicalOpportunity.status !== 'active') {
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: OPPORTUNITY_REASON_CODES.executionBoundaryInvalid,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: {
            walletAddress: walletAddress || null,
            action,
            status: canonicalOpportunity.status,
            reasonCode: canonicalOpportunity.reasonCode,
          },
        });
        throw new Error(`Only active opportunities may be executed (received ${canonicalOpportunity.status})`);
      }

      const candidateBoundary = canPersistTelemetry() && resolvedCandidateId
        ? await loadScannerCandidateBoundary(String(resolvedCandidateId))
        : { id: resolvedCandidateId, scan_run_id: resolvedScanRunId, status: 'active' };
      if (canPersistTelemetry() && (!candidateBoundary || candidateBoundary.scan_run_id !== resolvedScanRunId || candidateBoundary.status !== 'active')) {
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: OPPORTUNITY_REASON_CODES.executionBoundaryInvalid,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: {
            walletAddress: walletAddress || null,
            action,
            candidateBoundary,
          },
        });
        throw new Error('Candidate boundary check failed: scanner candidate is missing, inactive, or mismatched');
      }

      const requestedNetwork = String(canonicalOpportunity.executionPayload?.network ?? canonicalOpportunity.network ?? 'ethereum').toLowerCase();
      const SUPPORTED_EXEC_NETWORKS = new Set(['ethereum', 'base']);
      if (!SUPPORTED_EXEC_NETWORKS.has(requestedNetwork)) {
        const failureReason = 'unsupported_network';
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: failureReason,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: { walletAddress: walletAddress || null, action, requestedNetwork },
        });
        throw new Error(`Unsupported network for execution: ${requestedNetwork}`);
      }

      const isBaseNetwork = requestedNetwork === 'base';
      const rpcUrl = isBaseNetwork
        ? (Deno.env.get('BASE_RPC_URL') || 'https://mainnet.base.org')
        : (Deno.env.get('ETHEREUM_RPC_URL') || 'https://rpc.ankr.com/eth');
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const authSigner = new ethers.Wallet(Deno.env.get('FLASHBOTS_RELAY_SIGNING_KEY') || ethers.Wallet.createRandom().privateKey);
      const flashbotsProvider = isBaseNetwork ? null : await FlashbotsBundleProvider.create(
        new ethers.JsonRpcProvider(Deno.env.get('ETHEREUM_RPC_URL') || 'https://rpc.ankr.com/eth'),
        authSigner
      );

      const signer = new ethers.Wallet(Deno.env.get('PRIVATE_KEY') || ethers.Wallet.createRandom().privateKey, provider);

      const feeData = await provider.getFeeData();
      const baseFeeGwei = Number(ethers.formatUnits(feeData.maxFeePerGas ?? ethers.parseUnits('40', 'gwei'), 'gwei')) || 40;
      const priorityFeeGwei = Number(ethers.formatUnits(feeData.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei'), 'gwei')) || 2;
      const feeMultiplierRaw = parseFloat(Deno.env.get('FLASHBOTS_FEE_MULTIPLIER') || '1.15');
      const feeMultiplier = Number.isFinite(feeMultiplierRaw) && feeMultiplierRaw > 0 ? feeMultiplierRaw : 1.15;
      const maxPriorityFeeOverrideRaw = parseFloat(Deno.env.get('FLASHBOTS_MAX_PRIORITY_FEE_GWEI') || '3');
      const maxPriorityFeeOverride = Number.isFinite(maxPriorityFeeOverrideRaw) && maxPriorityFeeOverrideRaw > 0 ? maxPriorityFeeOverrideRaw : 3;
      const adjustedPriorityFee = Math.min(maxPriorityFeeOverride, priorityFeeGwei * feeMultiplier);
      const adjustedMaxFee = Math.max(baseFeeGwei * feeMultiplier, adjustedPriorityFee + 1.5);
      const maxFeePerGas = ethers.parseUnits(adjustedMaxFee.toFixed(2), 'gwei');
      const maxPriorityFeePerGas = ethers.parseUnits(adjustedPriorityFee.toFixed(2), 'gwei');

      const iface = new ethers.Interface(ARB_ABI);

      const parsedPayload = parseExecutionPayload(canonicalOpportunity as unknown as Record<string, unknown>);
      if (!parsedPayload) {
        const failureReason = 'invalid_execution_payload';
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: failureReason,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: { walletAddress: walletAddress || null, action, error: 'Missing or malformed executionPayload' },
        });
        throw new Error('Missing or malformed executionPayload for executeArbitrage');
      }

      const opportunityNetProfit = Number(canonicalOpportunity.netProfit ?? 0);
      const opportunityGasCost = Number(canonicalOpportunity.gasCost ?? 0);
      const opportunityConfidence = Number(canonicalOpportunity.confidenceScore ?? 0);
      const gasToNetRatio = opportunityNetProfit > 0 ? opportunityGasCost / opportunityNetProfit : Number.POSITIVE_INFINITY;

      if (!Number.isFinite(opportunityNetProfit) || opportunityNetProfit < EXEC_POLICY_MIN_NET_PROFIT_USD) {
        const failureReason = 'execution_policy_rejected';
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: failureReason,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: {
            walletAddress: walletAddress || null,
            action,
            policy: {
              minNetProfitUsd: EXEC_POLICY_MIN_NET_PROFIT_USD,
              maxGasToNetRatio: EXEC_POLICY_MAX_GAS_TO_NET_RATIO,
              minConfidenceScore: EXEC_POLICY_MIN_CONFIDENCE_SCORE,
            },
            observed: {
              netProfit: opportunityNetProfit,
              gasCost: opportunityGasCost,
              confidenceScore: opportunityConfidence,
              gasToNetRatio,
            },
            rejectCause: 'min_net_profit',
          },
        });
        throw new Error(`Rejected by execution policy: netProfit ${opportunityNetProfit} < min ${EXEC_POLICY_MIN_NET_PROFIT_USD}`);
      }

      if (!Number.isFinite(opportunityConfidence) || opportunityConfidence < EXEC_POLICY_MIN_CONFIDENCE_SCORE) {
        const failureReason = 'execution_policy_rejected';
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: failureReason,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: {
            walletAddress: walletAddress || null,
            action,
            policy: {
              minNetProfitUsd: EXEC_POLICY_MIN_NET_PROFIT_USD,
              maxGasToNetRatio: EXEC_POLICY_MAX_GAS_TO_NET_RATIO,
              minConfidenceScore: EXEC_POLICY_MIN_CONFIDENCE_SCORE,
            },
            observed: {
              netProfit: opportunityNetProfit,
              gasCost: opportunityGasCost,
              confidenceScore: opportunityConfidence,
              gasToNetRatio,
            },
            rejectCause: 'min_confidence',
          },
        });
        throw new Error(`Rejected by execution policy: confidence ${opportunityConfidence} < min ${EXEC_POLICY_MIN_CONFIDENCE_SCORE}`);
      }

      if (!Number.isFinite(gasToNetRatio) || gasToNetRatio > EXEC_POLICY_MAX_GAS_TO_NET_RATIO) {
        const failureReason = 'execution_policy_rejected';
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: null,
          bundle_hash: null,
          included: false,
          failure_reason: failureReason,
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: {
            walletAddress: walletAddress || null,
            action,
            policy: {
              minNetProfitUsd: EXEC_POLICY_MIN_NET_PROFIT_USD,
              maxGasToNetRatio: EXEC_POLICY_MAX_GAS_TO_NET_RATIO,
              minConfidenceScore: EXEC_POLICY_MIN_CONFIDENCE_SCORE,
            },
            observed: {
              netProfit: opportunityNetProfit,
              gasCost: opportunityGasCost,
              confidenceScore: opportunityConfidence,
              gasToNetRatio,
            },
            rejectCause: 'gas_to_net_ratio',
          },
        });
        throw new Error(`Rejected by execution policy: gas/net ${gasToNetRatio.toFixed(3)} > max ${EXEC_POLICY_MAX_GAS_TO_NET_RATIO}`);
      }

      const calldata = iface.encodeFunctionData('executeArbitrage', parsedPayload.args);
      const [asset, amount, routerA, routerB, tokenB, routerAisV3, routerBisV3, feeA, feeB, amountBMin] = parsedPayload.args;

      // ── Base L2: direct RPC execution (no MEV bundles needed) ────────────────────
      if (isBaseNetwork) {
        const feeData = await provider.getFeeData();
        const maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits('0.1', 'gwei');
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('0.01', 'gwei');
        const submissionBlock = await provider.getBlockNumber();

        let txResponse: ethers.TransactionResponse;
        let txReceipt: ethers.TransactionReceipt | null = null;
        let txHash: string | null = null;

        try {
          txResponse = await signer.sendTransaction({
            to: contractAddress,
            data: calldata,
            gasLimit: 600000n,
            maxFeePerGas,
            maxPriorityFeePerGas,
            chainId: 8453,
          });
          txHash = txResponse.hash;

          await persistExecutionAttempt({
            id: executionAttemptId,
            candidate_id: resolvedCandidateId,
            scan_run_id: resolvedScanRunId,
            submitted_at: new Date(startedAt).toISOString(),
            target_block: null,
            bundle_hash: txHash,
            included: null,
            failure_reason: null,
            realized_net_profit: null,
            latency_ms: Date.now() - startedAt,
            metadata: {
              walletAddress: walletAddress || null,
              action,
              tokenPair: canonicalOpportunity.tokenPair,
              network: requestedNetwork,
              buyDex: canonicalOpportunity.buyDex,
              sellDex: canonicalOpportunity.sellDex,
              submissionBlock,
              quoteTimestamp: canonicalOpportunity.quoteTimestamp,
              reasonCode: canonicalOpportunity.reasonCode,
              txHash,
              executionPayload: { asset, amount: amount.toString(), routerA, routerB, tokenB, routerAisV3, routerBisV3, feeA, feeB, amountBMin: amountBMin.toString() },
            },
          });

          txReceipt = await txResponse.wait(1);
        } catch (execError) {
          const errorMessage = execError instanceof Error ? execError.message : 'Base execution failed';
          await persistExecutionAttempt({
            id: executionAttemptId,
            candidate_id: resolvedCandidateId,
            scan_run_id: resolvedScanRunId,
            submitted_at: new Date(startedAt).toISOString(),
            target_block: null,
            bundle_hash: null,
            included: false,
            failure_reason: 'tx_send_failed',
            realized_net_profit: null,
            latency_ms: Date.now() - startedAt,
            metadata: { walletAddress: walletAddress || null, action, error: errorMessage, tokenPair: canonicalOpportunity.tokenPair, submissionBlock },
          });
          throw new Error(errorMessage);
        }

        const included = txReceipt !== null && txReceipt.status === 1;
        const inclusionStatus = included ? 'included' : (txReceipt ? 'reverted' : 'pending');
        const realizedNetProfit = included
          ? estimateRealizedNetProfitUsd({
            predictedNetProfitUsd: opportunityNetProfit,
            predictedGasCostUsd: opportunityGasCost,
            receipt: txReceipt,
            network: requestedNetwork,
          })
          : null;

        if (txHash) {
          await updateExecutionAttemptByBundleHash(txHash, {
            included,
            failure_reason: included ? null : 'tx_reverted',
            realized_net_profit: realizedNetProfit,
            latency_ms: Date.now() - startedAt,
            metadata: { inclusionStatus, submissionBlock, txReceipt, realizedNetProfit },
          });
        }

        return new Response(
          JSON.stringify({
            success: included,
            executionAttemptId,
            scanRunId: resolvedScanRunId,
            candidateId: resolvedCandidateId,
            txHash,
            included,
            inclusionStatus,
            message: included ? 'Base transaction confirmed' : 'Base transaction pending/reverted',
            network: requestedNetwork,
            asset,
            amount: amount.toString(),
            tokenB,
            routerA,
            routerB,
            actualProfit: included ? (realizedNetProfit ?? opportunityNetProfit) : 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // ── Ethereum: Flashbots bundle submission ─────────────────────────────────────
      const blockNumber = await provider.getBlockNumber();
      const submissionBlock = blockNumber;
      const targetBlock = blockNumber + 1;

      const signedBundle = await flashbotsProvider!.signBundle([
        {
          signer,
          transaction: {
            to: contractAddress,
            value: 0,
            gasLimit: 600000,
            maxFeePerGas,
            maxPriorityFeePerGas,
            data: calldata,
            chainId: 1,
          },
        },
      ]);

      // Simulation with improved error handling (checks error AND firstRevert like Flashbots simple-arbitrage)
      let simulationResult: unknown = null;
      try {
        simulationResult = await flashbotsProvider!.simulate(signedBundle, targetBlock);
        const simResult = simulationResult as Record<string, unknown> | undefined;
        const simulationGate = classifySimulationGate(simResult);
        if (simulationGate.reject) {
          const simulationError = simulationGate.detail || 'Bundle simulation failed';
          await persistExecutionAttempt({
            id: executionAttemptId,
            candidate_id: resolvedCandidateId,
            scan_run_id: resolvedScanRunId,
            submitted_at: new Date(startedAt).toISOString(),
            target_block: targetBlock,
            bundle_hash: null,
            included: false,
            failure_reason: simulationGate.reason,
            realized_net_profit: null,
            latency_ms: Date.now() - startedAt,
            metadata: { walletAddress: walletAddress || null, action, simulationError, tokenPair: canonicalOpportunity.tokenPair, submissionBlock, targetBlock, quoteTimestamp: canonicalOpportunity.quoteTimestamp, firstRevert: simResult?.firstRevert ?? null },
          });
          throw new Error(`SIMULATION_GATE_REJECTED:${simulationError}`);
        }
      } catch (simulationError) {
        const rawMessage = simulationError instanceof Error ? simulationError.message : 'Bundle simulation failed';
        if (rawMessage.startsWith('SIMULATION_GATE_REJECTED:')) {
          throw new Error(rawMessage.replace('SIMULATION_GATE_REJECTED:', ''));
        }
        const message = rawMessage;
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: targetBlock,
          bundle_hash: null,
          included: false,
          failure_reason: 'simulation_failed',
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: { walletAddress: walletAddress || null, action, simulationError: message, tokenPair: canonicalOpportunity.tokenPair, submissionBlock, targetBlock, quoteTimestamp: canonicalOpportunity.quoteTimestamp },
        });
        throw new Error(message);
      }

      // Multi-block targeting: submit to both targetBlock AND targetBlock+1
      const bundleSubmission = await flashbotsProvider!.sendRawBundle(signedBundle, targetBlock);
      
      // Also submit to next block for better inclusion chances (fire-and-forget)
      flashbotsProvider!.sendRawBundle(signedBundle, targetBlock + 1).catch(() => {});

      if ('error' in bundleSubmission) {
        await persistExecutionAttempt({
          id: executionAttemptId,
          candidate_id: resolvedCandidateId,
          scan_run_id: resolvedScanRunId,
          submitted_at: new Date(startedAt).toISOString(),
          target_block: targetBlock,
          bundle_hash: null,
          included: false,
          failure_reason: 'relay_rejected_bundle',
          realized_net_profit: null,
          latency_ms: Date.now() - startedAt,
          metadata: {
            walletAddress: walletAddress || null,
            action,
            relayError: bundleSubmission.error.message,
            tokenPair: canonicalOpportunity.tokenPair,
            submissionBlock,
            targetBlock,
          },
        });
        throw new Error(bundleSubmission.error.message);
      }

      await persistExecutionAttempt({
        id: executionAttemptId,
        candidate_id: resolvedCandidateId,
        scan_run_id: resolvedScanRunId,
        submitted_at: new Date(startedAt).toISOString(),
        target_block: targetBlock,
        bundle_hash: bundleSubmission.bundleHash,
        included: null,
        failure_reason: null,
        realized_net_profit: null,
        latency_ms: Date.now() - startedAt,
        metadata: {
          walletAddress: walletAddress || null,
          action,
          tokenPair: canonicalOpportunity.tokenPair,
          network: requestedNetwork,
          buyDex: canonicalOpportunity.buyDex,
          sellDex: canonicalOpportunity.sellDex,
          submissionBlock,
          targetBlock,
          quoteTimestamp: canonicalOpportunity.quoteTimestamp,
          reasonCode: canonicalOpportunity.reasonCode,
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
          executionPayload: {
            asset,
            amount: amount.toString(),
            routerA,
            routerB,
            tokenB,
            routerAisV3,
            routerBisV3,
            feeA,
            feeB,
            amountBMin: amountBMin.toString(),
          },
          scanRunId: resolvedScanRunId,
          candidateId: resolvedCandidateId,
          simulationResult,
        },
      });

      const primaryTxHash = txHashFromSignedTx(signedBundle[0]);
      let included: boolean | null = null;
      let inclusionStatus = 'pending';
      let failureReason: string | null = null;
      let txReceipt: ethers.TransactionReceipt | null = null;

      try {
        const waitResult = await bundleSubmission.wait();
        if (waitResult === FlashbotsBundleResolution.BundleIncluded) {
          included = true;
          inclusionStatus = 'included';
        } else if (waitResult === FlashbotsBundleResolution.AccountNonceTooHigh) {
          included = false;
          inclusionStatus = 'nonce_too_high';
          failureReason = 'account_nonce_too_high';
        } else {
          included = false;
          inclusionStatus = 'not_included';
          failureReason = 'bundle_not_included';
        }

        if (included && primaryTxHash) {
          txReceipt = await provider.getTransactionReceipt(primaryTxHash);
        }
      } catch (waitError) {
        included = false;
        inclusionStatus = 'monitoring_failed';
        failureReason = waitError instanceof Error ? waitError.message : 'bundle_wait_failed';
      }

      const realizedNetProfit = included
        ? estimateRealizedNetProfitUsd({
          predictedNetProfitUsd: opportunityNetProfit,
          predictedGasCostUsd: opportunityGasCost,
          receipt: txReceipt,
          network: requestedNetwork,
        })
        : null;

      await updateExecutionAttemptByBundleHash(bundleSubmission.bundleHash, {
        included,
        failure_reason: failureReason,
        realized_net_profit: realizedNetProfit,
        latency_ms: Date.now() - startedAt,
        metadata: {
          walletAddress: walletAddress || null,
          action,
          inclusionStatus,
          submissionBlock,
          targetBlock,
          txHash: primaryTxHash,
          txReceipt,
          simulationResult,
          realizedNetProfit,
          tokenPair: canonicalOpportunity.tokenPair,
          network: requestedNetwork,
          executionPayload: {
            asset,
            amount: amount.toString(),
            routerA,
            routerB,
            tokenB,
            routerAisV3,
            routerBisV3,
            feeA,
            feeB,
            amountBMin: amountBMin.toString(),
          },
          scanRunId: resolvedScanRunId,
          candidateId: resolvedCandidateId,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          executionAttemptId,
          scanRunId: resolvedScanRunId,
          candidateId: resolvedCandidateId,
          bundleHash: bundleSubmission.bundleHash,
          included,
          inclusionStatus,
          message: 'Bundle submitted to Flashbots relay',
          targetBlock,
          txHash: primaryTxHash,
          asset,
          amount: amount.toString(),
          tokenB,
          routerA,
          routerB,
          actualProfit: included ? (realizedNetProfit ?? opportunityNetProfit) : 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'monitor-bundle') {
      const bundleHash = typeof params.bundleHash === 'string' ? params.bundleHash : '';
      const txHash = typeof params.txHash === 'string' ? params.txHash : '';
      const targetBlock = Number(params.targetBlock ?? 0);

      const provider = new ethers.JsonRpcProvider(Deno.env.get('ETHEREUM_RPC_URL') || 'https://rpc.ankr.com/eth');
      const currentBlock = await provider.getBlockNumber();

      let included: boolean | null = null;
      let receipt: unknown = null;
      let status = 'pending';
      let failureReason: string | null = null;

      if (txHash) {
        receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          included = Boolean((receipt as { status?: number }).status === 1);
          status = included ? 'included' : 'reverted';
          failureReason = included ? null : 'tx_reverted';
        }
      }

      if (included === null && targetBlock > 0 && currentBlock > targetBlock + 2) {
        included = false;
        status = 'not_included';
        failureReason = 'target_block_expired';
      }

      if (bundleHash) {
        await updateExecutionAttemptByBundleHash(bundleHash, {
          included,
          failure_reason: failureReason,
          metadata: {
            monitorAction: true,
            currentBlock,
            targetBlock,
            txHash: txHash || null,
            receipt,
            status,
          },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          status,
          currentBlock,
          targetBlock: targetBlock || null,
          included,
          txHash: txHash || null,
          receipt,
          bundleHash: bundleHash || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unsupported action: ${action ?? 'none'}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
