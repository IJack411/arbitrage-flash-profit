import React, { useState } from 'react';
import { 
  Bell, BellOff, Trash2, Edit2, RefreshCw, TrendingUp, TrendingDown, 
  ArrowUpDown, Check, X, BarChart2, Maximize2 
} from 'lucide-react';
import { PriceAlert, priceAlertService, TOKEN_PAIRS, CATEGORY_LABELS } from '@/lib/priceAlertService';
import { Badge } from '@/components/ui/badge';
import { TokenPriceChart } from './TokenPriceChart';

interface PriceAlertCardProps {
  alert: PriceAlert;
  onUpdate: () => void;
  onDelete: () => void;
}

export const PriceAlertCard: React.FC<PriceAlertCardProps> = ({ alert, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showFullChart, setShowFullChart] = useState(false);
  const [editPrice, setEditPrice] = useState(alert.targetPrice.toString());
  const [editCondition, setEditCondition] = useState(alert.condition);
  const [editNote, setEditNote] = useState(alert.note);

  const pairInfo = TOKEN_PAIRS[alert.tokenPair];

  const handleToggle = () => {
    priceAlertService.updateAlert(alert.id, { enabled: !alert.enabled });
    onUpdate();
  };

  const handleDelete = () => {
    priceAlertService.deleteAlert(alert.id);
    onDelete();
  };

  const handleReset = () => {
    priceAlertService.resetAlert(alert.id);
    onUpdate();
  };

  const handleSaveEdit = () => {
    const targetPrice = parseFloat(editPrice);
    if (isNaN(targetPrice) || targetPrice <= 0) return;

    priceAlertService.updateAlert(alert.id, {
      targetPrice,
      condition: editCondition,
      note: editNote,
    });
    setIsEditing(false);
    onUpdate();
  };

  const handleCancelEdit = () => {
    setEditPrice(alert.targetPrice.toString());
    setEditCondition(alert.condition);
    setEditNote(alert.note);
    setIsEditing(false);
  };

  const formatPrice = (price: number): string => {
    if (price < 0.00001) return price.toExponential(4);
    if (price < 0.01) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    if (price < 100) return price.toFixed(4);
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const getConditionIcon = () => {
    switch (alert.condition) {
      case 'above': return <TrendingUp className="h-4 w-4" />;
      case 'below': return <TrendingDown className="h-4 w-4" />;
      case 'crosses': return <ArrowUpDown className="h-4 w-4" />;
    }
  };

  const getConditionColor = () => {
    switch (alert.condition) {
      case 'above': return 'text-green-400';
      case 'below': return 'text-red-400';
      case 'crosses': return 'text-blue-400';
    }
  };

  const getStatusBadge = () => {
    if (alert.triggeredAt) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Triggered</Badge>;
    }
    if (!alert.enabled) {
      return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Disabled</Badge>;
    }
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
  };

  const getCategoryBadge = () => {
    if (!pairInfo) return null;
    const colors: Record<string, string> = {
      major: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      altcoin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      stablecoin: 'bg-green-500/20 text-green-400 border-green-500/30',
      defi: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      layer2: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      meme: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      gaming: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    };
    return (
      <Badge className={`text-xs ${colors[pairInfo.category] || 'bg-gray-500/20 text-gray-400'}`}>
        {CATEGORY_LABELS[pairInfo.category]?.split(' ')[0] || pairInfo.category}
      </Badge>
    );
  };

  const priceDistance = ((alert.currentPrice - alert.targetPrice) / alert.targetPrice) * 100;
  const isClose = Math.abs(priceDistance) < 2;

  // Full screen chart modal
  if (showFullChart) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl max-h-[90vh] overflow-auto">
          <TokenPriceChart
            tokenPair={alert.tokenPair}
            targetPrice={alert.targetPrice}
            currentPrice={alert.currentPrice}
            onClose={() => setShowFullChart(false)}
            isModal={true}
          />
        </div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="bg-gray-800 border border-[#00F0FF]/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white font-semibold">{alert.tokenPair}</span>
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={handleCancelEdit} className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Target Price</label>
            <input
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
              step="any"
            />
          </div>
          
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Condition</label>
            <select
              value={editCondition}
              onChange={(e) => setEditCondition(e.target.value as PriceAlert['condition'])}
              className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
            >
              <option value="above">Price goes above</option>
              <option value="below">Price goes below</option>
              <option value="crosses">Price crosses</option>
            </select>
          </div>
          
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Note (optional)</label>
            <input
              type="text"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Add a note..."
              className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800 border rounded-lg p-4 transition-all ${
      alert.triggeredAt ? 'border-yellow-500/50' : 
      !alert.enabled ? 'border-gray-700 opacity-60' : 
      isClose ? 'border-orange-500/50' : 'border-gray-700'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-semibold text-lg">{alert.tokenPair}</span>
            {getStatusBadge()}
          </div>
          {getCategoryBadge()}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowChart(!showChart)}
            className={`p-1.5 hover:bg-gray-700 rounded-lg transition-colors ${showChart ? 'text-[#00F0FF] bg-gray-700' : 'text-gray-400 hover:text-white'}`}
            title="Toggle chart"
          >
            <BarChart2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowFullChart(true)}
            className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Full screen chart"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Edit alert"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleToggle}
            className={`p-1.5 hover:bg-gray-700 rounded-lg transition-colors ${alert.enabled ? 'text-[#00F0FF]' : 'text-gray-500'}`}
            title={alert.enabled ? 'Disable alert' : 'Enable alert'}
          >
            {alert.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </button>
          {alert.triggeredAt && (
            <button
              onClick={handleReset}
              className="p-1.5 hover:bg-gray-700 rounded-lg text-yellow-400 hover:text-yellow-300 transition-colors"
              title="Reset alert"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="p-1.5 hover:bg-gray-700 rounded-lg text-red-400 hover:text-red-300 transition-colors"
            title="Delete alert"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <span className="text-gray-400 text-xs block mb-1">Current Price</span>
          <span className="text-white text-xl font-bold">${formatPrice(alert.currentPrice)}</span>
        </div>
        <div>
          <span className="text-gray-400 text-xs block mb-1">Target Price</span>
          <span className={`text-xl font-bold ${getConditionColor()}`}>
            ${formatPrice(alert.targetPrice)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`flex items-center gap-1 text-sm ${getConditionColor()}`}>
          {getConditionIcon()}
          {alert.condition === 'above' && 'Alert when price goes above'}
          {alert.condition === 'below' && 'Alert when price goes below'}
          {alert.condition === 'crosses' && 'Alert when price crosses'}
        </span>
      </div>

      {/* Progress bar showing distance to target */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Distance to target</span>
          <span className={priceDistance > 0 ? 'text-green-400' : 'text-red-400'}>
            {priceDistance > 0 ? '+' : ''}{priceDistance.toFixed(2)}%
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${
              Math.abs(priceDistance) < 1 ? 'bg-orange-500' :
              priceDistance > 0 ? 'bg-green-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(5, 100 - Math.abs(priceDistance) * 5))}%` }}
          />
        </div>
      </div>

      {/* Inline chart */}
      {showChart && (
        <div className="mb-3 border-t border-gray-700 pt-3">
          <TokenPriceChart
            tokenPair={alert.tokenPair}
            targetPrice={alert.targetPrice}
            currentPrice={alert.currentPrice}
          />
        </div>
      )}

      {alert.note && (
        <div className="text-gray-400 text-sm italic border-t border-gray-700 pt-2 mt-2">
          "{alert.note}"
        </div>
      )}

      {alert.triggeredAt && (
        <div className="text-yellow-400 text-xs mt-2">
          Triggered: {new Date(alert.triggeredAt).toLocaleString()}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 mt-2 pt-2 border-t border-gray-700">
        <span>Created: {new Date(alert.createdAt).toLocaleDateString()}</span>
        <div className="flex items-center gap-2">
          {alert.repeatAlert && <Badge variant="outline" className="text-xs">Repeating</Badge>}
          <span className="text-gray-600">{alert.network}</span>
        </div>
      </div>
    </div>
  );
};
