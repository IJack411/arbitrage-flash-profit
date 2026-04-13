import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
} from '@/components/ui/dialog';
import {
  History,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Wallet,
  UserX,
  Server,
  Shield,
  Bell,
  FileText,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  User,
  Zap,
  ExternalLink,
  Download,
} from 'lucide-react';
import {
  automatedResponseService,
  AuditLogEntry,
  ExecutedAction,
  ActionType,
} from '@/lib/automatedResponseService';
import { AlertType } from '@/lib/adminAlertService';
import { useToast } from '@/hooks/use-toast';

export const AuditLogPanel: React.FC = () => {
  const { toast } = useToast();
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [filteredLog, setFilteredLog] = useState<AuditLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'partial' | 'failed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | AlertType>('all');
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'automated' | 'manual'>('all');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    setAuditLog(automatedResponseService.getAuditLog());

    const unsubscribe = automatedResponseService.subscribeToAuditLog((log) => {
      setAuditLog(log);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let filtered = [...auditLog];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (entry) =>
          entry.ruleName.toLowerCase().includes(query) ||
          entry.alertId.toLowerCase().includes(query) ||
          entry.actions.some((a) => a.actionName.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((entry) => entry.status === statusFilter);
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((entry) => entry.alertType === typeFilter);
    }

    // Apply trigger filter
    if (triggerFilter !== 'all') {
      filtered = filtered.filter((entry) => entry.triggeredBy === triggerFilter);
    }

    setFilteredLog(filtered);
  }, [auditLog, searchQuery, statusFilter, typeFilter, triggerFilter]);

  const handleRollback = async (entryId: string) => {
    const success = await automatedResponseService.rollbackAction(entryId, 'admin@platform.com');
    if (success) {
      toast({
        title: 'Rollback Initiated',
        description: 'The automated action has been rolled back',
      });
    } else {
      toast({
        title: 'Rollback Failed',
        description: 'Unable to rollback this action',
        variant: 'destructive',
      });
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(filteredLog, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: 'Audit log has been exported' });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'partial':
        return <AlertCircle className="h-4 w-4 text-yellow-400" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-400 border-green-500/50 bg-green-500/10';
      case 'partial':
        return 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10';
      case 'failed':
        return 'text-red-400 border-red-500/50 bg-red-500/10';
      default:
        return 'text-gray-400 border-gray-500/50 bg-gray-500/10';
    }
  };

  const getActionIcon = (actionType: ActionType) => {
    switch (actionType) {
      case 'suspend_wallet':
        return <Wallet className="h-4 w-4" />;
      case 'pause_trading':
        return <Pause className="h-4 w-4" />;
      case 'restrict_user':
        return <UserX className="h-4 w-4" />;
      case 'scale_service':
        return <Server className="h-4 w-4" />;
      case 'block_ip':
        return <Shield className="h-4 w-4" />;
      case 'notify_team':
        return <Bell className="h-4 w-4" />;
      case 'create_incident':
        return <FileText className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const getActionStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'executing':
        return 'text-blue-400';
      case 'rolled_back':
        return 'text-purple-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatDuration = (start: string, end?: string) => {
    if (!end) return 'In progress';
    const duration = new Date(end).getTime() - new Date(start).getTime();
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const alertTypes: AlertType[] = [
    'system_health',
    'high_risk_wallet',
    'unusual_trading',
    'fee_collection_failed',
    'security_breach',
    'service_degraded',
    'user_flagged',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
            <History className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Audit Log</h3>
            <p className="text-sm text-gray-400">
              Complete history of all automated actions
            </p>
          </div>
        </div>
        <Button variant="outline" className="border-gray-600" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export Log
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Actions</p>
                <p className="text-2xl font-bold text-white">{auditLog.length}</p>
              </div>
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <History className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Successful</p>
                <p className="text-2xl font-bold text-green-400">
                  {auditLog.filter((e) => e.status === 'success').length}
                </p>
              </div>
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Partial</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {auditLog.filter((e) => e.status === 'partial').length}
                </p>
              </div>
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Failed</p>
                <p className="text-2xl font-bold text-red-400">
                  {auditLog.filter((e) => e.status === 'failed').length}
                </p>
              </div>
              <div className="p-2 bg-red-500/20 rounded-lg">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by rule name, alert ID, or action..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-gray-700 border-gray-600"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'success' | 'partial' | 'failed')}>
              <SelectTrigger className="w-[140px] bg-gray-700 border-gray-600">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | AlertType)}>
              <SelectTrigger className="w-[160px] bg-gray-700 border-gray-600">
                <SelectValue placeholder="Alert Type" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600">
                <SelectItem value="all">All Types</SelectItem>
                {alertTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={triggerFilter} onValueChange={(v) => setTriggerFilter(v as 'all' | 'automated' | 'manual')}>
              <SelectTrigger className="w-[140px] bg-gray-700 border-gray-600">
                <SelectValue placeholder="Trigger" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600">
                <SelectItem value="all">All Triggers</SelectItem>
                <SelectItem value="automated">Automated</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log List */}
      <div className="space-y-3">
        {filteredLog.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-12 text-center">
              <History className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No audit log entries found</p>
            </CardContent>
          </Card>
        ) : (
          filteredLog.map((entry) => (
            <Card key={entry.id} className="bg-gray-800 border-gray-700">
              <CardContent className="p-0">
                {/* Entry Header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-700/50"
                  onClick={() =>
                    setExpandedEntry(expandedEntry === entry.id ? null : entry.id)
                  }
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${getStatusColor(entry.status)}`}>
                      {getStatusIcon(entry.status)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white">{entry.ruleName}</h4>
                        <Badge
                          variant="outline"
                          className={getStatusColor(entry.status)}
                        >
                          {entry.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            entry.triggeredBy === 'automated'
                              ? 'text-purple-400 border-purple-500/50'
                              : 'text-blue-400 border-blue-500/50'
                          }
                        >
                          {entry.triggeredBy === 'automated' ? (
                            <>
                              <Zap className="h-3 w-3 mr-1" />
                              Auto
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3 mr-1" />
                              Manual
                            </>
                          )}
                        </Badge>
                        {entry.rollbackAt && (
                          <Badge
                            variant="outline"
                            className="text-orange-400 border-orange-500/50"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Rolled Back
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        <span>Alert: {entry.alertType.replace(/_/g, ' ')}</span>
                        <span>{entry.actions.length} action(s)</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-1">
                      {entry.actions.slice(0, 3).map((action, idx) => (
                        <div
                          key={idx}
                          className={`p-1.5 rounded-full bg-gray-700 border-2 border-gray-800 ${getActionStatusColor(
                            action.status
                          )}`}
                          title={action.actionName}
                        >
                          {getActionIcon(action.actionType)}
                        </div>
                      ))}
                      {entry.actions.length > 3 && (
                        <div className="p-1.5 rounded-full bg-gray-700 border-2 border-gray-800 text-gray-400 text-xs font-medium flex items-center justify-center w-7 h-7">
                          +{entry.actions.length - 3}
                        </div>
                      )}
                    </div>
                    {expandedEntry === entry.id ? (
                      <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedEntry === entry.id && (
                  <div className="border-t border-gray-700 p-4 space-y-4">
                    {/* Actions */}
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-3">
                        Executed Actions
                      </h5>
                      <div className="space-y-2">
                        {entry.actions.map((action) => (
                          <div
                            key={action.id}
                            className="flex items-center justify-between bg-gray-700/50 p-3 rounded"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`p-2 rounded ${getActionStatusColor(
                                  action.status
                                )} bg-gray-600/50`}
                              >
                                {getActionIcon(action.actionType)}
                              </div>
                              <div>
                                <p className="text-white font-medium">
                                  {action.actionName}
                                </p>
                                <div className="flex items-center gap-3 text-sm text-gray-400">
                                  <span
                                    className={getActionStatusColor(action.status)}
                                  >
                                    {action.status}
                                  </span>
                                  <span>
                                    Duration:{' '}
                                    {formatDuration(
                                      action.startedAt,
                                      action.completedAt
                                    )}
                                  </span>
                                  {action.targetEntity && (
                                    <span>
                                      Target: {action.targetEntity} ({action.targetId})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              {action.error ? (
                                <p className="text-sm text-red-400">{action.error}</p>
                              ) : action.result ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEntry(entry);
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  View Result
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    {entry.notes && (
                      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
                        <p className="text-sm text-yellow-400">{entry.notes}</p>
                      </div>
                    )}

                    {/* Rollback Info */}
                    {entry.rollbackAt && (
                      <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded">
                        <div className="flex items-center gap-2 text-orange-400">
                          <RotateCcw className="h-4 w-4" />
                          <span className="font-medium">Rolled Back</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                          By {entry.rollbackBy} at {formatTimestamp(entry.rollbackAt)}
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                      <div className="text-xs text-gray-500">
                        {entry.triggeredBy === 'manual' && entry.operator && (
                          <span>Triggered by: {entry.operator}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!entry.rollbackAt &&
                          entry.actions.some(
                            (a) =>
                              a.status === 'completed' &&
                              ['suspend_wallet', 'pause_trading', 'restrict_user', 'block_ip'].includes(
                                a.actionType
                              )
                          ) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                              onClick={() => handleRollback(entry.id)}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Rollback
                            </Button>
                          )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Result Details Modal */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Action Results</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              {selectedEntry.actions.map((action) => (
                <div key={action.id} className="space-y-2">
                  <h4 className="font-medium text-white">{action.actionName}</h4>
                  {action.result && (
                    <pre className="p-3 bg-gray-900 rounded text-sm text-gray-300 overflow-auto">
                      {JSON.stringify(action.result, null, 2)}
                    </pre>
                  )}
                  {action.error && (
                    <p className="text-sm text-red-400">{action.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
