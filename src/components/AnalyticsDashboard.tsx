import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Download, TrendingUp, TrendingDown, DollarSign, Activity, Percent, Calendar } from 'lucide-react';

interface ProfitPoint {
  date: string;
  profit: number;
  trades: number;
  gasUsed: number;
}

interface DexPairPoint {
  pair: string;
  successRate: number;
  profit: number;
  trades: number;
}

interface GasPoint {
  date: string;
  gasUsed: number;
  gasSaved: number;
  efficiency: number;
}

export function AnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState('7d');
  const [profitData, setProfitData] = useState<ProfitPoint[]>([]);
  const [dexPairData, setDexPairData] = useState<DexPairPoint[]>([]);
  const [gasData, setGasData] = useState<GasPoint[]>([]);
  const [metrics, setMetrics] = useState({
    totalProfit: 0,
    totalTrades: 0,
    successRate: 0,
    avgROI: 0,
    totalGasSaved: 0,
    bestPair: '',
  });

  const loadAnalytics = useCallback(async () => {
    // Load profit data
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const mockProfitData = Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
      profit: Math.random() * 5000 + 1000,
      trades: Math.floor(Math.random() * 50) + 10,
      gasUsed: Math.random() * 0.5 + 0.1,
    }));
    setProfitData(mockProfitData);

    // Load DEX pair performance
    setDexPairData([
      { pair: 'ETH/USDC', successRate: 92, profit: 45000, trades: 450 },
      { pair: 'WBTC/ETH', successRate: 88, profit: 38000, trades: 320 },
      { pair: 'LINK/ETH', successRate: 85, profit: 28000, trades: 280 },
      { pair: 'UNI/USDC', successRate: 90, profit: 25000, trades: 250 },
      { pair: 'AAVE/ETH', successRate: 87, profit: 22000, trades: 200 },
    ]);

    // Load gas optimization data
    setGasData(mockProfitData.map(d => ({
      date: d.date,
      gasUsed: d.gasUsed,
      gasSaved: Math.random() * 0.2 + 0.05,
      efficiency: Math.random() * 30 + 70,
    })));

    // Calculate metrics
    const totalProfit = mockProfitData.reduce((sum, d) => sum + d.profit, 0);
    const totalTrades = mockProfitData.reduce((sum, d) => sum + d.trades, 0);
    setMetrics({
      totalProfit,
      totalTrades,
      successRate: 89.5,
      avgROI: 12.8,
      totalGasSaved: 4.5,
      bestPair: 'ETH/USDC',
    });
  }, [timeRange]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const exportData = (format: 'csv' | 'json') => {
    const data = {
      timeRange,
      metrics,
      profitHistory: profitData,
      dexPerformance: dexPairData,
      gasOptimization: gasData,
      generatedAt: new Date().toISOString(),
    };

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arbitrage-analytics-${Date.now()}.json`;
      a.click();
    } else {
      // CSV export
      const csv = [
        ['Date', 'Profit', 'Trades', 'Gas Used'],
        ...profitData.map(d => [d.date, d.profit, d.trades, d.gasUsed]),
      ].map(row => row.join(',')).join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arbitrage-analytics-${Date.now()}.csv`;
      a.click();
    }
  };

  const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Analytics Dashboard</h2>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => exportData('csv')} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={() => exportData('json')} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">${metrics.totalProfit.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{metrics.totalTrades}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-purple-500" />
              <span className="text-2xl font-bold">{metrics.successRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg ROI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{metrics.avgROI}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Gas Saved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              <span className="text-2xl font-bold">{metrics.totalGasSaved} ETH</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Best Pair</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              <span className="text-2xl font-bold">{metrics.bestPair}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profit" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profit">Profit Analysis</TabsTrigger>
          <TabsTrigger value="pairs">DEX Pairs</TabsTrigger>
          <TabsTrigger value="gas">Gas Optimization</TabsTrigger>
          <TabsTrigger value="tax">Tax Report</TabsTrigger>
        </TabsList>

        <TabsContent value="profit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profit Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={profitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="profit" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pairs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>DEX Pair Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={dexPairData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="pair" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="successRate" fill="#10b981" />
                  <Bar dataKey="trades" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gas Usage Optimization</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={gasData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="gasUsed" stroke="#ef4444" />
                  <Line type="monotone" dataKey="gasSaved" stroke="#10b981" />
                  <Line type="monotone" dataKey="efficiency" stroke="#3b82f6" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tax Report Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Realized Gains</p>
                  <p className="text-2xl font-bold text-green-500">+${(metrics.totalProfit * 0.8).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Realized Losses</p>
                  <p className="text-2xl font-bold text-red-500">-${(metrics.totalProfit * 0.2).toLocaleString()}</p>
                </div>
              </div>
              <Button className="w-full">Generate Full Tax Report (Form 8949)</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}