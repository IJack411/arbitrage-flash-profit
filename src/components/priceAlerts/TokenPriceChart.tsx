import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  TrendingUp, TrendingDown, Clock, ZoomIn, ZoomOut, 
  Maximize2, Minus, RotateCcw, MousePointer, Pencil,
  Target, X, ChevronDown, BarChart3
} from 'lucide-react';
import { TOKEN_PAIRS, TokenPairInfo } from '@/lib/priceAlertService';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DrawnLine {
  id: string;
  y: number;
  price: number;
  color: string;
  label: string;
  type: 'support' | 'resistance' | 'custom';
}

const LINE_SWATCH_CLASSES: Record<DrawnLine['type'], string> = {
  support: 'bg-green-400',
  resistance: 'bg-red-400',
  custom: 'bg-[#00F0FF]',
};

interface TokenPriceChartProps {
  tokenPair: string;
  targetPrice?: number;
  currentPrice?: number;
  onClose?: () => void;
  isModal?: boolean;
}

type Timeframe = '1H' | '4H' | '1D' | '1W';

const TIMEFRAME_CONFIG: Record<Timeframe, { candles: number; intervalMs: number; label: string }> = {
  '1H': { candles: 60, intervalMs: 60000, label: '1 Hour' },
  '4H': { candles: 96, intervalMs: 240000, label: '4 Hours' },
  '1D': { candles: 90, intervalMs: 86400000, label: '1 Day' },
  '1W': { candles: 52, intervalMs: 604800000, label: '1 Week' },
};

