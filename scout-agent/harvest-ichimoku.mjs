import { saveIndicator } from './harvester.mjs';

const ichimokuData = {
  "indicator_or_scanner_name": "Ichimoku Cloud (Ichimoku Kinko Hyo)",
  "category": "Trend & Momentum Oscillator",
  "core_logic_summary": "A comprehensive indicator that defines support and resistance, identifies trend direction, gauges momentum, and provides trading signals. The 'Cloud' (Kumo) is the core feature, formed by the space between two moving averages projected forward.",
  "mathematical_foundation": "Tenkan-sen (9 per): (9-period high + 9-period low)/2. Kijun-sen (26 per): (26-period high + 26-period low)/2. Senkou Span A (Leading Span A): (Tenkan-sen + Kijun-sen)/2 (plotted 26 periods ahead). Senkou Span B (Leading Span B): (52-period high + 52-period low)/2 (plotted 26 periods ahead). Chikou Span (Lagging Span): Current close plotted 26 periods back.",
  "inputs_and_parameters": ["Tenkan-sen Period (default 9)", "Kijun-sen Period (default 26)", "Senkou Span B Period (default 52)", "Displacement (default 26)"],
  "implementation_details": "Requires high/low price data rather than just close prices. The cloud (Kumo) changes color based on whether Senkou Span A is above or below Senkou Span B.",
  "strengths": ["All-in-one market view", "Future support/resistance projection", "Reduced lag compared to standard moving averages"],
  "weaknesses": ["Visually complex/cluttered", "Historical data dependency", "False signals in ranging/choppy markets"],
  "ideal_market_conditions": ["Strongly trending markets", "Breakout identification"],
  "related_indicators": ["Moving Averages", "Bollinger Bands", "ADX"],
  "source_types": ["documentation", "research", "articles"]
};

console.log("Executing ScannerHarvester-X Mission: Ichimoku Cloud...");
saveIndicator(ichimokuData);
console.log("Mission Successful.");
