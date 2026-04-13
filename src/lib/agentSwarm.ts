import { useEffect, useRef } from 'react';
import { autoWebhookTrigger } from './autoWebhookTrigger';
import { blockchainDataService } from './web3/blockchainDataService';
import { getUnifiedConfig } from './web3/unifiedApiConfig';
import { alertSuggestionService } from './alertSuggestionService';
import { getOpportunities } from './supabaseService';
import { useWeb3 } from '../contexts/Web3Context';

export const useAgentSwarm = () => {
  const { wallet } = useWeb3();
  const lastCheckRef = useRef<number>(Date.now());
  const checkInterval = 60000; // Check every 1 minute

  useEffect(() => {
    // Initial run when wallet connects
    if (wallet) {
      runBackgroundSimulations();
    }

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastCheckRef.current >= checkInterval) {
        lastCheckRef.current = now;
        runBackgroundSimulations();
      }
    }, 10000); // Poll internal timer every 10s

    return () => clearInterval(interval);
  }, [wallet]);

  const runBackgroundSimulations = async () => {
    const config = getUnifiedConfig();
    
    // Mandy: Check system health/config
    if (!config.provider.apiKey) {
      autoWebhookTrigger.triggerAgentSuggestion(
        'Mandy',
        'API Key Missing',
        'Alchemy API key is not configured. Real-time scanning is limited.'
      );
    }

    // Proactive analysis if wallet is connected
    if (wallet) {
      try {
        await alertSuggestionService.analyzeWallet({
          address: wallet.address,
          name: 'Primary Wallet',
          balance: wallet.balance,
          network: 'ethereum', // Default or derived
          isMain: true
        });
      } catch (error) {
        console.warn('Agent analysis failed:', error);
      }
    }

    // Mandy: Check for high gas using real-world data
    try {
      const gasData = await blockchainDataService.getCurrentGasPrices(1);
      if (gasData.fast > 100) {
        autoWebhookTrigger.triggerAgentSuggestion(
          'Mandy',
          'High Gas Alert',
          `Network congestion detected (${gasData.fast.toFixed(1)} gwei). Profit thresholds should be adjusted.`
        );
      } else if (gasData.fast < 30) {
        autoWebhookTrigger.triggerAgentSuggestion(
          'Mandy',
          'Optimal Gas detected',
          `Gas is currently low (${gasData.fast.toFixed(1)} gwei). Excellent time for execution.`
        );
      }
    } catch {
      // Ignore transient gas lookup failures
    }

    // Mandy: Check for pending actionable suggestions
    const pendingSuggestions = alertSuggestionService.getPendingSuggestions();
    if (pendingSuggestions.length > 0) {
      const topSuggestion = pendingSuggestions[0];
      autoWebhookTrigger.triggerAgentSuggestion(
        'Mandy',
        'Optimization Found',
        `I recommend adjusting your ${topSuggestion.suggestionType.replace('_', ' ')} for better performance.`,
        topSuggestion.id
      );
    }

    // Arbitrage Scout: Real-world Market Insight
    try {
      const opportunities = await getOpportunities(5);
      if (opportunities.length > 0) {
        const topOpp = opportunities[0];
        // Only notify if it's a real profitable opportunity found by scanner
        if (topOpp.profitPercentage > 0.5) {
          autoWebhookTrigger.triggerAgentSuggestion(
            'Arbitrage Scout',
            'Live Opportunity',
            `Detected a real-world ${topOpp.profitPercentage.toFixed(2)}% spread for ${topOpp.tokenPair} on ${topOpp.network}.`
          );
        } else {
          autoWebhookTrigger.triggerAgentSuggestion(
            'Arbitrage Scout',
            'Market Analysis',
            `Scanning ${opportunities.length} active pools... market is tight but monitoring for spreads.`
          );
        }
      } else {
        autoWebhookTrigger.triggerAgentSuggestion(
          'Arbitrage Scout',
          'Market Status',
          'Scanner is running. No profitable spreads found in the last cycle.'
        );
      }
    } catch (error) {
       console.warn('Scout analysis failed:', error);
    }
  };
};