export const TokenPriceChart: React.FC<TokenPriceChartProps> = ({
  tokenPair,
  targetPrice,
  currentPrice,
  onClose,
  isModal = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<'support' | 'resistance' | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [showVolume, setShowVolume] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);

  const pairInfo = TOKEN_PAIRS[tokenPair];

  // Generate historical candle data
  const generateCandleData = useCallback((pair: string, tf: Timeframe): Candle[] => {
    const config = TIMEFRAME_CONFIG[tf];
    const info = TOKEN_PAIRS[pair];
    if (!info) return [];

    const basePrice = currentPrice || info.basePrice;
    const volatility = info.volatility;
    const now = Date.now();
    const candleData: Candle[] = [];

    let price = basePrice * (0.85 + Math.random() * 0.3); // Start from a historical point

    for (let i = config.candles - 1; i >= 0; i--) {
      const timestamp = now - (i * config.intervalMs);
      
      // Generate realistic OHLC data
      const trend = Math.sin(i / 10) * 0.02; // Add some trend
      const randomWalk = (Math.random() - 0.5) * volatility * 2;
      const change = trend + randomWalk;
      
      const open = price;
      const close = price * (1 + change);
      const highExtra = Math.random() * volatility * price;
      const lowExtra = Math.random() * volatility * price;
      const high = Math.max(open, close) + highExtra;
      const low = Math.min(open, close) - lowExtra;
      
      // Volume with some variation
      const baseVolume = 1000000 + Math.random() * 5000000;
      const volumeMultiplier = 1 + Math.abs(change) * 10; // Higher volume on bigger moves
      const volume = baseVolume * volumeMultiplier;

      candleData.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      });

      price = close;
    }

    // Adjust last candle to match current price
    if (candleData.length > 0 && currentPrice) {
      const lastCandle = candleData[candleData.length - 1];
      lastCandle.close = currentPrice;
      lastCandle.high = Math.max(lastCandle.high, currentPrice);
      lastCandle.low = Math.min(lastCandle.low, currentPrice);
    }

    return candleData;
  }, [currentPrice]);

  // Generate candle data when timeframe or pair changes
  useEffect(() => {
    const data = generateCandleData(tokenPair, timeframe);
    setCandles(data);
  }, [tokenPair, timeframe, generateCandleData]);

  // Calculate price range
  const priceRange = useMemo(() => {
    if (candles.length === 0) return { min: 0, max: 0, range: 0 };
    
    let min = Infinity;
    let max = -Infinity;
    
    candles.forEach(c => {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    });

    // Include target price in range if provided
    if (targetPrice) {
      min = Math.min(min, targetPrice * 0.98);
      max = Math.max(max, targetPrice * 1.02);
    }

    // Add padding
    const range = max - min;
    min -= range * 0.05;
    max += range * 0.05;

    return { min, max, range: max - min };
  }, [candles, targetPrice]);

  // Calculate volume range
  const volumeRange = useMemo(() => {
    if (candles.length === 0) return { max: 0 };
    const max = Math.max(...candles.map(c => c.volume));
    return { max };
  }, [candles]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const chartHeight = showVolume ? height * 0.75 : height * 0.9;
    const volumeHeight = showVolume ? height * 0.2 : 0;
    const volumeTop = chartHeight + 10;
    const padding = { left: 60, right: 20, top: 20, bottom: showVolume ? 50 : 30 };

    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 0.5;

    // Horizontal grid lines (price levels)
    const priceSteps = 6;
    for (let i = 0; i <= priceSteps; i++) {
      const y = padding.top + (chartHeight - padding.top - padding.bottom) * (i / priceSteps);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Price labels
      const price = priceRange.max - (priceRange.range * (i / priceSteps));
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatPrice(price), padding.left - 5, y + 3);
    }

    // Calculate candle dimensions
    const chartWidth = width - padding.left - padding.right;
    const candleWidth = (chartWidth / candles.length) * zoomLevel;
    const candleGap = candleWidth * 0.2;
    const bodyWidth = candleWidth - candleGap;

    // Helper function to convert price to Y coordinate
    const priceToY = (price: number): number => {
      const ratio = (priceRange.max - price) / priceRange.range;
      return padding.top + ratio * (chartHeight - padding.top - padding.bottom);
    };

    // Helper function to convert volume to Y coordinate
    const volumeToY = (volume: number): number => {
      const ratio = volume / volumeRange.max;
      return volumeTop + volumeHeight - (ratio * volumeHeight * 0.9);
    };

    // Draw candles
    candles.forEach((candle, i) => {
      const x = padding.left + (i * candleWidth) + candleGap / 2;
      const isGreen = candle.close >= candle.open;
      
      // Candle body
      const bodyTop = priceToY(Math.max(candle.open, candle.close));
      const bodyBottom = priceToY(Math.min(candle.open, candle.close));
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);

      ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
      ctx.fillRect(x, bodyTop, bodyWidth, bodyHeight);

      // Wicks
      ctx.strokeStyle = isGreen ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1;
      const wickX = x + bodyWidth / 2;
      
      // Upper wick
      ctx.beginPath();
      ctx.moveTo(wickX, priceToY(candle.high));
      ctx.lineTo(wickX, bodyTop);
      ctx.stroke();

      // Lower wick
      ctx.beginPath();
      ctx.moveTo(wickX, bodyBottom);
      ctx.lineTo(wickX, priceToY(candle.low));
      ctx.stroke();

      // Volume bars
      if (showVolume) {
        ctx.fillStyle = isGreen ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
        const volY = volumeToY(candle.volume);
        const volHeight = volumeTop + volumeHeight - volY;
        ctx.fillRect(x, volY, bodyWidth, volHeight);
      }
    });

    // Draw target price line
    if (targetPrice && targetPrice >= priceRange.min && targetPrice <= priceRange.max) {
      const y = priceToY(targetPrice);
      
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Target price label
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(width - padding.right - 80, y - 10, 80, 20);
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Target: ${formatPrice(targetPrice)}`, width - padding.right - 40, y + 4);
    }

    // Draw current price line
    if (currentPrice && currentPrice >= priceRange.min && currentPrice <= priceRange.max) {
      const y = priceToY(currentPrice);
      
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current price label
      ctx.fillStyle = '#00F0FF';
      ctx.fillRect(0, y - 10, padding.left - 5, 20);
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatPrice(currentPrice), (padding.left - 5) / 2, y + 4);
    }

    // Draw user-drawn lines
    drawnLines.forEach(line => {
      if (line.price >= priceRange.min && line.price <= priceRange.max) {
        const y = priceToY(line.price);
        
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Line label
        ctx.fillStyle = line.color;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${line.label}: ${formatPrice(line.price)}`, padding.left + 5, y - 5);
      }
    });

    // Draw crosshair and tooltip if hovering
    if (mousePos && hoveredCandle) {
      // Vertical line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, padding.top);
      ctx.lineTo(mousePos.x, chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(padding.left, mousePos.y);
      ctx.lineTo(width - padding.right, mousePos.y);
      ctx.stroke();
    }

    // Draw time labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const labelInterval = Math.ceil(candles.length / 6);
    candles.forEach((candle, i) => {
      if (i % labelInterval === 0) {
        const x = padding.left + (i * candleWidth) + bodyWidth / 2;
        const date = new Date(candle.timestamp);
        let label = '';
        if (timeframe === '1H' || timeframe === '4H') {
          label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        ctx.fillText(label, x, height - 10);
      }
    });

  }, [candles, priceRange, volumeRange, targetPrice, currentPrice, drawnLines, showVolume, zoomLevel, mousePos, hoveredCandle, timeframe]);

  // Handle mouse events for drawing and tooltips
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    // Find hovered candle
    const padding = { left: 60, right: 20 };
    const chartWidth = rect.width - padding.left - padding.right;
    const candleWidth = (chartWidth / candles.length) * zoomLevel;
    const candleIndex = Math.floor((x - padding.left) / candleWidth);

    if (candleIndex >= 0 && candleIndex < candles.length) {
      setHoveredCandle(candles[candleIndex]);
    } else {
      setHoveredCandle(null);
    }
  }, [candles, zoomLevel]);

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoveredCandle(null);
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    const chartHeight = showVolume ? height * 0.75 : height * 0.9;
    const padding = { top: 20, bottom: showVolume ? 50 : 30 };

    // Convert Y to price
    const ratio = (y - padding.top) / (chartHeight - padding.top - padding.bottom);
    const price = priceRange.max - (ratio * priceRange.range);

    const newLine: DrawnLine = {
      id: `line-${Date.now()}`,
      y,
      price,
      color: drawMode === 'support' ? '#22c55e' : '#ef4444',
      label: drawMode === 'support' ? 'Support' : 'Resistance',
      type: drawMode,
    };

    setDrawnLines(prev => [...prev, newLine]);
    setDrawMode(null);
  }, [drawMode, priceRange, showVolume]);

  const removeLine = (id: string) => {
    setDrawnLines(prev => prev.filter(l => l.id !== id));
  };

  const clearAllLines = () => {
    setDrawnLines([]);
  };

  const formatPrice = (price: number): string => {
    if (price < 0.00001) return price.toExponential(4);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000000) return `${(volume / 1000000000).toFixed(2)}B`;
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(2)}K`;
    return volume.toFixed(0);
  };

  // Calculate stats
  const stats = useMemo(() => {
    if (candles.length === 0) return null;
    const first = candles[0];
    const last = candles[candles.length - 1];
    const change = ((last.close - first.open) / first.open) * 100;
    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
    return { change, high, low, avgVolume };
  }, [candles]);

  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg ${isModal ? 'p-6' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-white font-bold text-lg">{tokenPair}</h3>
          {pairInfo && (
            <span className="text-gray-400 text-sm capitalize">{pairInfo.category}</span>
          )}
          {stats && (
            <span className={`flex items-center gap-1 text-sm font-medium ${stats.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              title="Close chart"
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        {/* Timeframe selector */}
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1">
          {(Object.keys(TIMEFRAME_CONFIG) as Timeframe[]).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-[#00F0FF] text-gray-900'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Drawing tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawMode(drawMode === 'support' ? null : 'support')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              drawMode === 'support'
                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Minus className="h-4 w-4" />
            Support
          </button>
          <button
            onClick={() => setDrawMode(drawMode === 'resistance' ? null : 'resistance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              drawMode === 'resistance'
                ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Minus className="h-4 w-4" />
            Resistance
          </button>
          {drawnLines.length > 0 && (
            <button
              onClick={clearAllLines}
              title="Clear all drawn lines"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        {/* View controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showVolume
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Volume
          </button>
          <button
            onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
            title="Zoom out"
            className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoomLevel(z => Math.min(2, z + 0.25))}
            title="Zoom in"
            className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Draw mode indicator */}
      {drawMode && (
        <div className={`mb-4 p-3 rounded-lg border ${
          drawMode === 'support' 
            ? 'bg-green-500/10 border-green-500/30 text-green-400' 
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            <span className="text-sm font-medium">
              Click on the chart to draw a {drawMode} line
            </span>
            <button
              onClick={() => setDrawMode(null)}
              className="ml-auto text-sm underline hover:no-underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Chart */}
      <div 
        ref={containerRef} 
        className={`relative ${isModal ? 'h-[400px]' : 'h-[300px]'} w-full`}
      >
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${drawMode ? 'cursor-crosshair' : 'cursor-default'}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
        />

        {/* Tooltip */}
        {hoveredCandle && mousePos && (
          <div className="absolute right-2 top-2 bg-gray-900 border border-gray-600 rounded-lg p-3 shadow-xl pointer-events-none z-10">
            <div className="text-gray-400 text-xs mb-2">
              {new Date(hoveredCandle.timestamp).toLocaleString()}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-gray-400">Open:</span>
              <span className="text-white font-medium">${formatPrice(hoveredCandle.open)}</span>
              <span className="text-gray-400">High:</span>
              <span className="text-green-400 font-medium">${formatPrice(hoveredCandle.high)}</span>
              <span className="text-gray-400">Low:</span>
              <span className="text-red-400 font-medium">${formatPrice(hoveredCandle.low)}</span>
              <span className="text-gray-400">Close:</span>
              <span className={`font-medium ${hoveredCandle.close >= hoveredCandle.open ? 'text-green-400' : 'text-red-400'}`}>
                ${formatPrice(hoveredCandle.close)}
              </span>
              <span className="text-gray-400">Volume:</span>
              <span className="text-purple-400 font-medium">{formatVolume(hoveredCandle.volume)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="text-gray-400 text-xs mb-1">Period High</div>
            <div className="text-green-400 font-bold">${formatPrice(stats.high)}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="text-gray-400 text-xs mb-1">Period Low</div>
            <div className="text-red-400 font-bold">${formatPrice(stats.low)}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="text-gray-400 text-xs mb-1">Avg Volume</div>
            <div className="text-purple-400 font-bold">{formatVolume(stats.avgVolume)}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="text-gray-400 text-xs mb-1">Change</div>
            <div className={`font-bold ${stats.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Drawn lines list */}
      {drawnLines.length > 0 && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-white font-medium text-sm">Drawn Lines</h4>
            <span className="text-gray-400 text-xs">{drawnLines.length} line(s)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {drawnLines.map(line => (
              <div
                key={line.id}
                className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-1.5"
              >
                <div 
                  className={`w-3 h-0.5 rounded ${LINE_SWATCH_CLASSES[line.type] ?? 'bg-gray-400'}`}
                />
                <span className="text-white text-sm">{line.label}</span>
                <span className="text-gray-400 text-sm">${formatPrice(line.price)}</span>
                <button
                  onClick={() => removeLine(line.id)}
                  title={`Remove ${line.label} line`}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Target price info */}
      {targetPrice && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <Target className="h-5 w-5 text-amber-400" />
            <div>
              <div className="text-amber-400 font-medium">Alert Target Price</div>
              <div className="text-white text-lg font-bold">${formatPrice(targetPrice)}</div>
            </div>
            {currentPrice && (
              <div className="ml-auto text-right">
                <div className="text-gray-400 text-xs">Distance</div>
                <div className={`font-bold ${currentPrice > targetPrice ? 'text-green-400' : 'text-red-400'}`}>
                  {((currentPrice - targetPrice) / targetPrice * 100).toFixed(2)}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
