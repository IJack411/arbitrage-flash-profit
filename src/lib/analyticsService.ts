import { TradeRecord, EquityPoint, DrawdownPeriod, StreakData, RiskMetrics, StrategyPerformance, BenchmarkData } from '@/types/analytics';

export class AnalyticsService {
  static calculateEquityCurve(trades: TradeRecord[], initialCapital: number): EquityPoint[] {
    const sorted = [...trades].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let equity = initialCapital;
    let peak = initialCapital;
    const curve: EquityPoint[] = [{ timestamp: new Date(sorted[0]?.timestamp.getTime() - 86400000 || Date.now()), equity: initialCapital, drawdown: 0, drawdownPercent: 0 }];
    
    for (const trade of sorted) {
      equity += trade.netProfit;
      peak = Math.max(peak, equity);
      const drawdown = peak - equity;
      curve.push({ timestamp: trade.timestamp, equity, drawdown, drawdownPercent: (drawdown / peak) * 100 });
    }
    return curve;
  }

  static calculateDrawdowns(equityCurve: EquityPoint[]): DrawdownPeriod[] {
    const drawdowns: DrawdownPeriod[] = [];
    let inDrawdown = false;
    let currentDrawdown: Partial<DrawdownPeriod> = {};
    
    for (let i = 1; i < equityCurve.length; i++) {
      const point = equityCurve[i];
      if (point.drawdownPercent > 0 && !inDrawdown) {
        inDrawdown = true;
        currentDrawdown = { startDate: point.timestamp, peakEquity: equityCurve[i-1].equity, troughEquity: point.equity, drawdownPercent: point.drawdownPercent };
      } else if (inDrawdown) {
        if (point.drawdownPercent === 0) {
          currentDrawdown.endDate = point.timestamp;
          currentDrawdown.duration = (point.timestamp.getTime() - currentDrawdown.startDate!.getTime()) / 86400000;
          currentDrawdown.recovered = true;
          drawdowns.push(currentDrawdown as DrawdownPeriod);
          inDrawdown = false;
        } else if (point.drawdownPercent > currentDrawdown.drawdownPercent!) {
          currentDrawdown.troughEquity = point.equity;
          currentDrawdown.drawdownPercent = point.drawdownPercent;
        }
      }
    }
    if (inDrawdown) {
      currentDrawdown.endDate = null;
      currentDrawdown.recovered = false;
      currentDrawdown.duration = (Date.now() - currentDrawdown.startDate!.getTime()) / 86400000;
      drawdowns.push(currentDrawdown as DrawdownPeriod);
    }
    return drawdowns;
  }

  static calculateStreaks(trades: TradeRecord[]): StreakData[] {
    const sorted = [...trades].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const streaks: StreakData[] = [];
    if (sorted.length === 0) return streaks;
    
    let current: StreakData = { type: sorted[0].status === 'win' ? 'win' : 'loss', count: 1, startDate: sorted[0].timestamp, endDate: sorted[0].timestamp, totalProfit: sorted[0].netProfit };
    
    for (let i = 1; i < sorted.length; i++) {
      const trade = sorted[i];
      const tradeType = trade.status === 'win' ? 'win' : 'loss';
      if (tradeType === current.type) {
        current.count++;
        current.endDate = trade.timestamp;
        current.totalProfit += trade.netProfit;
      } else {
        if (current.count >= 2) streaks.push(current);
        current = { type: tradeType, count: 1, startDate: trade.timestamp, endDate: trade.timestamp, totalProfit: trade.netProfit };
      }
    }
    if (current.count >= 2) streaks.push(current);
    return streaks;
  }

  static calculateRiskMetrics(trades: TradeRecord[], riskFreeRate = 0.05): RiskMetrics {
    const returns = trades.map(t => t.profitPercent / 100);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length || 0;
    const volatility = Math.sqrt(variance) * Math.sqrt(252);
    const negReturns = returns.filter(r => r < 0);
    const downVar = negReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negReturns.length || 0;
    const downVol = Math.sqrt(downVar) * Math.sqrt(252);
    const annualReturn = avgReturn * 252;
    const sharpe = volatility > 0 ? (annualReturn - riskFreeRate) / volatility : 0;
    const sortino = downVol > 0 ? (annualReturn - riskFreeRate) / downVol : 0;
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const var95 = sortedReturns[Math.floor(returns.length * 0.05)] || 0;
    const var99 = sortedReturns[Math.floor(returns.length * 0.01)] || 0;
    
    return { sharpeRatio: sharpe, sortinoRatio: sortino, calmarRatio: 0, maxDrawdown: 0, avgDrawdown: 0, volatility: volatility * 100, var95: var95 * 100, var99: var99 * 100, beta: 1, alpha: annualReturn * 100 };
  }
}
