import React from 'react';
import { ValidationRule, ValidationResult } from '@/types/governance';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { CheckCircle, XCircle, AlertTriangle, Info, Shield, Settings } from 'lucide-react';

interface ComplianceTrackerProps {
  rules: ValidationRule[];
  results?: ValidationResult[];
  onToggleRule?: (ruleId: string, enabled: boolean) => void;
  showResults?: boolean;
}

const severityColors = {
  error: 'text-red-400 bg-red-500/20',
  warning: 'text-yellow-400 bg-yellow-500/20',
  info: 'text-blue-400 bg-blue-500/20',
};

const severityIcons = {
  error: <XCircle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

export const ComplianceTracker: React.FC<ComplianceTrackerProps> = ({ 
  rules, 
  results = [], 
  onToggleRule,
  showResults = false 
}) => {
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const complianceScore = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* Compliance Score */}
      {showResults && results.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#00F0FF]" />
              Compliance Score
            </h3>
            <Badge className={complianceScore >= 80 ? 'bg-green-500/20 text-green-400' : complianceScore >= 50 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}>
              {complianceScore}%
            </Badge>
          </div>
          
          <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
            <div 
              className={`h-3 rounded-full transition-all ${complianceScore >= 80 ? 'bg-green-500' : complianceScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${complianceScore}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-green-500/10 rounded-lg p-3">
              <p className="text-green-400 text-2xl font-bold">{passedCount}</p>
              <p className="text-gray-400 text-xs">Passed</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3">
              <p className="text-red-400 text-2xl font-bold">{totalCount - passedCount}</p>
              <p className="text-gray-400 text-xs">Failed</p>
            </div>
            <div className="bg-gray-500/10 rounded-lg p-3">
              <p className="text-gray-300 text-2xl font-bold">{totalCount}</p>
              <p className="text-gray-400 text-xs">Total</p>
            </div>
          </div>
        </div>
      )}

      {/* Validation Results */}
      {showResults && results.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-white font-semibold mb-4">Validation Results</h3>
          <div className="space-y-2">
            {results.map((result, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${result.passed ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {result.passed ? (
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                ) : (
                  <span className={severityColors[result.severity]}>{severityIcons[result.severity]}</span>
                )}
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{result.rule}</p>
                  <p className="text-gray-400 text-xs">{result.message}</p>
                </div>
                <Badge className={severityColors[result.severity]}>{result.severity}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validation Rules Configuration */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <h3 className="text-white font-semibold flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-gray-400" />
          Validation Rules
        </h3>
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-start justify-between p-3 bg-gray-900/50 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`p-1 rounded ${severityColors[rule.severity]}`}>
                    {severityIcons[rule.severity]}
                  </span>
                  <p className="text-white text-sm font-medium">{rule.name}</p>
                </div>
                <p className="text-gray-400 text-xs mt-1 ml-7">{rule.description}</p>
              </div>
              {onToggleRule && (
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) => onToggleRule(rule.id, checked)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
