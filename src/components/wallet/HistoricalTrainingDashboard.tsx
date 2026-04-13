// Historical Training Dashboard
// UI for managing ML model training with historical blockchain data

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain,
  Download,
  Play,
  Square,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Database,
  TrendingUp,
  BarChart3,
  Target,
  Zap,
  Trash2,
  RefreshCw,
  Settings,
  Activity,
  Calendar,
  Wallet,
  Filter,
} from 'lucide-react';
import {
  TrainingConfig,
  DEFAULT_TRAINING_CONFIG,
  TrainingProgress,
  TrainingSession,
  PreTrainedModelState,
  TRAINING_NETWORKS,
  TRAINING_STAGE_INFO,
  TrainingStage,
} from '@/types/historicalTraining';
import { historicalTrainingService } from '@/lib/historicalTrainingService';

interface HistoricalTrainingDashboardProps {
  walletAddress?: string;
  onModelTrained?: (model: PreTrainedModelState) => void;
}

export const HistoricalTrainingDashboard: React.FC<HistoricalTrainingDashboardProps> = ({
  walletAddress: initialWallet,
  onModelTrained,
}) => {
  const [config, setConfig] = useState<TrainingConfig>({
    ...DEFAULT_TRAINING_CONFIG,
    walletAddress: initialWallet || '',
  });
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [trainedModel, setTrainedModel] = useState<PreTrainedModelState | null>(null);
  const [savedModels, setSavedModels] = useState<{ walletAddress: string; network: string; trainedAt: string }[]>([]);
  const [activeTab, setActiveTab] = useState('train');
  const [isTraining, setIsTraining] = useState(false);

  const loadSavedModels = useCallback(() => {
    const models = historicalTrainingService.listTrainedModels();
    setSavedModels(models);
  }, []);

  // Load saved models on mount
  useEffect(() => {
    loadSavedModels();
  }, [loadSavedModels]);

  // Subscribe to training progress
  useEffect(() => {
    const unsubProgress = historicalTrainingService.onProgress((p) => {
      setProgress(p);
    });

    const unsubComplete = historicalTrainingService.onComplete((model) => {
      setTrainedModel(model);
      setIsTraining(false);
      historicalTrainingService.saveTrainedModel(model);
      loadSavedModels();
      onModelTrained?.(model);
    });

    const unsubError = historicalTrainingService.onError((error) => {
      setIsTraining(false);
      console.error('Training error:', error);
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [onModelTrained, loadSavedModels]);

  const handleStartTraining = async () => {
    if (!config.walletAddress) {
      alert('Please enter a wallet address');
      return;
    }

    setIsTraining(true);
    setTrainedModel(null);
    
    try {
      const newSession = await historicalTrainingService.startTraining(config);
      setSession(newSession);
    } catch (error: unknown) {
      setIsTraining(false);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Training failed: ${message}`);
    }
  };

  const handleCancelTraining = () => {
    historicalTrainingService.cancelTraining();
    setIsTraining(false);
  };

  const handleLoadModel = (walletAddress: string, network: string) => {
    const model = historicalTrainingService.loadTrainedModel(walletAddress, network);
    if (model) {
      setTrainedModel(model);
      onModelTrained?.(model);
    }
  };

  const handleDeleteModel = (walletAddress: string, network: string) => {
    if (confirm('Are you sure you want to delete this trained model?')) {
      historicalTrainingService.deleteTrainedModel(walletAddress, network);
      loadSavedModels();
    }
  };

  const getStageIcon = (stage: TrainingStage) => {
    const icons: Record<string, React.ReactNode> = {
      initializing: <Settings className="w-4 h-4" />,
      fetching_transactions: <Download className="w-4 h-4" />,
      fetching_balances: <Wallet className="w-4 h-4" />,
      preprocessing: <Filter className="w-4 h-4" />,
      computing_statistics: <BarChart3 className="w-4 h-4" />,
      detecting_patterns: <TrendingUp className="w-4 h-4" />,
      building_baselines: <Target className="w-4 h-4" />,
      training_models: <Brain className="w-4 h-4" />,
      validating: <CheckCircle className="w-4 h-4" />,
      complete: <CheckCircle className="w-4 h-4" />,
      failed: <XCircle className="w-4 h-4" />,
    };
    return icons[stage] || <Activity className="w-4 h-4" />;
  };

  const getStageColor = (stage: TrainingStage) => {
    if (stage === 'complete') return 'text-green-400';
    if (stage === 'failed') return 'text-red-400';
    return 'text-blue-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Historical Data Training
          </h2>
          <p className="text-gray-400 mt-1">
            Pre-train ML models with historical blockchain data for accurate anomaly detection
          </p>
        </div>
        <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
          <Database className="w-3 h-3 mr-1" />
          ML Training
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-800/50">
          <TabsTrigger value="train" className="data-[state=active]:bg-purple-500/20">
            <Play className="w-4 h-4 mr-2" />
            Train Model
          </TabsTrigger>
          <TabsTrigger value="models" className="data-[state=active]:bg-purple-500/20">
            <Database className="w-4 h-4 mr-2" />
            Saved Models ({savedModels.length})
          </TabsTrigger>
          {trainedModel && (
            <TabsTrigger value="results" className="data-[state=active]:bg-purple-500/20">
              <BarChart3 className="w-4 h-4 mr-2" />
              Results
            </TabsTrigger>
          )}
        </TabsList>

        {/* Training Tab */}
        <TabsContent value="train" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Configuration Panel */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-400" />
                  Training Configuration
                </CardTitle>
                <CardDescription>Configure the training parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Wallet Address */}
                <div className="space-y-2">
                  <Label className="text-gray-300">Wallet Address</Label>
                  <Input
                    value={config.walletAddress}
                    onChange={(e) => setConfig({ ...config, walletAddress: e.target.value })}
                    placeholder="0x..."
                    className="bg-gray-800 border-gray-700 text-white"
                    disabled={isTraining}
                  />
                </div>

                {/* Network Selection */}
                <div className="space-y-2">
                  <Label className="text-gray-300">Network</Label>
                  <Select
                    value={config.network}
                    onValueChange={(v) => setConfig({ ...config, network: v })}
                    disabled={isTraining}
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {Object.entries(TRAINING_NETWORKS).map(([key, net]) => (
                        <SelectItem key={key} value={key} className="text-white">
                          {net.name} ({net.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* History Days */}
                <div className="space-y-2">
                  <Label className="text-gray-300">History Days: {config.historyDays}</Label>
                  <Slider
                    value={[config.historyDays]}
                    onValueChange={([v]) => setConfig({ ...config, historyDays: v })}
                    min={7}
                    max={365}
                    step={1}
                    disabled={isTraining}
                    className="py-2"
                  />
                  <p className="text-xs text-gray-500">
                    More history = better accuracy, but longer training time
                  </p>
                </div>

                {/* Max Transactions */}
                <div className="space-y-2">
                  <Label className="text-gray-300">Max Transactions: {config.maxTransactions}</Label>
                  <Slider
                    value={[config.maxTransactions]}
                    onValueChange={([v]) => setConfig({ ...config, maxTransactions: v })}
                    min={50}
                    max={2000}
                    step={50}
                    disabled={isTraining}
                    className="py-2"
                  />
                </div>

                {/* Advanced Options */}
                <div className="space-y-4 pt-4 border-t border-gray-800">
                  <h4 className="text-sm font-medium text-gray-300">Advanced Options</h4>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-gray-300">Include Token Transfers</Label>
                      <p className="text-xs text-gray-500">ERC20, ERC721, ERC1155</p>
                    </div>
                    <Switch
                      checked={config.includeTokenTransfers}
                      onCheckedChange={(v) => setConfig({ ...config, includeTokenTransfers: v })}
                      disabled={isTraining}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-gray-300">Include Internal Transactions</Label>
                      <p className="text-xs text-gray-500">Contract interactions</p>
                    </div>
                    <Switch
                      checked={config.includeInternalTxs}
                      onCheckedChange={(v) => setConfig({ ...config, includeInternalTxs: v })}
                      disabled={isTraining}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-gray-300">Seasonality Detection</Label>
                      <p className="text-xs text-gray-500">Detect periodic patterns</p>
                    </div>
                    <Switch
                      checked={config.seasonalityDetection}
                      onCheckedChange={(v) => setConfig({ ...config, seasonalityDetection: v })}
                      disabled={isTraining}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-300">
                      Outlier Removal: {config.outlierRemovalPercentile}%
                    </Label>
                    <Slider
                      value={[config.outlierRemovalPercentile]}
                      onValueChange={([v]) => setConfig({ ...config, outlierRemovalPercentile: v })}
                      min={0}
                      max={10}
                      step={1}
                      disabled={isTraining}
                      className="py-2"
                    />
                    <p className="text-xs text-gray-500">
                      Remove extreme values from training data
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  {!isTraining ? (
                    <Button
                      onClick={handleStartTraining}
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      disabled={!config.walletAddress}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Training
                    </Button>
                  ) : (
                    <Button
                      onClick={handleCancelTraining}
                      variant="destructive"
                      className="flex-1"
                    >
                      <Square className="w-4 h-4 mr-2" />
                      Cancel Training
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Progress Panel */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Training Progress
                </CardTitle>
                <CardDescription>
                  {isTraining ? 'Training in progress...' : 'Ready to train'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {progress ? (
                  <>
                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Progress</span>
                        <span className="text-white font-medium">{progress.percentComplete}%</span>
                      </div>
                      <Progress value={progress.percentComplete} className="h-2" />
                    </div>

                    {/* Current Stage */}
                    <div className="p-4 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-gray-700 ${getStageColor(progress.stage)}`}>
                          {getStageIcon(progress.stage)}
                        </div>
                        <div>
                          <p className="text-white font-medium">
                            {TRAINING_STAGE_INFO[progress.stage]?.label || progress.stage}
                          </p>
                          <p className="text-sm text-gray-400">{progress.message}</p>
                        </div>
                      </div>
                    </div>

                    {/* Stage Timeline */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-300">Training Pipeline</h4>
                      <div className="space-y-1">
                        {Object.entries(TRAINING_STAGE_INFO)
                          .filter(([key]) => !['complete', 'failed'].includes(key))
                          .map(([key, info], idx) => {
                            const isComplete = progress.currentStep > idx + 1;
                            const isCurrent = progress.currentStep === idx + 1;
                            const isFailed = progress.stage === 'failed' && isCurrent;

                            return (
                              <div
                                key={key}
                                className={`flex items-center gap-2 p-2 rounded text-sm ${
                                  isCurrent
                                    ? 'bg-blue-500/10 text-blue-400'
                                    : isComplete
                                    ? 'text-green-400'
                                    : isFailed
                                    ? 'text-red-400'
                                    : 'text-gray-500'
                                }`}
                              >
                                {isComplete ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : isFailed ? (
                                  <XCircle className="w-4 h-4" />
                                ) : isCurrent ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <div className="w-4 h-4 rounded-full border border-gray-600" />
                                )}
                                <span>{info.label}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Errors */}
                    {progress.errors.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-red-400 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Errors
                        </h4>
                        {progress.errors.map((error, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300"
                          >
                            {error.message}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Timing */}
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Clock className="w-4 h-4" />
                      Started: {new Date(progress.startedAt).toLocaleTimeString()}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Brain className="w-16 h-16 text-gray-600 mb-4" />
                    <p className="text-gray-400">
                      Configure training parameters and click "Start Training"
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      The model will learn from historical transactions to improve anomaly detection
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Saved Models Tab */}
        <TabsContent value="models">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                Saved Models
              </CardTitle>
              <CardDescription>
                Previously trained models stored locally
              </CardDescription>
            </CardHeader>
            <CardContent>
              {savedModels.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {savedModels.map((model, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-gray-800/50 rounded-lg flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Brain className="w-5 h-5 text-purple-400" />
                          </div>
                          <div>
                            <p className="text-white font-mono text-sm">
                              {model.walletAddress.slice(0, 10)}...{model.walletAddress.slice(-8)}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {model.network}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                <Calendar className="w-3 h-3 inline mr-1" />
                                {new Date(model.trainedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLoadModel(model.walletAddress, model.network)}
                            className="border-gray-700"
                          >
                            <Zap className="w-4 h-4 mr-1" />
                            Load
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteModel(model.walletAddress, model.network)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Database className="w-16 h-16 text-gray-600 mb-4" />
                  <p className="text-gray-400">No saved models yet</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Train a model to save it for future use
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results Tab */}
        {trainedModel && (
          <TabsContent value="results" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Transactions Processed</p>
                      <p className="text-2xl font-bold text-white">
                        {trainedModel.metadata.transactionsProcessed}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <BarChart3 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Data Quality</p>
                      <p className="text-2xl font-bold text-white">
                        {trainedModel.metadata.dataQuality.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Clock className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Training Duration</p>
                      <p className="text-2xl font-bold text-white">
                        {(trainedModel.metadata.trainingDuration / 1000).toFixed(1)}s
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-500/20 rounded-lg">
                      <Target className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Confidence Level</p>
                      <p className="text-2xl font-bold text-white">
                        {trainedModel.baseline.confidenceLevel.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Results */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Baseline Statistics */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Baseline Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">Mean Amount</p>
                      <p className="text-lg font-semibold text-white">
                        {trainedModel.baseline.transactionAmounts.mean.toFixed(4)} ETH
                      </p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">Std Deviation</p>
                      <p className="text-lg font-semibold text-white">
                        {trainedModel.baseline.transactionAmounts.stdDev.toFixed(4)} ETH
                      </p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">Median Amount</p>
                      <p className="text-lg font-semibold text-white">
                        {trainedModel.baseline.transactionAmounts.median.toFixed(4)} ETH
                      </p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">Sample Size</p>
                      <p className="text-lg font-semibold text-white">
                        {trainedModel.baseline.sampleSize}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-800">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">Amount Percentiles</h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="p-2 bg-gray-800/30 rounded">
                        <span className="text-gray-500">P25:</span>{' '}
                        <span className="text-white">
                          {trainedModel.baseline.amountPercentiles.p25.toFixed(4)}
                        </span>
                      </div>
                      <div className="p-2 bg-gray-800/30 rounded">
                        <span className="text-gray-500">P50:</span>{' '}
                        <span className="text-white">
                          {trainedModel.baseline.amountPercentiles.p50.toFixed(4)}
                        </span>
                      </div>
                      <div className="p-2 bg-gray-800/30 rounded">
                        <span className="text-gray-500">P75:</span>{' '}
                        <span className="text-white">
                          {trainedModel.baseline.amountPercentiles.p75.toFixed(4)}
                        </span>
                      </div>
                      <div className="p-2 bg-gray-800/30 rounded">
                        <span className="text-gray-500">P90:</span>{' '}
                        <span className="text-white">
                          {trainedModel.baseline.amountPercentiles.p90.toFixed(4)}
                        </span>
                      </div>
                      <div className="p-2 bg-gray-800/30 rounded">
                        <span className="text-gray-500">P95:</span>{' '}
                        <span className="text-white">
                          {trainedModel.baseline.amountPercentiles.p95.toFixed(4)}
                        </span>
                      </div>
                      <div className="p-2 bg-gray-800/30 rounded">
                        <span className="text-gray-500">P99:</span>{' '}
                        <span className="text-white">
                          {trainedModel.baseline.amountPercentiles.p99.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Spending Patterns */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Learned Patterns</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">Avg Tx/Day</p>
                      <p className="text-lg font-semibold text-white">
                        {trainedModel.spendingPatterns.avgTransactionsPerDay.toFixed(1)}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">Avg Tx/Week</p>
                      <p className="text-lg font-semibold text-white">
                        {trainedModel.spendingPatterns.avgTransactionsPerWeek.toFixed(1)}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">Large Tx Threshold</p>
                      <p className="text-lg font-semibold text-white">
                        {trainedModel.spendingPatterns.largeTransactionThreshold.toFixed(4)} ETH
                      </p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">Avg Gas Used</p>
                      <p className="text-lg font-semibold text-white">
                        {trainedModel.spendingPatterns.avgGasUsed.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-800">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">Peak Activity Hours</h4>
                    <div className="flex flex-wrap gap-2">
                      {trainedModel.spendingPatterns.peakHours.map((hour) => (
                        <Badge key={hour} className="bg-green-500/20 text-green-400">
                          {hour}:00
                        </Badge>
                      ))}
                      {trainedModel.spendingPatterns.peakHours.length === 0 && (
                        <span className="text-gray-500 text-sm">No clear peak hours detected</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-800">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">Quiet Hours</h4>
                    <div className="flex flex-wrap gap-2">
                      {trainedModel.spendingPatterns.quietHours.slice(0, 6).map((hour) => (
                        <Badge key={hour} variant="outline" className="text-gray-400">
                          {hour}:00
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Anomaly Thresholds */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Anomaly Thresholds</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-yellow-400 text-sm">Unusual Amount (High)</span>
                      <span className="text-white font-mono">
                        {trainedModel.baseline.anomalyThresholds.unusualAmountHigh.toFixed(4)} ETH
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-red-400 text-sm">Extreme Amount (High)</span>
                      <span className="text-white font-mono">
                        {trainedModel.baseline.anomalyThresholds.extremeAmountHigh.toFixed(4)} ETH
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-orange-400 text-sm">Rapid Drain Threshold</span>
                      <span className="text-white font-mono">
                        {(trainedModel.baseline.anomalyThresholds.rapidDrainThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-blue-400 text-sm">High Frequency Threshold</span>
                      <span className="text-white font-mono">
                        {trainedModel.baseline.anomalyThresholds.highFrequencyThreshold} tx/hr
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Seasonality */}
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Seasonality Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-800/50 rounded-lg flex items-center justify-between">
                      <span className="text-gray-400 text-sm">Hourly Pattern</span>
                      {trainedModel.seasonality.hasHourlySeasonality ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg flex items-center justify-between">
                      <span className="text-gray-400 text-sm">Daily Pattern</span>
                      {trainedModel.seasonality.hasDailySeasonality ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg flex items-center justify-between">
                      <span className="text-gray-400 text-sm">Weekly Pattern</span>
                      {trainedModel.seasonality.hasWeeklySeasonality ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-gray-400 text-sm">Seasonal Strength</span>
                      <p className="text-white font-semibold">
                        {(trainedModel.seasonality.seasonalStrength * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>

                  {trainedModel.seasonality.dominantPeriod && (
                    <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                      <p className="text-purple-400 text-sm">Dominant Period Detected</p>
                      <p className="text-white font-semibold">
                        {trainedModel.seasonality.dominantPeriod} hours
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default HistoricalTrainingDashboard;
