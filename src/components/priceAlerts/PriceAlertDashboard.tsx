import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, BellRing, Plus, Filter, Search, Activity, 
  TrendingUp, TrendingDown, CheckCircle, XCircle, 
  Trash2, RefreshCw, ChevronDown, ChevronUp, Clock, AlertTriangle,
  Coins, Globe, Zap, BarChart2, X, Wifi, WifiOff
} from 'lucide-react';
import { PriceAlertCard } from './PriceAlertCard';
import { PriceAlertForm } from './PriceAlertForm';
import { TokenPriceChart } from './TokenPriceChart';
import { 
  priceAlertService, 
  PriceAlert, 
  PriceAlertNotification,
  TOKEN_PAIRS,
  CATEGORY_LABELS
} from '@/lib/priceAlertService';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type FilterType = 'all' | 'active' | 'triggered' | 'disabled';
type SortType = 'newest' | 'oldest' | 'pair' | 'price';

export const PriceAlertDashboard: React.FC = () => {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [notifications, setNotifications] = useState<PriceAlertNotification[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showNotifications, setShowNotifications] = useState(true);
  const [showAllPrices, setShowAllPrices] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [selectedPairForAlert, setSelectedPairForAlert] = useState<string | undefined>();
  const [selectedPairForChart, setSelectedPairForChart] = useState<string | null>(null);
  const [usingLiveData, setUsingLiveData] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  // Load alerts and start monitoring
  useEffect(() => {
    loadAlerts();
    priceAlertService.startMonitoring();
    setIsMonitoring(true);

    // Subscribe to notifications - only toast notifications
    const unsubscribe = priceAlertService.subscribe((notification) => {
      setNotifications(priceAlertService.getNotifications());
      toast({
        title: 'Price Alert Triggered!',
        description: notification.message,
        duration: 5000,
      });
    });

    // Update prices periodically
    const priceInterval = setInterval(() => {
      setCurrentPrices(priceAlertService.getAllCurrentPrices());
      setAlerts(priceAlertService.getAllAlerts());
      setUsingLiveData(priceAlertService.isUsingLiveData());
      const apiStatus = priceAlertService.getApiStatus();
      setLastUpdate(apiStatus.lastUpdate);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(priceInterval);
    };
  }, [toast]);


  const loadAlerts = () => {
    setAlerts(priceAlertService.getAllAlerts());
    setNotifications(priceAlertService.getNotifications());
    setCurrentPrices(priceAlertService.getAllCurrentPrices());
  };

  const toggleMonitoring = () => {
    if (isMonitoring) {
      priceAlertService.stopMonitoring();
      setIsMonitoring(false);
      toast({
        title: 'Monitoring Stopped',
        description: 'Price alerts are paused',
      });
    } else {
      priceAlertService.startMonitoring();
      setIsMonitoring(true);
      toast({
        title: 'Monitoring Started',
        description: 'Price alerts are now active',
      });
    }
  };

  const handleAlertCreated = () => {
    loadAlerts();
    setShowForm(false);
    setSelectedPairForAlert(undefined);
    toast({
      title: 'Alert Created',
      description: 'Your price alert has been set up',
    });
  };

  const handleDeleteAll = () => {
    if (confirm('Are you sure you want to delete all alerts?')) {
      alerts.forEach(alert => priceAlertService.deleteAlert(alert.id));
      loadAlerts();
      toast({
        title: 'All Alerts Deleted',
        description: 'Your price alerts have been removed',
      });
    }
  };

  const handleClearNotifications = () => {
    priceAlertService.clearAllNotifications();
    setNotifications([]);
  };

  const handleMarkAllRead = () => {
    priceAlertService.markAllNotificationsRead();
    setNotifications(priceAlertService.getNotifications());
  };

  const handleDismissNotification = (id: string) => {
    priceAlertService.dismissNotification(id);
    setNotifications(priceAlertService.getNotifications());
  };

  const handleQuickAlert = (pair: string) => {
    setSelectedPairForAlert(pair);
    setShowForm(true);
  };

  const handleViewChart = (pair: string) => {
    setSelectedPairForChart(pair);
  };

  // Filter and sort alerts
  const filteredAlerts = alerts
    .filter(alert => {
      // Search filter
      if (searchQuery && !alert.tokenPair.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Category filter
      if (categoryFilter !== 'all') {
        const pairInfo = TOKEN_PAIRS[alert.tokenPair];
        if (!pairInfo || pairInfo.category !== categoryFilter) {
          return false;
        }
      }
      // Status filter
      switch (filter) {
        case 'active': return alert.enabled && !alert.triggeredAt;
        case 'triggered': return alert.triggeredAt !== null;
        case 'disabled': return !alert.enabled;
        default: return true;
      }
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return a.createdAt - b.createdAt;
        case 'pair': return a.tokenPair.localeCompare(b.tokenPair);
        case 'price': return b.targetPrice - a.targetPrice;
        default: return b.createdAt - a.createdAt;
      }
    });

  const stats = {
    total: alerts.length,
    active: alerts.filter(a => a.enabled && !a.triggeredAt).length,
    triggered: alerts.filter(a => a.triggeredAt !== null).length,
    disabled: alerts.filter(a => !a.enabled).length,
  };

  const unreadCount = priceAlertService.getUnreadCount();

  // Get prices grouped by category for display
  const pricesByCategory = useMemo(() => {
    const grouped: Record<string, Array<{ pair: string; price: number; change: number }>> = {};
    
    Object.entries(TOKEN_PAIRS).forEach(([pair, info]) => {
      if (!grouped[info.category]) {
        grouped[info.category] = [];
      }
      grouped[info.category].push({
        pair,
        price: currentPrices[pair] || info.basePrice,
        change: priceAlertService.getPriceChange(pair),
      });
    });
    
    return grouped;
  }, [currentPrices]);

  const formatPrice = (price: number): string => {
    if (price < 0.00001) return price.toExponential(4);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      major: 'text-blue-400',
      altcoin: 'text-purple-400',
      stablecoin: 'text-green-400',
      defi: 'text-orange-400',
      layer2: 'text-cyan-400',
      meme: 'text-pink-400',
      gaming: 'text-yellow-400',
    };
    return colors[category] || 'text-gray-400';
  };

  return (
    <div className="space-y-6">
      {/* Full screen chart modal */}
      {selectedPairForChart && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-auto">
            <TokenPriceChart
              tokenPair={selectedPairForChart}
              currentPrice={currentPrices[selectedPairForChart]}
              onClose={() => setSelectedPairForChart(null)}
              isModal={true}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bell className="h-7 w-7 text-[#00F0FF]" />
            Price Alert System
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white">{unreadCount} new</Badge>
            )}
          </h2>
          <p className="text-gray-400 mt-1 flex flex-wrap items-center gap-2">
            <Coins className="h-4 w-4" />
            {Object.keys(TOKEN_PAIRS).length} token pairs available
            <span className="flex items-center gap-1 ml-2">
              {usingLiveData ? (
                <>
                  <Wifi className="h-3 w-3 text-green-400" />
                  <span className="text-green-400 text-xs">Live from CoinGecko</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-yellow-400" />
                  <span className="text-yellow-400 text-xs">Simulated data</span>
                </>
              )}
            </span>
            {lastUpdate > 0 && (
              <span className="text-gray-500 text-xs ml-2">
                Updated {Math.round((Date.now() - lastUpdate) / 1000)}s ago
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMonitoring}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isMonitoring 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-gray-700 text-gray-300 border border-gray-600'
            }`}
          >
            <Activity className={`h-4 w-4 ${isMonitoring ? 'animate-pulse' : ''}`} />
            {isMonitoring ? 'Monitoring Active' : 'Start Monitoring'}
          </button>
          <button
            onClick={() => {
              setSelectedPairForAlert(undefined);
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Alert
          </button>
        </div>
      </div>


      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Total Alerts</span>
            <Bell className="h-5 w-5 text-gray-500" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{stats.total}</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Active</span>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-400 mt-2">{stats.active}</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Triggered</span>
            <BellRing className="h-5 w-5 text-yellow-500" />
          </div>
          <div className="text-2xl font-bold text-yellow-400 mt-2">{stats.triggered}</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Disabled</span>
            <XCircle className="h-5 w-5 text-gray-500" />
          </div>
          <div className="text-2xl font-bold text-gray-400 mt-2">{stats.disabled}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Create Alert Form */}
          {showForm && (
            <PriceAlertForm 
              onAlertCreated={handleAlertCreated}
              onCancel={() => {
                setShowForm(false);
                setSelectedPairForAlert(undefined);
              }}
              preselectedPair={selectedPairForAlert}
            />
          )}

          {/* Filters and Search */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by token pair..."
                    className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:border-[#00F0FF] focus:outline-none"
                  />
                </div>

                {/* Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as FilterType)}
                    className="bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="all">All Alerts</option>
                    <option value="active">Active</option>
                    <option value="triggered">Triggered</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortType)}
                  className="bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="pair">By Pair</option>
                  <option value="price">By Price</option>
                </select>

                {/* Delete All */}
                {alerts.length > 0 && (
                  <button
                    onClick={handleDeleteAll}
                    className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                    title="Delete all alerts"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    categoryFilter === 'all'
                      ? 'bg-[#00F0FF] text-gray-900'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  All Categories
                </button>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCategoryFilter(key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      categoryFilter === key
                        ? 'bg-[#00F0FF] text-gray-900'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Alerts Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {filteredAlerts.length === 0 ? (
              <div className="md:col-span-2 bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
                <Bell className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-white font-semibold mb-2">No Alerts Found</h3>
                <p className="text-gray-400 text-sm mb-4">
                  {searchQuery || filter !== 'all' || categoryFilter !== 'all'
                    ? 'Try adjusting your filters or search query'
                    : 'Create your first price alert to get started'}
                </p>
                {!showForm && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 px-4 py-2 rounded-lg font-medium"
                  >
                    <Plus className="h-4 w-4 inline mr-2" />
                    Create Alert
                  </button>
                )}
              </div>
            ) : (
              filteredAlerts.map(alert => (
                <PriceAlertCard
                  key={alert.id}
                  alert={alert}
                  onUpdate={loadAlerts}
                  onDelete={loadAlerts}
                />
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Live Prices */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#00F0FF]" />
                Live Prices
              </h3>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${isMonitoring ? 'text-green-400' : 'text-gray-500'}`}>
                  {isMonitoring ? 'Live' : 'Paused'}
                </span>
                <button
                  onClick={() => setShowAllPrices(!showAllPrices)}
                  className="text-gray-400 hover:text-white text-xs"
                >
                  {showAllPrices ? 'Show Less' : 'Show All'}
                </button>
              </div>
            </div>
            
            <div className={`space-y-3 ${showAllPrices ? 'max-h-[500px]' : 'max-h-64'} overflow-y-auto`}>
              {Object.entries(pricesByCategory).map(([category, pairs]) => {
                const displayPairs = showAllPrices ? pairs : pairs.slice(0, 3);
                if (displayPairs.length === 0) return null;
                
                return (
                  <div key={category}>
                    <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${getCategoryColor(category)}`}>
                      {CATEGORY_LABELS[category]}
                    </div>
                    <div className="space-y-1">
                      {displayPairs.map(({ pair, price, change }) => (
                        <div
                          key={pair}
                          className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-2 transition-colors group"
                        >
                          <span className="text-white text-sm font-medium">{pair}</span>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <div className="text-white text-sm">
                                ${formatPrice(price)}
                              </div>
                              <div className={`text-xs ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleViewChart(pair)}
                                className="p-1 text-gray-500 hover:text-[#00F0FF] transition-colors"
                                title="View chart"
                              >
                                <BarChart2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleQuickAlert(pair)}
                                className="p-1 text-gray-500 hover:text-[#00F0FF] transition-colors"
                                title="Create alert"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-3 pt-3 border-t border-gray-700 text-center">
              <span className="text-gray-500 text-xs flex items-center justify-center gap-1">
                <Globe className="h-3 w-3" />
                {Object.keys(TOKEN_PAIRS).length} pairs • Click chart icon to view
              </span>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <BellRing className="h-4 w-4 text-yellow-400" />
                Notifications
                {unreadCount > 0 && (
                  <Badge className="bg-red-500 text-white text-xs">{unreadCount}</Badge>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <>
                    <button
                      onClick={handleMarkAllRead}
                      className="text-gray-400 hover:text-white text-xs"
                    >
                      Mark all read
                    </button>
                    <button
                      onClick={handleClearNotifications}
                      className="text-gray-400 hover:text-red-400 text-xs"
                    >
                      Clear
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="text-gray-400 hover:text-white"
                >
                  {showNotifications ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {showNotifications && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="text-center py-6">
                    <Bell className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map(notification => (
                    <div
                      key={notification.id}
                      className={`relative bg-gray-900 rounded-lg p-3 border-l-4 ${
                        notification.read ? 'border-gray-600' : 'border-yellow-500'
                      }`}
                    >
                      <button
                        onClick={() => handleDismissNotification(notification.id)}
                        className="absolute top-2 right-2 text-gray-500 hover:text-gray-300"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                      <div className="flex items-start gap-2 pr-6">
                        <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-white text-sm">{notification.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-gray-500 text-xs flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(notification.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="text-gray-500 text-xs">
                              ${formatPrice(notification.triggeredPrice)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Quick Tips */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              Quick Tips
            </h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2">
                <TrendingUp className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>Use "Above" alerts for breakout signals</span>
              </li>
              <li className="flex items-start gap-2">
                <TrendingDown className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <span>Use "Below" alerts for support levels</span>
              </li>
              <li className="flex items-start gap-2">
                <RefreshCw className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <span>Enable "Repeat" for recurring alerts</span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart2 className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <span>Click chart icon to view price history</span>
              </li>
              <li className="flex items-start gap-2">
                <Coins className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                <span>Draw support/resistance lines on charts</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
