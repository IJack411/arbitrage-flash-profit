import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  ShieldAlert,
  ShieldX,
  Brain,
  Activity,
  Clock,
  Target,
  Zap,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  ChevronRight,
  RefreshCw,
  BarChart3,
  LineChart,
  PieChart,
  Calendar,
  DollarSign,
  Sparkles,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { mlAnalyticsService } from '@/lib/mlAnalyticsService';
import {
  MLAnalysisSummary,
  TrendDirection,
  ThreatLevel,
  THREAT_LEVEL_CONFIG,
  ANOMALY_TYPE_INFO,
  DetectedAnomaly,
  SecurityThreat,
  ProactiveAlertRecommendation,
  PredictedBalance,
} from '@/types/mlAnalytics';
import {
  BalanceDataPoint,
  TransactionDataPoint,
  GasDataPoint,
} from '@/types/alertSuggestions';
import { useToast } from '@/hooks/use-toast';

// Trend Direction Icon Component
const TrendIcon: React.FC<{ direction: TrendDirection; className?: string }> = ({ direction, className }) => {
  switch (direction) {
    case 'strongly_increasing':
    case 'increasing':
      return <TrendingUp className={className} />;
    case 'strongly_decreasing':
    case 'decreasing':
      return <TrendingDown className={className} />;
    default:
      return <Minus className={className} />;
  }
};

// Threat Level Icon Component
const ThreatLevelIcon: React.FC<{ level: ThreatLevel; className?: string }> = ({ level, className }) => {
  switch (level) {
    case 'critical':
      return <ShieldX className={className} />;
    case 'high':
      return <ShieldAlert className={className} />;
    case 'medium':
      return <AlertTriangle className={className} />;
    case 'low':
      return <Info className={className} />;
    default:
      return <Shield className={className} />;
  }
};

// Trend Color Helper
const getTrendColor = (direction: TrendDirection): string => {
  switch (direction) {
    case 'strongly_increasing':
      return 'text-green-400';
    case 'increasing':
      return 'text-green-300';
    case 'strongly_decreasing':
      return 'text-red-400';
    case 'decreasing':
      return 'text-red-300';
    default:
      return 'text-slate-400';
  }
};

