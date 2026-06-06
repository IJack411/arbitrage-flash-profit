import { saveIndicator } from './harvester.mjs';

const rsiData = {
  "indicator_or_scanner_name": "Relative Strength Index (RSI)",
  "category": "Momentum Oscillator",
  "core_logic_summary": "Measures the speed and change of price movements to identify overbought or oversold conditions.",
  "mathematical_foundation": "RSI = 100 - [100 / (1 + RS)], where RS = Average Gain / Average Loss over N periods (typically 14).",
  "inputs_and_parameters": ["Lookback Period (N, default 14)", "Overbought Threshold (default 70)", "Oversold Threshold (default 30)"],
  "implementation_details": "Uses smoothed moving average (SMMA) or Wilder's smoothing for the average gain and loss calculations.",
  "strengths": ["Clear overbought/oversold levels", "Divergence detection", "Trend strength validation"],
  "weaknesses": ["Lagging indicator", "Can stay overbought/oversold for long periods in strong trends", "False signals in choppy markets"],
  "ideal_market_conditions": ["Ranging markets", "Late-stage trends for reversal detection"],
  "related_indicators": ["Stochastic Oscillator", "MACD", "CCI"],
  "source_types": ["documentation", "articles"]
};

const macdData = {
  "indicator_or_scanner_name": "MACD (Moving Average Convergence Divergence)",
  "category": "Trend-Following Momentum",
  "core_logic_summary": "Shows the relationship between two moving averages of an asset’s price, typically using a signal line for triggers.",
  "mathematical_foundation": "MACD Line = (12-period EMA - 26-period EMA). Signal Line = 9-period EMA of MACD Line. Histogram = MACD Line - Signal Line.",
  "inputs_and_parameters": ["Fast EMA (default 12)", "Slow EMA (default 26)", "Signal EMA (default 9)"],
  "implementation_details": "Standard implementation uses Exponential Moving Averages (EMA) to give more weight to recent prices.",
  "strengths": ["Identifies trend changes", "Combines trend and momentum", "Highly customizable"],
  "weaknesses": ["Prone to whipsaws in sideways markets", "Lagging in fast-moving markets"],
  "ideal_market_conditions": ["Trending markets", "High volatility"],
  "related_indicators": ["RSI", "Bollinger Bands", "ADX"],
  "source_types": ["documentation", "research"]
};

console.log("Starting test harvest for ScannerHarvester-X...");
saveIndicator(rsiData);
saveIndicator(macdData);
console.log("Test harvest complete.");
