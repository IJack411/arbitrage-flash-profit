import React, { useState, useEffect, useCallback } from 'react';
import { Activity, TrendingUp, TrendingDown, Radio, Zap, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { PriceChart } from './PriceChart';
import { AlertConfigPanel } from './AlertConfigPanel';
import { chainlinkService, ChainlinkPrice } from '@/lib/web3/chainlinkService';
import { dexPriceFeedService, DexPriceData } from '@/lib/web3/dexPriceFeed';
import { wsManager, PriceUpdate } from '@/lib/web3/websocketManager';
import { priceHistoryService } from '@/lib/web3/priceHistoryService';
import { alertService } from '@/lib/web3/alertService';
import { coingeckoService, CoinGeckoPrice } from '@/lib/coingeckoService';

const PAIRS = ['ETH/USD', 'BTC/USD', 'LINK/USD', 'UNI/USD', 'AAVE/USD'];

interface PriceState {
  chainlink: ChainlinkPrice | null;
  dex: DexPriceData[];
  live: PriceUpdate | null;
  spread: number;
  coingecko: CoinGeckoPrice | null;
}

export const PriceFeedPanel: React.FC = () => {
  const [selectedPair, setSelectedPair] = useState('ETH/USD');
  const [network, setNetwork] = useState('ethereum');
  const [prices, setPrices] = useState<Record<string, PriceState>>({});
  const [chartData, setChartData] = useState<{ time: number; price: number }[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usingLiveData, setUsingLiveData] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  // Initialize mock history
  useEffect(() => {
    const basePrices: Record<string, number> = { 'ETH/USD': 2350, 'BTC/USD': 43500, 'LINK/USD': 14.5, 'UNI/USD': 6.2, 'AAVE/USD': 95 };
    PAIRS.forEach(pair => priceHistoryService.generateMockHistory(pair, basePrices[pair] || 100));
  }, []);

  // Fetch prices with CoinGecko integration
  const fetchPrices = useCallback(async () => {
    setLoading(true);
    try {
      // Get base token from pair
      const baseToken = selectedPair.split('/')[0];
      
      // Fetch from multiple sources
      const [chainlink, dex, coingeckoPrice] = await Promise.all([
        chainlinkService.getPrice(network, selectedPair),
        dexPriceFeedService.getAllDexPrices(selectedPair),
        coingeckoService.getPrice(baseToken),
      ]);
      
      // Calculate spread from DEX prices
      const dexPrices = dex.map(d => d.price).filter(p => p > 0);
      const spread = dexPrices.length > 1 ? ((Math.max(...dexPrices) - Math.min(...dexPrices)) / Math.min(...dexPrices)) * 100 : 0;
      
      // Update live data status
      setUsingLiveData(coingeckoPrice !== null);
      setLastUpdate(Date.now());
      
      setPrices(prev => ({ 
        ...prev, 
        [selectedPair]: { 
          chainlink, 
          dex, 
          live: prev[selectedPair]?.live || null, 
          spread,
          coingecko: coingeckoPrice
        } 
      }));
      
      // Check alerts
      alertService.checkSpread(selectedPair, spread);
      const priceToCheck = coingeckoPrice?.current_price || chainlink?.price;
      if (priceToCheck) alertService.checkPrice(selectedPair, priceToCheck);
      if (spread > 0.1) alertService.checkOpportunity(selectedPair, spread);
      
      // Add to history
      if (coingeckoPrice) {
        priceHistoryService.addPrice(selectedPair, coingeckoPrice.current_price, 'coingecko');
      }
      dex.forEach(d => priceHistoryService.addPrice(selectedPair, d.price, d.dex));
      
    } catch (e) { console.error('Price fetch error:', e); }
    setLoading(false);
  }, [selectedPair, network]);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  // WebSocket streaming
  useEffect(() => {
    if (!isStreaming) return;
    
    const unsub = wsManager.subscribe(selectedPair, (update) => {
      setPrices(prev => {
        const current = prev[selectedPair] || { chainlink: null, dex: [], live: null, spread: 0, coingecko: null };
        return { ...prev, [selectedPair]: { ...current, live: update } };
      });
      priceHistoryService.addPrice(selectedPair, update.price, update.source);
    });
    
    return unsub;
  }, [selectedPair, isStreaming]);

  // Update chart
  useEffect(() => {
    const updateChart = () => setChartData(priceHistoryService.getChartData(selectedPair, '1m'));
    updateChart();
    const interval = setInterval(updateChart, 2000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  const currentPrices = prices[selectedPair];
  // Use CoinGecko price as primary, fall back to chainlink or live
  const livePrice = currentPrices?.coingecko?.current_price || currentPrices?.live?.price || currentPrices?.chainlink?.price || 0;
  const priceChange24h = currentPrices?.coingecko?.price_change_percentage_24h || currentPrices?.live?.change || 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Radio className={`h-5 w-5 ${isStreaming ? 'text-green-400 animate-pulse' : 'text-gray-500'}`} />
          <h2 className="text-white text-xl font-bold">Live Price Feeds</h2>
          {/* Live data indicator */}
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-gray-800">
            {usingLiveData ? (
              <>
                <Wifi className="h-3 w-3 text-green-400" />
                <span className="text-green-400">CoinGecko Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-yellow-400" />
                <span className="text-yellow-400">Simulated</span>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={network} onChange={e => setNetwork(e.target.value)} className="bg-gray-800 border border-gray-700 text-white px-3 py-1.5 rounded-lg text-sm">
            <option value="ethereum">Ethereum</option>
            <option value="polygon">Polygon</option>
            <option value="arbitrum">Arbitrum</option>
          </select>
          <button onClick={() => setIsStreaming(!isStreaming)} className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 ${isStreaming ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
            <Activity className="h-4 w-4" /> {isStreaming ? 'Streaming' : 'Start Stream'}
          </button>
          <button onClick={fetchPrices} disabled={loading} className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pair Selector */}
      <div className="flex gap-2 flex-wrap">
        {PAIRS.map(pair => (
          <button key={pair} onClick={() => setSelectedPair(pair)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedPair === pair ? 'bg-[#00F0FF] text-gray-900' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
            {pair}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Price Display */}
        <div className="lg:col-span-2 space-y-4">
          {/* Current Price Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-gray-400 text-sm flex items-center gap-2">
                  {selectedPair}
                  {lastUpdate > 0 && (
                    <span className="text-gray-500 text-xs">
                      Updated {Math.round((Date.now() - lastUpdate) / 1000)}s ago
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-white">${livePrice.toFixed(2)}</span>
                  <span className={`flex items-center text-sm ${priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {priceChange24h >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {Math.abs(priceChange24h).toFixed(2)}%
                  </span>
                </div>
                {/* Additional CoinGecko data */}
                {currentPrices?.coingecko && (
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>24h High: <span className="text-green-400">${currentPrices.coingecko.high_24h?.toFixed(2)}</span></span>
                    <span>24h Low: <span className="text-red-400">${currentPrices.coingecko.low_24h?.toFixed(2)}</span></span>
                    <span>Vol: ${(currentPrices.coingecko.total_volume / 1e9).toFixed(2)}B</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="text-gray-400 text-xs">Spread</span>
                <div className={`text-lg font-bold ${(currentPrices?.spread || 0) > 0.1 ? 'text-green-400' : 'text-gray-300'}`}>
                  {(currentPrices?.spread || 0).toFixed(3)}%
                </div>
              </div>
            </div>
            <PriceChart data={chartData} pair={selectedPair} height={180} />
          </div>


          {/* DEX Prices */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#00F0FF]" /> DEX Prices
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {currentPrices?.dex.map(d => (
                <div key={d.dex} className="bg-gray-900 rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1">{d.dex}</div>
                  <div className="text-white font-semibold">${d.price.toFixed(2)}</div>
                  <div className="text-gray-500 text-xs">Liq: ${(d.liquidity / 1e6).toFixed(1)}M</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chainlink Oracle */}
          {currentPrices?.chainlink && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-2">Chainlink Oracle</h3>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-2xl font-bold text-white">${currentPrices.chainlink.price.toFixed(2)}</span>
                  <span className="text-gray-500 text-xs ml-2">Round: {currentPrices.chainlink.roundId.slice(-8)}</span>
                </div>
                <span className="text-gray-400 text-xs">Updated: {new Date(currentPrices.chainlink.updatedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Alert Config */}
        <div className="lg:col-span-1">
          <AlertConfigPanel />
        </div>
      </div>
    </div>
  );
};