// Anomaly Card Component
const AnomalyCard: React.FC<{ anomaly: DetectedAnomaly }> = ({ anomaly }) => {
  const typeInfo = ANOMALY_TYPE_INFO[anomaly.type];
  const severityColor = anomaly.severity > 70 ? 'text-red-400' : anomaly.severity > 40 ? 'text-yellow-400' : 'text-blue-400';
  const severityBg = anomaly.severity > 70 ? 'bg-red-500/10' : anomaly.severity > 40 ? 'bg-yellow-500/10' : 'bg-blue-500/10';

  return (
    <div className={`p-3 rounded-lg ${severityBg} border border-slate-700`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertCircle className={`h-4 w-4 ${severityColor}`} />
          <span className="font-medium text-sm">{typeInfo.label}</span>
        </div>
        <Badge variant="outline" className={severityColor}>
          {anomaly.severity.toFixed(0)}%
        </Badge>
      </div>
      <p className="text-xs text-slate-400 mb-2">{anomaly.description}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {new Date(anomaly.timestamp).toLocaleString()}
        </span>
        {anomaly.suggestedAction && (
          <span className="text-cyan-400 truncate max-w-[200px]">
            {anomaly.suggestedAction}
          </span>
        )}
      </div>
    </div>
  );
};

// Security Threat Card Component
const ThreatCard: React.FC<{ threat: SecurityThreat }> = ({ threat }) => {
  const config = THREAT_LEVEL_CONFIG[threat.severity];

  return (
    <div className={`p-4 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <ThreatLevelIcon level={threat.severity} className={`h-5 w-5 ${config.color}`} />
          <span className="font-medium">{threat.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
        </div>
        <Badge variant="outline" className={config.color}>
          {config.label}
        </Badge>
      </div>
      <p className="text-sm text-slate-300 mb-3">{threat.description}</p>
      <div className="space-y-2">
        {threat.evidence.slice(0, 2).map((ev, i) => (
          <div key={i} className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded">
            {ev.description}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <span>Occurrences: {threat.occurrenceCount}</span>
        <span>First: {new Date(threat.firstDetected).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

// Recommendation Card Component
const RecommendationCard: React.FC<{ 
  recommendation: ProactiveAlertRecommendation;
  onApply?: () => void;
}> = ({ recommendation, onApply }) => {
  const priorityColors = {
    critical: 'border-red-500/50 bg-red-500/10',
    high: 'border-orange-500/50 bg-orange-500/10',
    medium: 'border-yellow-500/50 bg-yellow-500/10',
    low: 'border-blue-500/50 bg-blue-500/10',
  };

  const priorityTextColors = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-blue-400',
  };

  return (
    <Card className={`border ${priorityColors[recommendation.priority]}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className={`h-4 w-4 ${priorityTextColors[recommendation.priority]}`} />
            <span className="font-medium">{recommendation.title}</span>
          </div>
          <Badge variant="outline" className={priorityTextColors[recommendation.priority]}>
            {recommendation.priority}
          </Badge>
        </div>
        <p className="text-sm text-slate-400 mb-3">{recommendation.description}</p>
        
        <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
          <p className="text-xs text-slate-500 mb-1">Reasoning</p>
          <p className="text-sm text-slate-300">{recommendation.reasoning}</p>
        </div>

        {recommendation.suggestedConfig && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {recommendation.suggestedConfig.thresholdValue !== undefined && (
              <div className="bg-cyan-500/10 rounded p-2">
                <p className="text-xs text-cyan-400">Suggested Threshold</p>
                <p className="font-mono text-sm">{recommendation.suggestedConfig.thresholdValue.toFixed(4)} ETH</p>
              </div>
            )}
            {recommendation.suggestedConfig.thresholdPercentage !== undefined && (
              <div className="bg-cyan-500/10 rounded p-2">
                <p className="text-xs text-cyan-400">Suggested %</p>
                <p className="font-mono text-sm">{recommendation.suggestedConfig.thresholdPercentage.toFixed(1)}%</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {recommendation.basedOn.map((basis, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {basis.type.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
          {onApply && (
            <Button size="sm" onClick={onApply} className="bg-cyan-600 hover:bg-cyan-700">
              Apply
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Prediction Chart Component (Simplified visual)
const PredictionChart: React.FC<{ predictions: PredictedBalance[] }> = ({ predictions }) => {
  if (predictions.length === 0) return null;

  const maxValue = Math.max(...predictions.map(p => p.upperBound));
  const minValue = Math.min(...predictions.map(p => p.lowerBound));
  const range = maxValue - minValue || 1;

  // Sample every 24 hours for display
  const sampledPredictions = predictions.filter((_, i) => i % 24 === 0 || i === predictions.length - 1);

  return (
    <div className="h-32 flex items-end gap-1">
      {sampledPredictions.map((pred, i) => {
        const height = ((pred.predicted - minValue) / range) * 100;
        const upperHeight = ((pred.upperBound - minValue) / range) * 100;
        const lowerHeight = ((pred.lowerBound - minValue) / range) * 100;

        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full relative" style={{ height: '100px' }}>
              {/* Confidence interval */}
              <div
                className="absolute w-full bg-cyan-500/20 rounded"
                style={{
                  bottom: `${lowerHeight}%`,
                  height: `${upperHeight - lowerHeight}%`,
                }}
              />
              {/* Predicted value */}
              <div
                className="absolute w-full h-1 bg-cyan-400 rounded"
                style={{ bottom: `${height}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500">
              {new Date(pred.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </div>
        );
      })}
    </div>
  );
};

interface MLInsightsPanelProps {
  walletAddress: string;
  walletName?: string;
  balanceHistory: BalanceDataPoint[];
  transactions: TransactionDataPoint[];
  gasHistory: GasDataPoint[];
  onRecommendationApply?: (recommendation: ProactiveAlertRecommendation) => void;
}

export const MLInsightsPanel: React.FC<MLInsightsPanelProps> = ({
  walletAddress,
  walletName,
  balanceHistory,
  transactions,
  gasHistory,
  onRecommendationApply,
}) => {
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<MLAnalysisSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    // Check for cached analysis
    const cached = mlAnalyticsService.getCachedAnalysis(walletAddress);
    if (cached) {
      setAnalysis(cached);
    }
  }, [walletAddress]);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const result = mlAnalyticsService.performFullAnalysis(
        walletAddress,
        balanceHistory,
        transactions,
        gasHistory
      );
      setAnalysis(result);
      toast({
        title: 'ML Analysis Complete',
        description: `Generated ${result.proactiveRecommendations.length} proactive recommendations`,
      });
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: 'An error occurred during ML analysis',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!analysis) {
    return (
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="py-12 text-center">
          <Brain className="h-16 w-16 mx-auto mb-4 text-slate-500" />
          <h3 className="text-lg font-medium text-white mb-2">ML-Powered Analysis</h3>
          <p className="text-slate-400 mb-4 max-w-md mx-auto">
            Run advanced machine learning analysis to detect anomalies, predict future balances, 
            and identify security threats based on your wallet activity.
          </p>
          <Button
            onClick={runAnalysis}
            disabled={isAnalyzing || balanceHistory.length < 7}
            className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Run ML Analysis
              </>
            )}
          </Button>
          {balanceHistory.length < 7 && (
            <p className="text-xs text-slate-500 mt-2">
              Requires at least 7 data points. Current: {balanceHistory.length}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const threatConfig = THREAT_LEVEL_CONFIG[analysis.securityAnalysis.overallThreatLevel];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 rounded-lg">
            <Brain className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">ML Analysis</h2>
            <p className="text-sm text-slate-400">
              {walletName || `${walletAddress.slice(0, 10)}...`}
            </p>
          </div>
        </div>
        <Button
          onClick={runAnalysis}
          disabled={isAnalyzing}
          variant="outline"
          className="border-slate-600"
        >
          {isAnalyzing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Trend</span>
              <TrendIcon 
                direction={analysis.trendAnalysis.direction} 
                className={`h-5 w-5 ${getTrendColor(analysis.trendAnalysis.direction)}`} 
              />
            </div>
            <p className={`text-lg font-bold capitalize ${getTrendColor(analysis.trendAnalysis.direction)}`}>
              {analysis.trendAnalysis.direction.replace(/_/g, ' ')}
            </p>
            <p className="text-xs text-slate-500">R² = {analysis.trendAnalysis.rSquared.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Anomalies</span>
              <AlertCircle className={`h-5 w-5 ${analysis.anomalyDetection.anomalies.length > 5 ? 'text-red-400' : 'text-yellow-400'}`} />
            </div>
            <p className="text-lg font-bold text-white">
              {analysis.anomalyDetection.anomalies.length}
            </p>
            <p className="text-xs text-slate-500">{analysis.anomalyDetection.anomalyRate.toFixed(1)}% rate</p>
          </CardContent>
        </Card>

        <Card className={`border ${threatConfig.borderColor}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Security</span>
              <ThreatLevelIcon level={analysis.securityAnalysis.overallThreatLevel} className={`h-5 w-5 ${threatConfig.color}`} />
            </div>
            <p className={`text-lg font-bold ${threatConfig.color}`}>
              {threatConfig.label}
            </p>
            <p className="text-xs text-slate-500">Score: {analysis.securityAnalysis.threatScore.toFixed(0)}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Recommendations</span>
              <Sparkles className="h-5 w-5 text-cyan-400" />
            </div>
            <p className="text-lg font-bold text-cyan-400">
              {analysis.proactiveRecommendations.length}
            </p>
            <p className="text-xs text-slate-500">
              {analysis.proactiveRecommendations.filter(r => r.priority === 'high' || r.priority === 'critical').length} high priority
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-800">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="anomalies">
            Anomalies
            {analysis.anomalyDetection.anomalies.length > 0 && (
              <Badge className="ml-2 bg-red-500/20 text-red-400">
                {analysis.anomalyDetection.anomalies.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="predictions">Predictions</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="recommendations">
            Recommendations
            {analysis.proactiveRecommendations.length > 0 && (
              <Badge className="ml-2 bg-cyan-500/20 text-cyan-400">
                {analysis.proactiveRecommendations.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Trend Analysis Card */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-cyan-400" />
                  Trend Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Direction</p>
                    <p className={`font-medium capitalize ${getTrendColor(analysis.trendAnalysis.direction)}`}>
                      {analysis.trendAnalysis.direction.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Momentum</p>
                    <p className={`font-medium ${analysis.trendAnalysis.momentum > 0 ? 'text-green-400' : analysis.trendAnalysis.momentum < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {(analysis.trendAnalysis.momentum * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Volatility</p>
                    <p className="font-medium">{(analysis.trendAnalysis.volatility * 100).toFixed(2)}%</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">R² Score</p>
                    <p className="font-medium">{analysis.trendAnalysis.rSquared.toFixed(3)}</p>
                  </div>
                </div>
                {analysis.trendAnalysis.seasonality?.detected && (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                    <p className="text-xs text-purple-400 mb-1">Seasonality Detected</p>
                    <p className="text-sm">
                      {analysis.trendAnalysis.seasonality.period}h period with {(analysis.trendAnalysis.seasonality.confidence * 100).toFixed(0)}% confidence
                    </p>
                  </div>
                )}
                {analysis.trendAnalysis.changePoints.length > 0 && (
                  <div className="text-xs text-slate-400">
                    {analysis.trendAnalysis.changePoints.length} change points detected
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Spending Patterns Card */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-purple-400" />
                  Spending Patterns
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                    <p className="text-xs text-slate-500">Daily</p>
                    <p className="font-mono text-sm">{analysis.spendingPatterns.projectedSpending.daily.toFixed(4)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                    <p className="text-xs text-slate-500">Weekly</p>
                    <p className="font-mono text-sm">{analysis.spendingPatterns.projectedSpending.weekly.toFixed(4)}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                    <p className="text-xs text-slate-500">Monthly</p>
                    <p className="font-mono text-sm">{analysis.spendingPatterns.projectedSpending.monthly.toFixed(4)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Spending Trend</span>
                  <span className={getTrendColor(analysis.spendingPatterns.projectedSpending.trend)}>
                    {analysis.spendingPatterns.projectedSpending.trend.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Peak Hours</span>
                  <span className="text-slate-300">
                    {analysis.spendingPatterns.dailyPattern.peakHours.slice(0, 3).map(h => `${h}:00`).join(', ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Peak Days</span>
                  <span className="text-slate-300">
                    {analysis.spendingPatterns.weeklyPattern.peakDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Model Performance */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-green-400" />
                Model Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Data Quality</p>
                  <Badge variant="outline" className={
                    analysis.dataQuality === 'excellent' ? 'text-green-400' :
                    analysis.dataQuality === 'good' ? 'text-cyan-400' :
                    analysis.dataQuality === 'fair' ? 'text-yellow-400' : 'text-red-400'
                  }>
                    {analysis.dataQuality}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Data Points</p>
                  <p className="font-medium">{analysis.dataPointsAnalyzed}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Prediction Accuracy</p>
                  <p className="font-medium">{analysis.modelPerformance.accuracy.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Analysis Duration</p>
                  <p className="font-medium">{analysis.timeRangeAnalyzed.durationHours.toFixed(0)}h</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies">
          {analysis.anomalyDetection.anomalies.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-400" />
                <h3 className="text-lg font-medium text-white mb-2">No Anomalies Detected</h3>
                <p className="text-slate-400">
                  Your transaction patterns appear normal based on the ML analysis.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Detected Anomalies</h3>
                  <p className="text-sm text-slate-400">
                    {analysis.anomalyDetection.anomalies.length} anomalies found ({analysis.anomalyDetection.anomalyRate.toFixed(1)}% rate)
                  </p>
                </div>
                <Badge variant="outline" className="text-slate-400">
                  Z-Score Threshold: {analysis.anomalyDetection.thresholds.zScoreThreshold}
                </Badge>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {analysis.anomalyDetection.anomalies.map((anomaly) => (
                    <AnomalyCard key={anomaly.id} anomaly={anomaly} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </TabsContent>

        {/* Predictions Tab */}
        <TabsContent value="predictions" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-cyan-400" />
                  Balance Forecast (7 Days)
                </CardTitle>
                <Badge variant="outline" className={
                  analysis.balancePrediction.confidence === 'very_high' ? 'text-green-400' :
                  analysis.balancePrediction.confidence === 'high' ? 'text-cyan-400' :
                  analysis.balancePrediction.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400'
                }>
                  {analysis.balancePrediction.confidence} confidence
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <PredictionChart predictions={analysis.balancePrediction.predictions} />
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">MAPE</p>
                  <p className="font-medium">{analysis.balancePrediction.metrics.mape.toFixed(1)}%</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">RMSE</p>
                  <p className="font-medium">{analysis.balancePrediction.metrics.rmse.toFixed(4)}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">MAE</p>
                  <p className="font-medium">{analysis.balancePrediction.metrics.mae.toFixed(4)}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">R²</p>
                  <p className="font-medium">{analysis.balancePrediction.metrics.r2.toFixed(3)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prediction Warnings */}
          {analysis.balancePrediction.warnings.length > 0 && (
            <Card className="bg-orange-500/10 border-orange-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-orange-400">
                  <AlertTriangle className="h-4 w-4" />
                  Prediction Warnings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {analysis.balancePrediction.warnings.map((warning, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg">
                    <AlertCircle className={`h-5 w-5 flex-shrink-0 ${
                      warning.severity === 'high' ? 'text-red-400' : 'text-yellow-400'
                    }`} />
                    <div>
                      <p className="font-medium">{warning.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                      <p className="text-sm text-slate-400">{warning.message}</p>
                      {warning.predictedDate && (
                        <p className="text-xs text-slate-500 mt-1">
                          Predicted: {new Date(warning.predictedDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          {/* Overall Security Status */}
          <Card className={`${threatConfig.bgColor} border ${threatConfig.borderColor}`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-full ${threatConfig.bgColor}`}>
                  <ThreatLevelIcon level={analysis.securityAnalysis.overallThreatLevel} className={`h-8 w-8 ${threatConfig.color}`} />
                </div>
                <div>
                  <h3 className={`text-xl font-bold ${threatConfig.color}`}>{threatConfig.label}</h3>
                  <p className="text-slate-400">Overall Threat Score: {analysis.securityAnalysis.threatScore.toFixed(0)}/100</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk Factors */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Risk Factors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.securityAnalysis.riskFactors.map((factor, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{factor.factor}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        factor.trend === 'improving' ? 'text-green-400' :
                        factor.trend === 'worsening' ? 'text-red-400' : 'text-slate-400'
                      }>
                        {factor.trend}
                      </Badge>
                      <span className="text-sm font-mono">{factor.score.toFixed(0)}</span>
                    </div>
                  </div>
                  <Progress value={factor.score} className="h-1.5" />
                  <p className="text-xs text-slate-500">{factor.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Detected Threats */}
          {analysis.securityAnalysis.detectedThreats.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">Detected Threats</h3>
              {analysis.securityAnalysis.detectedThreats.map((threat) => (
                <ThreatCard key={threat.id} threat={threat} />
              ))}
            </div>
          )}

          {/* Security Recommendations */}
          {analysis.securityAnalysis.recommendations.length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Security Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {analysis.securityAnalysis.recommendations.map((rec, i) => (
                  <div key={i} className={`p-3 rounded-lg ${
                    rec.priority === 'critical' ? 'bg-red-500/10 border border-red-500/30' :
                    rec.priority === 'high' ? 'bg-orange-500/10 border border-orange-500/30' :
                    'bg-slate-900/50'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={
                        rec.priority === 'critical' ? 'text-red-400' :
                        rec.priority === 'high' ? 'text-orange-400' : 'text-slate-400'
                      }>
                        {rec.priority}
                      </Badge>
                      <span className="font-medium">{rec.title}</span>
                    </div>
                    <p className="text-sm text-slate-400">{rec.description}</p>
                    <p className="text-xs text-cyan-400 mt-1">{rec.suggestedAction}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations">
          {analysis.proactiveRecommendations.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-400" />
                <h3 className="text-lg font-medium text-white mb-2">No Recommendations</h3>
                <p className="text-slate-400">
                  Your current alert configuration appears optimal based on the ML analysis.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Proactive Recommendations</h3>
                  <p className="text-sm text-slate-400">
                    AI-generated suggestions based on pattern analysis
                  </p>
                </div>
                <Badge className="bg-cyan-500/20 text-cyan-400">
                  {analysis.proactiveRecommendations.filter(r => r.priority === 'high' || r.priority === 'critical').length} high priority
                </Badge>
              </div>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4 pr-4">
                  {analysis.proactiveRecommendations.map((rec) => (
                    <RecommendationCard
                      key={rec.id}
                      recommendation={rec}
                      onApply={onRecommendationApply ? () => onRecommendationApply(rec) : undefined}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MLInsightsPanel;
