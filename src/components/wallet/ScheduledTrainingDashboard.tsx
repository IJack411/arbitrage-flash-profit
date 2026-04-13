import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Calendar,
  CalendarDays,
  CalendarClock,
  Clock,
  Play,
  Pause,
  RefreshCw,
  Settings,
  Trash2,
  Check,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  GitBranch,
  Rocket,
  History,
  BarChart3,
  Layers,
  Timer,
  Zap,
  Target,
  Award,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { scheduledTrainingService } from '@/lib/scheduledTrainingService';
import {
  TrainingSchedule,
  ModelVersion,
  ScheduledTrainingRun,
  ScheduledTrainingStats,
  TrainingFrequency,
  FREQUENCY_INFO,
  DAY_NAMES,
  DayOfWeek,
  formatNextRun,
  getNextRunTime,
  ModelComparison,
} from '@/types/scheduledTraining';
import { TRAINING_NETWORKS } from '@/types/historicalTraining';

interface ScheduledTrainingDashboardProps {
  walletAddresses?: string[];
  walletNames?: Record<string, string>;
}

export const ScheduledTrainingDashboard: React.FC<ScheduledTrainingDashboardProps> = ({
  walletAddresses = [],
  walletNames = {},
}) => {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<TrainingSchedule[]>([]);
  const [stats, setStats] = useState<ScheduledTrainingStats | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<TrainingSchedule | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [selectedWalletVersions, setSelectedWalletVersions] = useState<ModelVersion[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [activeTab, setActiveTab] = useState('schedules');

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  // Form state for creating/editing schedules
  const [formData, setFormData] = useState({
    walletAddress: '',
    network: 'ethereum',
    frequency: 'weekly' as TrainingFrequency,
    timeOfDay: '03:00',
    dayOfWeek: 0 as DayOfWeek,
    dayOfMonth: 1,
    customIntervalHours: 24,
    autoDeployOnSuccess: true,
    minAccuracyForDeploy: 70,
    requireImprovement: false,
    minImprovementPercent: 2,
    keepVersions: 5,
    historyDays: 90,
  });

  useEffect(() => {
    loadData();
    
    const unsubSchedule = scheduledTrainingService.onScheduleChange(() => loadData());
    const unsubRun = scheduledTrainingService.onRunChange(() => loadData());
    const unsubVersion = scheduledTrainingService.onVersionChange(() => loadData());
    
    return () => {
      unsubSchedule();
      unsubRun();
      unsubVersion();
    };
  }, []);

  const loadData = () => {
    setSchedules(scheduledTrainingService.getAllSchedules());
    setStats(scheduledTrainingService.getStats());
  };

  const handleCreateSchedule = () => {
    if (!formData.walletAddress) {
      toast({
        title: 'Error',
        description: 'Please select a wallet address',
        variant: 'destructive',
      });
      return;
    }

    try {
      const schedule = scheduledTrainingService.createSchedule({
        walletAddress: formData.walletAddress,
        network: formData.network,
        frequency: formData.frequency,
        timeOfDay: formData.timeOfDay,
        dayOfWeek: formData.dayOfWeek,
        dayOfMonth: formData.dayOfMonth,
        customIntervalHours: formData.customIntervalHours,
        autoDeployOnSuccess: formData.autoDeployOnSuccess,
        minAccuracyForDeploy: formData.minAccuracyForDeploy,
        requireImprovement: formData.requireImprovement,
        minImprovementPercent: formData.minImprovementPercent,
        keepVersions: formData.keepVersions,
        trainingConfig: {
          historyDays: formData.historyDays,
        },
      });

      toast({
        title: 'Schedule Created',
        description: `Training schedule created for ${walletNames[formData.walletAddress.toLowerCase()] || formData.walletAddress.slice(0, 10)}...`,
      });

      setShowCreateModal(false);
      loadData();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleToggleSchedule = (scheduleId: string) => {
    scheduledTrainingService.toggleSchedule(scheduleId);
    loadData();
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    scheduledTrainingService.deleteSchedule(scheduleId);
    toast({
      title: 'Schedule Deleted',
      description: 'Training schedule has been removed',
    });
    loadData();
  };

  const handleTriggerNow = async (scheduleId: string) => {
    setIsTraining(true);
    try {
      const run = await scheduledTrainingService.triggerTrainingNow(scheduleId);
      toast({
        title: 'Training Complete',
        description: run.wasDeployed 
          ? 'New model version trained and deployed'
          : 'New model version trained (not deployed)',
      });
    } catch (error: unknown) {
      toast({
        title: 'Training Failed',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsTraining(false);
      loadData();
    }
  };

  const handleViewVersions = (walletAddress: string) => {
    const versions = scheduledTrainingService.getVersionsForWallet(walletAddress);
    setSelectedWalletVersions(versions);
    setShowVersionsModal(true);
  };

  const handleDeployVersion = (versionId: string) => {
    scheduledTrainingService.manuallyDeployVersion(versionId);
    toast({
      title: 'Model Deployed',
      description: 'Model version has been deployed to real-time monitoring',
    });
    loadData();
    // Refresh versions modal
    if (selectedWalletVersions.length > 0) {
      const walletAddress = selectedWalletVersions[0].walletAddress;
      setSelectedWalletVersions(scheduledTrainingService.getVersionsForWallet(walletAddress));
    }
  };

  const getFrequencyIcon = (frequency: TrainingFrequency) => {
    const icons = {
      daily: Calendar,
      weekly: CalendarDays,
      biweekly: CalendarDays,
      monthly: CalendarClock,
      custom: Settings,
    };
    return icons[frequency];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'running': return 'text-cyan-400';
      case 'failed': return 'text-red-400';
      case 'scheduled': return 'text-yellow-400';
      default: return 'text-slate-400';
    }
  };

  const renderComparisonBadge = (comparison?: ModelComparison) => {
    if (!comparison) return null;
    
    const { recommendation, improvementPercent } = comparison;
    
    if (recommendation === 'deploy') {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <ArrowUpRight className="h-3 w-3 mr-1" />
          +{improvementPercent.toFixed(1)}%
        </Badge>
      );
    } else if (recommendation === 'reject') {
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <ArrowDownRight className="h-3 w-3 mr-1" />
          {improvementPercent.toFixed(1)}%
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Minus className="h-3 w-3 mr-1" />
          Review
        </Badge>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Total Schedules</p>
                <p className="text-2xl font-bold text-white">{stats?.totalSchedules || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-slate-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Active</p>
                <p className="text-2xl font-bold text-green-400">{stats?.activeSchedules || 0}</p>
              </div>
              <Play className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Model Versions</p>
                <p className="text-2xl font-bold text-cyan-400">{stats?.totalModelsVersions || 0}</p>
              </div>
              <GitBranch className="h-8 w-8 text-cyan-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Deployed</p>
                <p className="text-2xl font-bold text-purple-400">{stats?.deployedModels || 0}</p>
              </div>
              <Rocket className="h-8 w-8 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Success Rate</p>
                <p className="text-2xl font-bold text-yellow-400">{stats?.successRate.toFixed(0) || 0}%</p>
              </div>
              <Target className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Accuracy Trend</p>
                <p className={`text-2xl font-bold ${(stats?.avgAccuracyTrend || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(stats?.avgAccuracyTrend || 0) >= 0 ? '+' : ''}{stats?.avgAccuracyTrend.toFixed(1) || 0}%
                </p>
              </div>
              {(stats?.avgAccuracyTrend || 0) >= 0 
                ? <TrendingUp className="h-8 w-8 text-green-500/50" />
                : <TrendingDown className="h-8 w-8 text-red-500/50" />
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next Scheduled Run */}
      {stats?.nextScheduledRun && (
        <Card className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 border-cyan-700/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <Timer className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Next Scheduled Training</p>
                  <p className="font-medium text-white">
                    {walletNames[stats.nextScheduledRun.walletAddress.toLowerCase()] || 
                     stats.nextScheduledRun.walletAddress.slice(0, 10)}...
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-cyan-400">
                  {formatNextRun(new Date(stats.nextScheduledRun.scheduledAt))}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(stats.nextScheduledRun.scheduledAt).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
            <TabsTrigger value="runs">Run History</TabsTrigger>
            <TabsTrigger value="versions">Model Versions</TabsTrigger>
          </TabsList>
          
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-cyan-600 hover:bg-cyan-700"
            disabled={walletAddresses.length === 0}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Create Schedule
          </Button>
        </div>

        {/* Schedules Tab */}
        <TabsContent value="schedules">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Training Schedules</CardTitle>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No training schedules configured</p>
                  <p className="text-sm mt-1">Create a schedule to automatically retrain models</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {schedules.map((schedule) => {
                    const FrequencyIcon = getFrequencyIcon(schedule.frequency);
                    const currentVersion = scheduledTrainingService.getCurrentVersion(schedule.walletAddress);
                    
                    return (
                      <div
                        key={schedule.id}
                        className={`p-4 rounded-lg border ${
                          schedule.isEnabled
                            ? 'bg-slate-800/50 border-slate-600'
                            : 'bg-slate-800/20 border-slate-700 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${schedule.isEnabled ? 'bg-cyan-500/20' : 'bg-slate-700/50'}`}>
                              <FrequencyIcon className={`h-5 w-5 ${schedule.isEnabled ? 'text-cyan-400' : 'text-slate-500'}`} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-white">
                                  {walletNames[schedule.walletAddress.toLowerCase()] || 
                                   schedule.walletAddress.slice(0, 10)}...
                                </p>
                                <Badge variant="outline" className="text-xs">
                                  {schedule.network}
                                </Badge>
                                {currentVersion && (
                                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                                    v{currentVersion.version}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-slate-400 mt-1">
                                {FREQUENCY_INFO[schedule.frequency].label} at {schedule.timeOfDay}
                                {schedule.frequency === 'weekly' && ` on ${DAY_NAMES[schedule.dayOfWeek!]}`}
                                {schedule.frequency === 'monthly' && ` on day ${schedule.dayOfMonth}`}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                {schedule.nextRunAt && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Next: {formatNextRun(new Date(schedule.nextRunAt))}
                                  </span>
                                )}
                                {schedule.lastRunAt && (
                                  <span className="flex items-center gap-1">
                                    <History className="h-3 w-3" />
                                    Last: {new Date(schedule.lastRunAt).toLocaleDateString()}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Layers className="h-3 w-3" />
                                  Keep {schedule.keepVersions} versions
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewVersions(schedule.walletAddress)}
                            >
                              <GitBranch className="h-4 w-4 mr-1" />
                              Versions
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTriggerNow(schedule.id)}
                              disabled={isTraining}
                            >
                              {isTraining ? (
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Zap className="h-4 w-4 mr-1" />
                              )}
                              Train Now
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSchedule(schedule.id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Switch
                              checked={schedule.isEnabled}
                              onCheckedChange={() => handleToggleSchedule(schedule.id)}
                            />
                          </div>
                        </div>
                        
                        {/* Settings summary */}
                        <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-wrap gap-3 text-xs">
                          <span className={`flex items-center gap-1 ${schedule.autoDeployOnSuccess ? 'text-green-400' : 'text-slate-500'}`}>
                            {schedule.autoDeployOnSuccess ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Auto-deploy
                          </span>
                          <span className="text-slate-400">
                            Min accuracy: {schedule.minAccuracyForDeploy}%
                          </span>
                          {schedule.requireImprovement && (
                            <span className="text-slate-400">
                              Min improvement: {schedule.minImprovementPercent}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Run History Tab */}
        <TabsContent value="runs">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Training Run History</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {schedules.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No training runs yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedules.flatMap(schedule => 
                      scheduledTrainingService.getRunsForSchedule(schedule.id, 10)
                    ).sort((a, b) => 
                      new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
                    ).map((run) => (
                      <div
                        key={run.id}
                        className="p-4 rounded-lg bg-slate-800/50 border border-slate-700"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                {walletNames[run.walletAddress.toLowerCase()] || 
                                 run.walletAddress.slice(0, 10)}...
                              </p>
                              <Badge 
                                variant="outline" 
                                className={getStatusColor(run.status)}
                              >
                                {run.status}
                              </Badge>
                              {run.comparison && renderComparisonBadge(run.comparison)}
                            </div>
                            <p className="text-sm text-slate-400 mt-1">
                              {new Date(run.scheduledAt).toLocaleString()}
                            </p>
                            {run.statusMessage && (
                              <p className="text-sm text-slate-500 mt-1">{run.statusMessage}</p>
                            )}
                            {run.deploymentReason && (
                              <p className="text-xs text-slate-500 mt-1">
                                {run.wasDeployed ? '✓ Deployed: ' : '○ Not deployed: '}
                                {run.deploymentReason}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-sm">
                            {run.completedAt && run.startedAt && (
                              <p className="text-slate-400">
                                Duration: {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {run.comparison && (
                          <div className="mt-3 pt-3 border-t border-slate-700/50">
                            <div className="grid grid-cols-4 gap-4 text-xs">
                              <div>
                                <p className="text-slate-500">Accuracy</p>
                                <p className={run.comparison.accuracyChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {run.comparison.accuracyChange >= 0 ? '+' : ''}{run.comparison.accuracyChange.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Precision</p>
                                <p className={run.comparison.precisionChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {run.comparison.precisionChange >= 0 ? '+' : ''}{run.comparison.precisionChange.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">F1 Score</p>
                                <p className={run.comparison.f1ScoreChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {run.comparison.f1ScoreChange >= 0 ? '+' : ''}{run.comparison.f1ScoreChange.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Overall</p>
                                <p className={run.comparison.overallScoreChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {run.comparison.overallScoreChange >= 0 ? '+' : ''}{run.comparison.overallScoreChange.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Model Versions Tab */}
        <TabsContent value="versions">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">All Model Versions</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {walletAddresses.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No wallets connected</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {walletAddresses.map(address => {
                      const versions = scheduledTrainingService.getVersionsForWallet(address);
                      if (versions.length === 0) return null;
                      
                      return (
                        <div key={address}>
                          <h3 className="text-sm font-medium text-slate-300 mb-3">
                            {walletNames[address.toLowerCase()] || address.slice(0, 10)}...
                          </h3>
                          <div className="space-y-2">
                            {versions.map((version) => (
                              <div
                                key={version.id}
                                className={`p-3 rounded-lg border ${
                                  version.isDeployed
                                    ? 'bg-green-900/20 border-green-700/50'
                                    : 'bg-slate-800/30 border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="font-mono">
                                      v{version.version}
                                    </Badge>
                                    {version.isDeployed && (
                                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                        <Rocket className="h-3 w-3 mr-1" />
                                        Deployed
                                      </Badge>
                                    )}
                                    {version.comparisonWithPrevious && 
                                      renderComparisonBadge(version.comparisonWithPrevious)
                                    }
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">
                                      {new Date(version.trainedAt).toLocaleDateString()}
                                    </span>
                                    {!version.isDeployed && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDeployVersion(version.id)}
                                      >
                                        <Rocket className="h-3 w-3 mr-1" />
                                        Deploy
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="grid grid-cols-4 gap-4 mt-3 text-xs">
                                  <div>
                                    <p className="text-slate-500">Accuracy</p>
                                    <p className="text-white">{version.performanceMetrics.accuracy.toFixed(1)}%</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500">F1 Score</p>
                                    <p className="text-white">{version.performanceMetrics.f1Score.toFixed(1)}%</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500">Data Quality</p>
                                    <p className="text-white">{version.performanceMetrics.dataQuality.toFixed(0)}%</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500">Transactions</p>
                                    <p className="text-white">{version.transactionsProcessed}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Schedule Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle>Create Training Schedule</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Wallet Selection */}
            <div className="space-y-2">
              <Label>Wallet</Label>
              <Select
                value={formData.walletAddress}
                onValueChange={(value) => setFormData({ ...formData, walletAddress: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent>
                  {walletAddresses.map((address) => (
                    <SelectItem key={address} value={address}>
                      {walletNames[address.toLowerCase()] || address.slice(0, 20)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Network */}
            <div className="space-y-2">
              <Label>Network</Label>
              <Select
                value={formData.network}
                onValueChange={(value) => setFormData({ ...formData, network: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRAINING_NETWORKS).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={formData.frequency}
                onValueChange={(value) => setFormData({ ...formData, frequency: value as TrainingFrequency })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label} - {info.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time of Day */}
            <div className="space-y-2">
              <Label>Time of Day</Label>
              <Input
                type="time"
                value={formData.timeOfDay}
                onChange={(e) => setFormData({ ...formData, timeOfDay: e.target.value })}
              />
            </div>

            {/* Day of Week (for weekly) */}
            {(formData.frequency === 'weekly' || formData.frequency === 'biweekly') && (
              <div className="space-y-2">
                <Label>Day of Week</Label>
                <Select
                  value={formData.dayOfWeek.toString()}
                  onValueChange={(value) => setFormData({ ...formData, dayOfWeek: parseInt(value) as DayOfWeek })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DAY_NAMES).map(([key, name]) => (
                      <SelectItem key={key} value={key}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Day of Month (for monthly) */}
            {formData.frequency === 'monthly' && (
              <div className="space-y-2">
                <Label>Day of Month (1-28)</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={formData.dayOfMonth}
                  onChange={(e) => setFormData({ ...formData, dayOfMonth: parseInt(e.target.value) })}
                />
              </div>
            )}

            {/* History Days */}
            <div className="space-y-2">
              <Label>History Days: {formData.historyDays}</Label>
              <Slider
                value={[formData.historyDays]}
                onValueChange={([value]) => setFormData({ ...formData, historyDays: value })}
                min={7}
                max={365}
                step={7}
              />
            </div>

            {/* Auto Deploy */}
            <div className="flex items-center justify-between">
              <Label>Auto-deploy on success</Label>
              <Switch
                checked={formData.autoDeployOnSuccess}
                onCheckedChange={(checked) => setFormData({ ...formData, autoDeployOnSuccess: checked })}
              />
            </div>

            {/* Min Accuracy */}
            <div className="space-y-2">
              <Label>Minimum Accuracy for Deploy: {formData.minAccuracyForDeploy}%</Label>
              <Slider
                value={[formData.minAccuracyForDeploy]}
                onValueChange={([value]) => setFormData({ ...formData, minAccuracyForDeploy: value })}
                min={50}
                max={95}
                step={5}
              />
            </div>

            {/* Require Improvement */}
            <div className="flex items-center justify-between">
              <Label>Require improvement over previous</Label>
              <Switch
                checked={formData.requireImprovement}
                onCheckedChange={(checked) => setFormData({ ...formData, requireImprovement: checked })}
              />
            </div>

            {formData.requireImprovement && (
              <div className="space-y-2">
                <Label>Minimum Improvement: {formData.minImprovementPercent}%</Label>
                <Slider
                  value={[formData.minImprovementPercent]}
                  onValueChange={([value]) => setFormData({ ...formData, minImprovementPercent: value })}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>
            )}

            {/* Keep Versions */}
            <div className="space-y-2">
              <Label>Keep Versions: {formData.keepVersions}</Label>
              <Slider
                value={[formData.keepVersions]}
                onValueChange={([value]) => setFormData({ ...formData, keepVersions: value })}
                min={1}
                max={20}
                step={1}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSchedule} className="bg-cyan-600 hover:bg-cyan-700">
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Versions Modal */}
      <Dialog open={showVersionsModal} onOpenChange={setShowVersionsModal}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle>Model Versions</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {selectedWalletVersions.map((version) => (
                <div
                  key={version.id}
                  className={`p-4 rounded-lg border ${
                    version.isDeployed
                      ? 'bg-green-900/20 border-green-700/50'
                      : 'bg-slate-800/30 border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-lg">
                        v{version.version}
                      </Badge>
                      {version.isDeployed && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          <Rocket className="h-3 w-3 mr-1" />
                          Currently Deployed
                        </Badge>
                      )}
                    </div>
                    {!version.isDeployed && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeployVersion(version.id)}
                      >
                        <Rocket className="h-4 w-4 mr-1" />
                        Deploy This Version
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Trained</p>
                      <p className="text-white">{new Date(version.trainedAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Transactions</p>
                      <p className="text-white">{version.transactionsProcessed}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Duration</p>
                      <p className="text-white">{(version.trainingDurationMs / 1000).toFixed(1)}s</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Overall Score</p>
                      <p className="text-white">{version.performanceMetrics.overallScore.toFixed(1)}%</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 mt-3 pt-3 border-t border-slate-700/50 text-xs">
                    <div>
                      <p className="text-slate-500">Accuracy</p>
                      <Progress value={version.performanceMetrics.accuracy} className="h-1 mt-1" />
                      <p className="text-slate-300 mt-1">{version.performanceMetrics.accuracy.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Precision</p>
                      <Progress value={version.performanceMetrics.precision} className="h-1 mt-1" />
                      <p className="text-slate-300 mt-1">{version.performanceMetrics.precision.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Recall</p>
                      <Progress value={version.performanceMetrics.recall} className="h-1 mt-1" />
                      <p className="text-slate-300 mt-1">{version.performanceMetrics.recall.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500">F1 Score</p>
                      <Progress value={version.performanceMetrics.f1Score} className="h-1 mt-1" />
                      <p className="text-slate-300 mt-1">{version.performanceMetrics.f1Score.toFixed(1)}%</p>
                    </div>
                  </div>
                  
                  {version.comparisonWithPrevious && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-2">
                        Comparison with v{version.comparisonWithPrevious.previousVersion}
                      </p>
                      <div className="flex items-center gap-2">
                        {renderComparisonBadge(version.comparisonWithPrevious)}
                        <span className="text-xs text-slate-400">
                          {version.comparisonWithPrevious.recommendationReason}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScheduledTrainingDashboard;
