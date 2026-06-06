import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  TrendingDown,
  Fuel,
  Clock,
  Lightbulb,
  Check,
  X,
  RefreshCw,
  Sparkles,
  Brain,
  BarChart3,
  Settings,
  ChevronRight,
  Zap,
  Target,
  Activity,
  Info,
  Database,
  Cloud,
  CloudOff,
  AlertCircle,
} from 'lucide-react';
import { alertSuggestionService, DataSourceInfo } from '@/agent-helpers/lib/alertSuggestionService';
import { useMultiWallet } from '@/agent-helpers/contexts/MultiWalletContext';
import {
  AlertSuggestion,
  SuggestionSummary,
  SuggestionPreferences,
  WalletAnalysis,
  CONFIDENCE_CONFIG,
  SUGGESTION_TYPE_INFO,
} from '@/agent-helpers/types/alertSuggestions';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const SuggestionTypeIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
  const icons: Record<string, React.FC<{ className?: string }>> = {
    low_balance: AlertTriangle,
    balance_change: TrendingDown,
    gas_reserve: Fuel,
    cooldown: Clock,
  };
  const Icon = icons[type] || Lightbulb;
  return <Icon className={className} />;
};

interface SuggestionCardProps {
  suggestion: AlertSuggestion;
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  onApply,
  onDismiss,
  isApplying,
}) => {
  const confidenceConfig = CONFIDENCE_CONFIG[suggestion.confidence];
  const typeInfo = SUGGESTION_TYPE_INFO[suggestion.suggestionType];

  const formatValue = (value: number, type: string) => {
    if (type === 'balance_change') return `${value}%`;
    if (type === 'cooldown') return `${value} min`;
    return `${value.toFixed(4)} ETH`;
  };

  return (
    <Card className={`bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-all ${
      suggestion.confidence === 'very_high' ? 'ring-1 ring-cyan-500/30' : ''
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-lg ${confidenceConfig.bgColor}`}>
            <SuggestionTypeIcon type={suggestion.suggestionType} className={`h-5 w-5 ${confidenceConfig.color}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-white">{typeInfo.name}</h4>
              <Badge variant="outline" className={`${confidenceConfig.color} border-current text-xs`}>
                {confidenceConfig.label}
              </Badge>
            </div>
            
            <p className="text-sm text-slate-400 mb-3">
              {suggestion.walletName || `${suggestion.walletAddress.slice(0, 8)}...`}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-slate-900/50 rounded-lg p-2">
                <p className="text-xs text-slate-500">Current</p>
                <p className="font-mono text-sm">
                  {suggestion.currentValue !== undefined 
                    ? formatValue(suggestion.currentValue, suggestion.suggestionType)
                    : 'Not set'}
                </p>
              </div>
              <div className="bg-cyan-500/10 rounded-lg p-2 border border-cyan-500/20">
                <p className="text-xs text-cyan-400">Suggested</p>
                <p className="font-mono text-sm text-cyan-300">
                  {formatValue(suggestion.suggestedValue, suggestion.suggestionType)}
                </p>
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">Confidence</span>
                <span className={confidenceConfig.color}>{suggestion.confidenceScore}%</span>
              </div>
              <Progress value={suggestion.confidenceScore} className="h-1.5" />
            </div>

            <p className="text-xs text-slate-400 mb-3 line-clamp-2">
              {suggestion.reasoning}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <BarChart3 className="h-3 w-3" />
                <span>{suggestion.dataPoints} data points</span>
                <span>•</span>
                <span>{suggestion.analysisWindow}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  className="text-slate-400 hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={onApply}
                  disabled={isApplying}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  {isApplying ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Apply
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface AnalysisInsightCardProps {
  analysis: WalletAnalysis;
}

const AnalysisInsightCard: React.FC<AnalysisInsightCardProps> = ({ analysis }) => {
  const qualityColors = {
    insufficient: 'text-red-400',
    fair: 'text-yellow-400',
    good: 'text-green-400',
    excellent: 'text-cyan-400',
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {analysis.walletName || `${analysis.walletAddress.slice(0, 10)}...`}
          </CardTitle>
          <Badge variant="outline" className={qualityColors[analysis.dataQuality]}>
            {analysis.dataQuality} data
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Balance Insights */}
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-medium">Balance Pattern</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Min</p>
              <p className="font-mono">{analysis.balanceStats.min.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-slate-500">Avg</p>
              <p className="font-mono">{analysis.balanceStats.avg.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-slate-500">Max</p>
              <p className="font-mono">{analysis.balanceStats.max.toFixed(4)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              Trend: {analysis.balanceStats.trend}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Volatility: {analysis.balanceStats.volatility}
            </Badge>
          </div>
        </div>

        {/* Transaction Insights */}
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium">Transaction Pattern</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Avg/Day</p>
              <p className="font-mono">{analysis.transactionStats.avgTransactionsPerDay.toFixed(1)} tx</p>
            </div>
            <div>
              <p className="text-slate-500">Avg Size</p>
              <p className="font-mono">{analysis.transactionStats.avgOutgoingAmount.toFixed(4)} ETH</p>
            </div>
          </div>
        </div>

        {/* Gas Insights */}
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Fuel className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-medium">Gas Usage</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Avg Cost</p>
              <p className="font-mono">{analysis.gasStats.avgTxCost.toFixed(4)} ETH</p>
            </div>
            <div>
              <p className="text-slate-500">Recommended Reserve</p>
              <p className="font-mono text-cyan-400">{analysis.gasStats.recommendedReserve.toFixed(4)} ETH</p>
            </div>
          </div>
        </div>

        {/* Acknowledgment Insights */}
        {analysis.acknowledgmentStats.totalAlerts > 0 && (
          <div className="bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium">Alert Response</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Avg Response</p>
                <p className="font-mono">{analysis.acknowledgmentStats.avgResponseTime.toFixed(0)} min</p>
              </div>
              <div>
                <p className="text-slate-500">Fatigue Score</p>
                <p className={`font-mono ${analysis.acknowledgmentStats.alertFatigueScore > 50 ? 'text-red-400' : 'text-green-400'}`}>
                  {analysis.acknowledgmentStats.alertFatigueScore.toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Suggestions Count */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700">
          <span className="text-sm text-slate-400">Generated Suggestions</span>
          <Badge className="bg-cyan-500/20 text-cyan-400">
            {analysis.suggestions.length}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

// Data Source Status Component
const DataSourceStatus: React.FC<{ dataSourceInfo: DataSourceInfo }> = ({ dataSourceInfo }) => {
  const getStatusConfig = () => {
    if (dataSourceInfo.apiConfigured && dataSourceInfo.isRealData) {
      return {
        icon: Cloud,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        label: `Connected to ${dataSourceInfo.source === 'alchemy' ? 'Alchemy' : 'Infura'}`,
        description: 'Fetching real blockchain data',
      };
    } else if (dataSourceInfo.errorMessage) {
      return {
        icon: AlertCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        label: 'API Error',
        description: dataSourceInfo.errorMessage,
      };
    } else {
      return {
        icon: CloudOff,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/30',
        label: 'Using Public RPC',
        description: 'Configure Alchemy API key for enhanced data',
      };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
      <Icon className={`h-5 w-5 ${config.color}`} />
      <div className="flex-1">
        <p className={`text-sm font-medium ${config.color}`}>{config.label}</p>
        <p className="text-xs text-slate-400">{config.description}</p>
      </div>
      {dataSourceInfo.lastFetchTime && (
        <div className="text-xs text-slate-500">
          Last: {new Date(dataSourceInfo.lastFetchTime).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export const AlertSuggestionPanel: React.FC = () => {
  const { toast } = useToast();
  const { wallets } = useMultiWallet();
  const [suggestions, setSuggestions] = useState<AlertSuggestion[]>([]);
  const [summary, setSummary] = useState<SuggestionSummary | null>(null);
  const [preferences, setPreferences] = useState<SuggestionPreferences>(alertSuggestionService.getPreferences());
  const [analyses, setAnalyses] = useState<WalletAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('suggestions');
  const [dataSourceInfo, setDataSourceInfo] = useState<DataSourceInfo>(alertSuggestionService.getDataSourceInfo());

  const loadData = useCallback(() => {
    setSuggestions(alertSuggestionService.getPendingSuggestions());
    setSummary(alertSuggestionService.getSummary());
    setDataSourceInfo(alertSuggestionService.getDataSourceInfo());
    
    // Load analyses for all wallets
    const walletAnalyses: WalletAnalysis[] = [];
    for (const wallet of wallets) {
      const analysis = alertSuggestionService.getAnalysis(wallet.address);
      if (analysis) walletAnalyses.push(analysis);
    }
    setAnalyses(walletAnalyses);
  }, [wallets]);

  useEffect(() => {
    loadData();
    const unsubscribe = alertSuggestionService.subscribe((newSuggestions) => {
      setSuggestions(newSuggestions.filter(s => s.status === 'pending'));
      setSummary(alertSuggestionService.getSummary());
      setDataSourceInfo(alertSuggestionService.getDataSourceInfo());
    });
    return () => unsubscribe();
  }, [loadData]);


  const handleAnalyzeAll = async () => {
    if (wallets.length === 0) {
      toast({
        title: 'No Wallets',
        description: 'Connect wallets to analyze their activity patterns',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const results = await alertSuggestionService.analyzeAllWallets(wallets);
      setAnalyses(results);
      loadData();
      toast({
        title: 'Analysis Complete',
        description: `Analyzed ${results.length} wallets and generated ${alertSuggestionService.getPendingSuggestions().length} suggestions`,
      });
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: 'An error occurred during analysis',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplySuggestion = async (suggestionId: string) => {
    setApplyingId(suggestionId);
    try {
      const success = await alertSuggestionService.applySuggestion(suggestionId);
      if (success) {
        toast({
          title: 'Suggestion Applied',
          description: 'Alert rule has been updated with the suggested value',
        });
        loadData();
      } else {
        toast({
          title: 'Failed to Apply',
          description: 'Could not apply the suggestion',
          variant: 'destructive',
        });
      }
    } finally {
      setApplyingId(null);
    }
  };

  const handleDismissSuggestion = (suggestionId: string) => {
    alertSuggestionService.dismissSuggestion(suggestionId);
    loadData();
    toast({
      title: 'Suggestion Dismissed',
      description: 'The suggestion has been dismissed',
    });
  };

  const handleApplyAllHighConfidence = async () => {
    setIsAnalyzing(true);
    try {
      const count = await alertSuggestionService.applyAllHighConfidence();
      toast({
        title: 'Suggestions Applied',
        description: `Applied ${count} high-confidence suggestions`,
      });
      loadData();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePreferenceChange = (key: keyof SuggestionPreferences, value: boolean) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    alertSuggestionService.updatePreferences({ [key]: value });
  };

  const highConfidenceSuggestions = suggestions.filter(
    s => s.confidence === 'high' || s.confidence === 'very_high'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg">
            <Brain className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Intelligent Alert Suggestions</h2>
            <p className="text-sm text-slate-400">AI-powered recommendations based on your wallet activity</p>
          </div>
        </div>
        <Button
          onClick={handleAnalyzeAll}
          disabled={isAnalyzing || wallets.length === 0}
          className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Analyze Wallets
            </>
          )}
        </Button>
      </div>

      {/* Data Source Status */}
      <DataSourceStatus dataSourceInfo={dataSourceInfo} />

      {/* Summary Cards */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Pending Suggestions</p>
                <p className="text-2xl font-bold text-cyan-400">{summary?.pendingSuggestions || 0}</p>
              </div>
              <Lightbulb className="h-8 w-8 text-cyan-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">High Confidence</p>
                <p className="text-2xl font-bold text-green-400">{summary?.highConfidenceSuggestions || 0}</p>
              </div>
              <Target className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Applied</p>
                <p className="text-2xl font-bold text-purple-400">{summary?.appliedSuggestions || 0}</p>
              </div>
              <Check className="h-8 w-8 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Data Quality</p>
                <p className="text-2xl font-bold capitalize text-yellow-400">
                  {summary?.overallDataQuality || 'N/A'}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      {highConfidenceSuggestions.length > 0 && (
        <Card className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border-cyan-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-cyan-400" />
                <div>
                  <p className="font-medium text-white">
                    {highConfidenceSuggestions.length} high-confidence suggestions available
                  </p>
                  <p className="text-sm text-slate-400">
                    These suggestions are based on strong data patterns
                  </p>
                </div>
              </div>
              <Button
                onClick={handleApplyAllHighConfidence}
                disabled={isAnalyzing}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                Apply All
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-800">
          <TabsTrigger value="suggestions">
            Suggestions
            {suggestions.length > 0 && (
              <Badge className="ml-2 bg-cyan-500/20 text-cyan-400">{suggestions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="insights">Wallet Insights</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions">
          {suggestions.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <Brain className="h-12 w-12 mx-auto mb-4 text-slate-500" />
                <h3 className="text-lg font-medium text-white mb-2">No Suggestions Yet</h3>
                <p className="text-slate-400 mb-4">
                  Click "Analyze Wallets" to generate intelligent alert suggestions based on your wallet activity patterns.
                </p>
                <Button
                  onClick={handleAnalyzeAll}
                  disabled={isAnalyzing || wallets.length === 0}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Analysis
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4 pr-4">
                {suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onApply={() => handleApplySuggestion(suggestion.id)}
                    onDismiss={() => handleDismissSuggestion(suggestion.id)}
                    isApplying={applyingId === suggestion.id}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights">
          {analyses.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-slate-500" />
                <h3 className="text-lg font-medium text-white mb-2">No Analysis Data</h3>
                <p className="text-slate-400">
                  Run an analysis to see detailed insights about your wallet activity patterns.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analyses.map((analysis) => (
                <AnalysisInsightCard key={analysis.walletAddress} analysis={analysis} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Suggestion Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-slate-300">Enabled Suggestion Types</h4>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                      <div>
                        <p className="font-medium">Low Balance Thresholds</p>
                        <p className="text-sm text-slate-400">Suggest optimal low balance alert thresholds</p>
                      </div>
                    </div>
                    <Switch
                      checked={preferences.enableLowBalanceSuggestions}
                      onCheckedChange={(v) => handlePreferenceChange('enableLowBalanceSuggestions', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <TrendingDown className="h-5 w-5 text-purple-400" />
                      <div>
                        <p className="font-medium">Balance Change Percentages</p>
                        <p className="text-sm text-slate-400">Recommend change percentages based on transaction patterns</p>
                      </div>
                    </div>
                    <Switch
                      checked={preferences.enableBalanceChangeSuggestions}
                      onCheckedChange={(v) => handlePreferenceChange('enableBalanceChangeSuggestions', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Fuel className="h-5 w-5 text-orange-400" />
                      <div>
                        <p className="font-medium">Gas Reserve Minimums</p>
                        <p className="text-sm text-slate-400">Calculate optimal gas reserves based on usage</p>
                      </div>
                    </div>
                    <Switch
                      checked={preferences.enableGasReserveSuggestions}
                      onCheckedChange={(v) => handlePreferenceChange('enableGasReserveSuggestions', v)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-green-400" />
                      <div>
                        <p className="font-medium">Cooldown Optimization</p>
                        <p className="text-sm text-slate-400">Learn from acknowledgment patterns to optimize cooldowns</p>
                      </div>
                    </div>
                    <Switch
                      checked={preferences.enableCooldownSuggestions}
                      onCheckedChange={(v) => handlePreferenceChange('enableCooldownSuggestions', v)}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <h4 className="text-sm font-medium text-slate-300 mb-3">Auto-Apply Settings</h4>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5 text-cyan-400" />
                    <div>
                      <p className="font-medium">Auto-Apply High Confidence</p>
                      <p className="text-sm text-slate-400">Automatically apply suggestions with very high confidence</p>
                    </div>
                  </div>
                  <Switch
                    checked={preferences.autoApply}
                    onCheckedChange={(v) => handlePreferenceChange('autoApply', v)}
                  />
                </div>
              </div>

              <TooltipProvider>
                <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <Info className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <p className="text-sm text-blue-300">
                    Suggestions are generated by analyzing your wallet's historical balance data, transaction patterns, 
                    gas usage, and alert acknowledgment behavior. More data leads to higher confidence suggestions.
                  </p>
                </div>
              </TooltipProvider>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AlertSuggestionPanel;
