import React, { useState, useEffect, useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown, ArrowUpDown, Info, Search, X, ChevronDown, Coins, BarChart2 } from 'lucide-react';
import { priceAlertService, TOKEN_PAIRS, CATEGORY_LABELS } from '@/lib/priceAlertService';
import { Button } from '@/components/ui/button';
import { TokenPriceChart } from './TokenPriceChart';

interface PriceAlertFormProps {
  onAlertCreated: () => void;
  onCancel?: () => void;
  preselectedPair?: string;
}

export const PriceAlertForm: React.FC<PriceAlertFormProps> = ({ 
  onAlertCreated, 
  onCancel,
  preselectedPair 
}) => {
  const [tokenPair, setTokenPair] = useState(preselectedPair || 'ETH/USDT');
  const [targetPrice, setTargetPrice] = useState('');
  const [condition, setCondition] = useState<'above' | 'below' | 'crosses'>('above');
  const [repeatAlert, setRepeatAlert] = useState(false);
  const [note, setNote] = useState('');
  const [network, setNetwork] = useState('ethereum');
  const [error, setError] = useState('');
  const [showChart, setShowChart] = useState(false);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showDropdown, setShowDropdown] = useState(false);

  const currentPrice = priceAlertService.getCurrentPrice(tokenPair);
  const priceChange = priceAlertService.getPriceChange(tokenPair);
  const range = priceAlertService.get24hRange(tokenPair);
  const pairInfo = priceAlertService.getPairInfo(tokenPair);

  // Filter pairs based on search and category
  const filteredPairs = useMemo(() => {
    let pairs = Object.entries(TOKEN_PAIRS);
    
    // Filter by category
    if (selectedCategory !== 'all') {
      pairs = pairs.filter(([_, info]) => info.category === selectedCategory);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      pairs = pairs.filter(([pair, info]) => 
        pair.toLowerCase().includes(query) ||
        info.baseToken.toLowerCase().includes(query) ||
        info.quoteToken.toLowerCase().includes(query)
      );
    }
    
    return pairs;
  }, [searchQuery, selectedCategory]);

  // Group pairs by category for display
  const groupedPairs = useMemo(() => {
    const groups: Record<string, typeof filteredPairs> = {};
    filteredPairs.forEach(([pair, info]) => {
      if (!groups[info.category]) {
        groups[info.category] = [];
      }
      groups[info.category].push([pair, info]);
    });
    return groups;
  }, [filteredPairs]);

  useEffect(() => {
    if (preselectedPair) {
      setTokenPair(preselectedPair);
    }
  }, [preselectedPair]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      setError('Please enter a valid target price');
      return;
    }

    priceAlertService.createAlert({
      tokenPair,
      targetPrice: price,
      condition,
      repeatAlert,
      note,
      network,
    });

    // Reset form
    setTargetPrice('');
    setNote('');
    setRepeatAlert(false);
    onAlertCreated();
  };

  const setQuickPrice = (percentage: number) => {
    const newPrice = currentPrice * (1 + percentage / 100);
    const decimals = newPrice < 0.00001 ? 10 : newPrice < 0.01 ? 8 : newPrice < 1 ? 6 : 2;
    setTargetPrice(newPrice.toFixed(decimals));
    setCondition(percentage > 0 ? 'above' : 'below');
  };

  const formatPrice = (price: number): string => {
    if (price < 0.00001) return price.toExponential(4);
    if (price < 0.01) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    if (price < 100) return price.toFixed(4);
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      major: 'bg-blue-500/20 text-blue-400',
      altcoin: 'bg-purple-500/20 text-purple-400',
      stablecoin: 'bg-green-500/20 text-green-400',
      defi: 'bg-orange-500/20 text-orange-400',
      layer2: 'bg-cyan-500/20 text-cyan-400',
      meme: 'bg-pink-500/20 text-pink-400',
      gaming: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[category] || 'bg-gray-500/20 text-gray-400';
  };

  const parsedTargetPrice = parseFloat(targetPrice);

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Plus className="h-5 w-5 text-[#00F0FF]" />
          Create Price Alert
        </h3>
        <button
          type="button"
          onClick={() => setShowChart(!showChart)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showChart
              ? 'bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/50'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          <BarChart2 className="h-4 w-4" />
          {showChart ? 'Hide Chart' : 'Show Chart'}
        </button>
      </div>

      {/* Chart Preview */}
      {showChart && (
        <div className="mb-6">
          <TokenPriceChart
            tokenPair={tokenPair}
            targetPrice={!isNaN(parsedTargetPrice) && parsedTargetPrice > 0 ? parsedTargetPrice : undefined}
            currentPrice={currentPrice}
          />
        </div>
      )}

      <div className="space-y-4">
        {/* Token Pair Selection with Search */}
        <div>
          <label className="text-gray-400 text-sm mb-2 block">Token Pair</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-3 text-sm focus:border-[#00F0FF] focus:outline-none flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Coins className="h-5 w-5 text-[#00F0FF]" />
                <span className="font-medium">{tokenPair}</span>
                {pairInfo && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(pairInfo.category)}`}>
                    {CATEGORY_LABELS[pairInfo.category]}
                  </span>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {showDropdown && (
              <div className="absolute z-50 mt-2 w-full bg-gray-900 border border-gray-600 rounded-lg shadow-xl max-h-96 overflow-hidden">
                {/* Search Input */}
                <div className="p-3 border-b border-gray-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tokens..."
                      className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg pl-10 pr-10 py-2 text-sm focus:border-[#00F0FF] focus:outline-none"
                      autoFocus
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category Filter */}
                <div className="p-3 border-b border-gray-700 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedCategory === 'all'
                        ? 'bg-[#00F0FF] text-gray-900'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    All ({Object.keys(TOKEN_PAIRS).length})
                  </button>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                    const count = Object.values(TOKEN_PAIRS).filter(p => p.category === key).length;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedCategory(key)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedCategory === key
                            ? 'bg-[#00F0FF] text-gray-900'
                            : `${getCategoryColor(key)} hover:opacity-80`
                        }`}
                      >
                        {label.split(' ')[0]} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Pairs List */}
                <div className="max-h-64 overflow-y-auto">
                  {filteredPairs.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      No tokens found matching "{searchQuery}"
                    </div>
                  ) : (
                    Object.entries(groupedPairs).map(([category, pairs]) => (
                      <div key={category}>
                        <div className="px-4 py-2 bg-gray-800 text-gray-400 text-xs font-semibold uppercase tracking-wider sticky top-0">
                          {CATEGORY_LABELS[category]} ({pairs.length})
                        </div>
                        {pairs.map(([pair, info]) => {
                          const price = priceAlertService.getCurrentPrice(pair);
                          const change = priceAlertService.getPriceChange(pair);
                          return (
                            <button
                              key={pair}
                              type="button"
                              onClick={() => {
                                setTokenPair(pair);
                                setShowDropdown(false);
                                setSearchQuery('');
                              }}
                              className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors ${
                                tokenPair === pair ? 'bg-gray-800 border-l-2 border-[#00F0FF]' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white">
                                  {info.baseToken.slice(0, 2)}
                                </div>
                                <div className="text-left">
                                  <div className="text-white font-medium">{pair}</div>
                                  <div className="text-gray-500 text-xs">{info.baseToken}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-white text-sm">${formatPrice(price)}</div>
                                <div className={`text-xs ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-gray-700 bg-gray-800">
                  <div className="text-gray-500 text-xs text-center">
                    {filteredPairs.length} of {Object.keys(TOKEN_PAIRS).length} pairs • Prices from CoinGecko
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current Price Display */}
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Current Price</span>
            <span className={`text-sm ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>
          <div className="text-2xl font-bold text-white mb-2">
            ${formatPrice(currentPrice)}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>24h Low: ${formatPrice(range.low)}</span>
            <span>24h High: ${formatPrice(range.high)}</span>
          </div>
        </div>

        {/* Quick Price Buttons */}
        <div>
          <label className="text-gray-400 text-sm mb-2 block">Quick Set</label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setQuickPrice(-5)}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              -5%
            </button>
            <button
              type="button"
              onClick={() => setQuickPrice(-2)}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              -2%
            </button>
            <button
              type="button"
              onClick={() => setQuickPrice(2)}
              className="bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              +2%
            </button>
            <button
              type="button"
              onClick={() => setQuickPrice(5)}
              className="bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              +5%
            </button>
          </div>
        </div>

        {/* Target Price */}
        <div>
          <label className="text-gray-400 text-sm mb-2 block">Target Price</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="number"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="Enter target price"
              step="any"
              className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg pl-8 pr-4 py-3 text-sm focus:border-[#00F0FF] focus:outline-none"
            />
          </div>
          {!isNaN(parsedTargetPrice) && parsedTargetPrice > 0 && (
            <div className="mt-2 text-xs text-gray-400">
              Distance from current: {' '}
              <span className={parsedTargetPrice > currentPrice ? 'text-green-400' : 'text-red-400'}>
                {((parsedTargetPrice - currentPrice) / currentPrice * 100).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Condition Selection */}
        <div>
          <label className="text-gray-400 text-sm mb-2 block">Alert Condition</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setCondition('above')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                condition === 'above' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              Above
            </button>
            <button
              type="button"
              onClick={() => setCondition('below')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                condition === 'below' 
                  ? 'bg-red-500 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              Below
            </button>
            <button
              type="button"
              onClick={() => setCondition('crosses')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                condition === 'crosses' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <ArrowUpDown className="h-4 w-4" />
              Crosses
            </button>
          </div>
        </div>

        {/* Network Selection */}
        <div>
          <label className="text-gray-400 text-sm mb-2 block">Network</label>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-3 text-sm focus:border-[#00F0FF] focus:outline-none"
          >
            <option value="ethereum">Ethereum</option>
            <option value="polygon">Polygon</option>
            <option value="arbitrum">Arbitrum</option>
            <option value="bsc">BSC</option>
            <option value="optimism">Optimism</option>
            <option value="base">Base</option>
            <option value="avalanche">Avalanche</option>
            <option value="solana">Solana</option>
          </select>
        </div>

        {/* Note */}
        <div>
          <label className="text-gray-400 text-sm mb-2 block">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note to remember why you set this alert..."
            className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-3 text-sm focus:border-[#00F0FF] focus:outline-none"
          />
        </div>

        {/* Repeat Alert Toggle */}
        <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm">Repeat Alert</span>
            <div className="group relative">
              <Info className="h-4 w-4 text-gray-500 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Alert will trigger again after resetting
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRepeatAlert(!repeatAlert)}
            className={`w-12 h-6 rounded-full relative transition-colors ${
              repeatAlert ? 'bg-[#00F0FF]' : 'bg-gray-600'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
              repeatAlert ? 'right-1' : 'left-1'
            }`} />
          </button>
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1 bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            className="flex-1 bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Alert
          </Button>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowDropdown(false)}
        />
      )}
    </form>
  );
};
