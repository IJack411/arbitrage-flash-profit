import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Zap,
  Plus,
  Edit2,
  Trash2,
  Play,
  Pause,
  Clock,
  AlertTriangle,
  Wallet,
  UserX,
  Server,
  Shield,
  Bell,
  FileText,
  ChevronDown,
  ChevronUp,
  Settings,
  CheckCircle2,
  XCircle,
  History,
} from 'lucide-react';
import {
  automatedResponseService,
  ResponseRule,
  ResponseAction,
  ActionType,
  RuleCondition,
} from '@/lib/automatedResponseService';
import { AlertType, AlertSeverity } from '@/lib/adminAlertService';
import { useToast } from '@/hooks/use-toast';

interface AutomatedResponsePanelProps {
  onViewAuditLog?: () => void;
}

export const AutomatedResponsePanel: React.FC<AutomatedResponsePanelProps> = ({ onViewAuditLog }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<ResponseRule[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<ResponseRule | null>(null);

  useEffect(() => {
    setRules(automatedResponseService.getRules());
    setIsEnabled(automatedResponseService.isAutomationEnabled());

    const unsubscribe = automatedResponseService.subscribeToRules((updatedRules) => {
      setRules(updatedRules);
    });

    return () => unsubscribe();
  }, []);

  const handleToggleAutomation = (enabled: boolean) => {
    setIsEnabled(enabled);
    automatedResponseService.setAutomationEnabled(enabled);
    toast({
      title: enabled ? 'Automation Enabled' : 'Automation Disabled',
      description: enabled
        ? 'Automated responses are now active'
        : 'All automated responses have been paused',
    });
  };

  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    automatedResponseService.toggleRule(ruleId, enabled);
    toast({
      title: enabled ? 'Rule Enabled' : 'Rule Disabled',
      description: `Rule has been ${enabled ? 'activated' : 'deactivated'}`,
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    automatedResponseService.deleteRule(ruleId);
    toast({
      title: 'Rule Deleted',
      description: 'The response rule has been removed',
    });
  };

  const handleEditRule = (rule: ResponseRule) => {
    setEditingRule(rule);
    setShowRuleEditor(true);
  };

  const handleCreateRule = () => {
    setEditingRule(null);
    setShowRuleEditor(true);
  };

  const getActionIcon = (actionType: ActionType) => {
    switch (actionType) {
      case 'suspend_wallet': return <Wallet className="h-4 w-4" />;
      case 'pause_trading': return <Pause className="h-4 w-4" />;
      case 'restrict_user': return <UserX className="h-4 w-4" />;
      case 'scale_service': return <Server className="h-4 w-4" />;
      case 'block_ip': return <Shield className="h-4 w-4" />;
      case 'notify_team': return <Bell className="h-4 w-4" />;
      case 'create_incident': return <FileText className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  const getActionColor = (actionType: ActionType) => {
    switch (actionType) {
      case 'suspend_wallet':
      case 'block_ip': return 'text-red-400 bg-red-500/20';
      case 'pause_trading':
      case 'restrict_user': return 'text-yellow-400 bg-yellow-500/20';
      case 'scale_service': return 'text-blue-400 bg-blue-500/20';
      case 'notify_team': return 'text-cyan-400 bg-cyan-500/20';
      case 'create_incident': return 'text-gray-400 bg-gray-500/20';
      default: return 'text-purple-400 bg-purple-500/20';
    }
  };

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return 'text-red-400 border-red-500/50';
      case 'warning': return 'text-yellow-400 border-yellow-500/50';
      default: return 'text-blue-400 border-blue-500/50';
    }
  };

  const getAlertTypeLabel = (type: AlertType) => {
    const labels: Record<AlertType, string> = {
      system_health: 'System Health',
      high_risk_wallet: 'High-Risk Wallet',
      unusual_trading: 'Unusual Trading',
      fee_collection_failed: 'Fee Collection Failed',
      security_breach: 'Security Breach',
      service_degraded: 'Service Degraded',
      user_flagged: 'User Flagged',
      threshold_exceeded: 'Threshold Exceeded',
    };
    return labels[type];
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Automated Responses</h3>
            <p className="text-sm text-gray-400">
              Configure automatic actions for specific alert types
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="automation-toggle" className="text-gray-400">
              Automation
            </Label>
            <Switch
              id="automation-toggle"
              checked={isEnabled}
              onCheckedChange={handleToggleAutomation}
            />
            <Badge
              variant="outline"
              className={isEnabled ? 'text-green-400 border-green-500' : 'text-gray-400 border-gray-500'}
            >
              {isEnabled ? 'Active' : 'Paused'}
            </Badge>
          </div>
          {onViewAuditLog && (
            <Button
              variant="outline"
              className="border-gray-600"
              onClick={onViewAuditLog}
            >
              <History className="h-4 w-4 mr-2" />
              Audit Log
            </Button>
          )}
          <Button
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            onClick={handleCreateRule}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Rule
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Rules</p>
                <p className="text-2xl font-bold text-white">{rules.length}</p>
              </div>
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Settings className="h-5 w-5 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Active Rules</p>
                <p className="text-2xl font-bold text-green-400">
                  {rules.filter(r => r.enabled).length}
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
                <p className="text-gray-400 text-sm">Disabled Rules</p>
                <p className="text-2xl font-bold text-gray-400">
                  {rules.filter(r => !r.enabled).length}
                </p>
              </div>
              <div className="p-2 bg-gray-500/20 rounded-lg">
                <XCircle className="h-5 w-5 text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Triggers</p>
                <p className="text-2xl font-bold text-[#00F0FF]">
                  {rules.reduce((sum, r) => sum + r.triggerCount, 0)}
                </p>
              </div>
              <div className="p-2 bg-[#00F0FF]/20 rounded-lg">
                <Zap className="h-5 w-5 text-[#00F0FF]" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {rules.map((rule) => (
          <Card
            key={rule.id}
            className={`bg-gray-800 border-gray-700 transition-all ${
              !rule.enabled ? 'opacity-60' : ''
            }`}
          >
            <CardContent className="p-0">
              {/* Rule Header */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-700/50"
                onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
              >
                <div className="flex items-center gap-4">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => {
                      handleToggleRule(rule.id, checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-white">{rule.name}</h4>
                      <Badge
                        variant="outline"
                        className={getSeverityColor(rule.severityThreshold)}
                      >
                        {rule.severityThreshold}+
                      </Badge>
                      <Badge variant="outline" className="text-gray-400 border-gray-600">
                        {getAlertTypeLabel(rule.alertType)}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{rule.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-400">Triggered {rule.triggerCount} times</p>
                    <p className="text-xs text-gray-500">
                      Last: {formatTimestamp(rule.lastTriggered)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {rule.actions.map((action, idx) => (
                      <div
                        key={idx}
                        className={`p-1.5 rounded ${getActionColor(action.type)}`}
                        title={action.name}
                      >
                        {getActionIcon(action.type)}
                      </div>
                    ))}
                  </div>
                  {expandedRule === rule.id ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedRule === rule.id && (
                <div className="border-t border-gray-700 p-4 space-y-4">
                  {/* Conditions */}
                  {rule.conditions.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-2">Conditions</h5>
                      <div className="space-y-2">
                        {rule.conditions.map((condition) => (
                          <div
                            key={condition.id}
                            className="flex items-center gap-2 text-sm bg-gray-700/50 p-2 rounded"
                          >
                            <code className="text-[#00F0FF]">{condition.field}</code>
                            <span className="text-gray-400">
                              {condition.operator.replace('_', ' ')}
                            </span>
                            <code className="text-purple-400">{String(condition.value)}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div>
                    <h5 className="text-sm font-medium text-gray-300 mb-2">Actions</h5>
                    <div className="space-y-2">
                      {rule.actions.map((action) => (
                        <div
                          key={action.id}
                          className="flex items-center justify-between bg-gray-700/50 p-3 rounded"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded ${getActionColor(action.type)}`}>
                              {getActionIcon(action.type)}
                            </div>
                            <div>
                              <p className="text-white font-medium">{action.name}</p>
                              <p className="text-sm text-gray-400">{action.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-400">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {action.cooldownMinutes}m cooldown
                            </div>
                            {action.isReversible && (
                              <Badge variant="outline" className="text-green-400 border-green-500/50">
                                Reversible
                              </Badge>
                            )}
                            {action.requiresApproval && (
                              <Badge variant="outline" className="text-yellow-400 border-yellow-500/50">
                                Requires Approval
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-500">
                      Created: {formatTimestamp(rule.createdAt)} | Updated: {formatTimestamp(rule.updatedAt)}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-gray-600"
                        onClick={() => handleEditRule(rule)}
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rule Editor Modal */}
      <RuleEditorModal
        isOpen={showRuleEditor}
        onClose={() => setShowRuleEditor(false)}
        rule={editingRule}
      />
    </div>
  );
};

// Rule Editor Modal Component
interface RuleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: ResponseRule | null;
}

const RuleEditorModal: React.FC<RuleEditorModalProps> = ({ isOpen, onClose, rule }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [alertType, setAlertType] = useState<AlertType>('system_health');
  const [severityThreshold, setSeverityThreshold] = useState<AlertSeverity>('warning');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setDescription(rule.description);
      setAlertType(rule.alertType);
      setSeverityThreshold(rule.severityThreshold);
      setEnabled(rule.enabled);
    } else {
      setName('');
      setDescription('');
      setAlertType('system_health');
      setSeverityThreshold('warning');
      setEnabled(true);
    }
  }, [rule, isOpen]);

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Rule name is required', variant: 'destructive' });
      return;
    }

    if (rule) {
      automatedResponseService.updateRule(rule.id, {
        name,
        description,
        alertType,
        severityThreshold,
        enabled,
      });
      toast({ title: 'Rule Updated', description: 'Response rule has been updated' });
    } else {
      automatedResponseService.createRule({
        name,
        description,
        alertType,
        severityThreshold,
        enabled,
        conditions: [],
        actions: [
          {
            id: `action-${Date.now()}`,
            type: 'notify_team',
            name: 'Notify Team',
            description: 'Send notification to the team',
            parameters: { channel: '#alerts' },
            isReversible: false,
            cooldownMinutes: 5,
            requiresApproval: false,
          },
        ],
      });
      toast({ title: 'Rule Created', description: 'New response rule has been created' });
    }

    onClose();
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-400" />
            {rule ? 'Edit Response Rule' : 'Create Response Rule'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Rule Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter rule name"
              className="bg-gray-700 border-gray-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-description">Description</Label>
            <Textarea
              id="rule-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this rule does"
              className="bg-gray-700 border-gray-600"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Alert Type</Label>
              <Select value={alertType} onValueChange={(v) => setAlertType(v as AlertType)}>
                <SelectTrigger className="bg-gray-700 border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  {alertTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Severity Threshold</Label>
              <Select
                value={severityThreshold}
                onValueChange={(v) => setSeverityThreshold(v as AlertSeverity)}
              >
                <SelectTrigger className="bg-gray-700 border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="info">Info & Above</SelectItem>
                  <SelectItem value="warning">Warning & Above</SelectItem>
                  <SelectItem value="critical">Critical Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-white font-medium">Enable Rule</p>
              <p className="text-sm text-gray-400">Rule will trigger automatically when conditions are met</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            {rule ? 'Update Rule' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
