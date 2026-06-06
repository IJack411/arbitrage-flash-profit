import { ethers } from 'npm:ethers@6.7.0';
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from 'npm:@flashbots/ethers-provider-bundle@1.0.0';

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

      const requestedNetwork = String(opportunity?.executionPayload?.network ?? opportunity?.network ?? 'ethereum').toLowerCase();
      if (requestedNetwork !== 'ethereum') {
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

      const provider = new ethers.JsonRpcProvider(Deno.env.get('ETHEREUM_RPC_URL') || 'https://rpc.ankr.com/eth');
      const authSigner = new ethers.Wallet(Deno.env.get('FLASHBOTS_RELAY_SIGNING_KEY') || ethers.Wallet.createRandom().privateKey);
      const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner);

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

      const parsedPayload = parseExecutionPayload(opportunity as Record<string, unknown> | undefined);
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

      const opportunityNetProfit = Number(opportunity?.netProfit ?? 0);
      const opportunityGasCost = Number(opportunity?.gasCost ?? 0);
      const opportunityConfidence = Number(opportunity?.confidenceScore ?? 0);
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

      const blockNumber = await provider.getBlockNumber();
      const targetBlock = blockNumber + 1;

      const signedBundle = await flashbotsProvider.signBundle([
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
        simulationResult = await flashbotsProvider.simulate(signedBundle, targetBlock);
        const simResult = simulationResult as Record<string, unknown> | undefined;
        const hasError = simResult && 'error' in simResult;
        const hasFirstRevert = simResult && 'firstRevert' in simResult && simResult.firstRevert !== undefined;
        
        if (hasError || hasFirstRevert) {
          const simulationError = hasError 
            ? ((simResult as { error?: { message?: string } }).error?.message || 'Bundle simulation returned error')
            : `Transaction reverted: ${JSON.stringify((simResult as { firstRevert?: unknown }).firstRevert)}`;
          await persistExecutionAttempt({
            id: executionAttemptId,
            candidate_id: resolvedCandidateId,
            scan_run_id: resolvedScanRunId,
            submitted_at: new Date(startedAt).toISOString(),
            target_block: targetBlock,
            bundle_hash: null,
            included: false,
            failure_reason: hasFirstRevert ? 'simulation_reverted' : 'simulation_failed',
            realized_net_profit: null,
            latency_ms: Date.now() - startedAt,
            metadata: { walletAddress: walletAddress || null, action, simulationError, tokenPair: opportunity?.tokenPair ?? null, firstRevert: hasFirstRevert ? simResult?.firstRevert : null },
          });
          throw new Error(simulationError);
        }
      } catch (simulationError) {
        const message = simulationError instanceof Error ? simulationError.message : 'Bundle simulation failed';
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
          metadata: { walletAddress: walletAddress || null, action, simulationError: message, tokenPair: opportunity?.tokenPair ?? null },
        });
        throw new Error(message);
      }

      // Multi-block targeting: submit to both targetBlock AND targetBlock+1
      // Inspired by Flashbots simple-arbitrage for increased inclusion probability
      const targetBlocks = [targetBlock, targetBlock + 1];
      
      // Submit to primary block first
      const bundleSubmission = await flashbotsProvider.sendRawBundle(signedBundle, targetBlock);
      
      // Also submit to next block for better inclusion chances (fire-and-forget)
      flashbotsProvider.sendRawBundle(signedBundle, targetBlock + 1).catch(() => {
        // Silently ignore secondary submission errors
      });

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
            tokenPair: opportunity?.tokenPair ?? null,
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
          tokenPair: opportunity?.tokenPair ?? null,
          network: requestedNetwork,
          buyDex: opportunity?.buyDex ?? null,
          sellDex: opportunity?.sellDex ?? null,
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
      let txReceipt: unknown = null;

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

      await updateExecutionAttemptByBundleHash(bundleSubmission.bundleHash, {
        included,
        failure_reason: failureReason,
        latency_ms: Date.now() - startedAt,
        metadata: {
          walletAddress: walletAddress || null,
          action,
          inclusionStatus,
          txHash: primaryTxHash,
          txReceipt,
          simulationResult,
          tokenPair: opportunity?.tokenPair ?? null,
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
