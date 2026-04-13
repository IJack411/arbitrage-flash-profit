import React from 'react';
import { ImpactAssessment as ImpactAssessmentType } from '@/types/governance';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Users, GitBranch, Shield, Clock, RotateCcw } from 'lucide-react';

interface ImpactAssessmentProps {
  assessment: ImpactAssessmentType;
  features: { id: string; name: string }[];
  users: { id: string; name: string }[];
}

const levelColors = {
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const levelIcons = {
  low: <Shield className="h-5 w-5 text-green-400" />,
  medium: <AlertTriangle className="h-5 w-5 text-yellow-400" />,
  high: <AlertTriangle className="h-5 w-5 text-orange-400" />,
  critical: <AlertTriangle className="h-5 w-5 text-red-400" />,
};

export const ImpactAssessment: React.FC<ImpactAssessmentProps> = ({ assessment, features, users }) => {
  const getFeatureName = (id: string) => features.find(f => f.id === id)?.name || id;
  const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          {levelIcons[assessment.level]}
          Impact Assessment
        </h3>
        <Badge className={levelColors[assessment.level]}>
          {assessment.level.toUpperCase()} IMPACT
        </Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Affected Features */}
        <div className="bg-gray-900/50 rounded-lg p-4">
          <h4 className="text-gray-300 text-sm font-medium flex items-center gap-2 mb-3">
            <GitBranch className="h-4 w-4 text-[#00F0FF]" />
            Affected Features ({assessment.affectedFeatures.length})
          </h4>
          <div className="space-y-2">
            {assessment.affectedFeatures.length > 0 ? (
              assessment.affectedFeatures.map(id => (
                <div key={id} className="text-gray-400 text-sm bg-gray-800 px-3 py-2 rounded">
                  {getFeatureName(id)}
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No dependent features affected</p>
            )}
          </div>
        </div>

        {/* Affected Stakeholders */}
        <div className="bg-gray-900/50 rounded-lg p-4">
          <h4 className="text-gray-300 text-sm font-medium flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-[#00F0FF]" />
            Affected Stakeholders ({assessment.affectedStakeholders.length})
          </h4>
          <div className="space-y-2">
            {assessment.affectedStakeholders.length > 0 ? (
              assessment.affectedStakeholders.map(id => (
                <div key={id} className="text-gray-400 text-sm bg-gray-800 px-3 py-2 rounded">
                  {getUserName(id)}
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No stakeholders directly affected</p>
            )}
          </div>
        </div>
      </div>

      {/* Risk Factors */}
      <div className="bg-gray-900/50 rounded-lg p-4">
        <h4 className="text-gray-300 text-sm font-medium flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-orange-400" />
          Risk Factors
        </h4>
        <ul className="space-y-2">
          {assessment.riskFactors.map((risk, i) => (
            <li key={i} className="text-gray-400 text-sm flex items-start gap-2">
              <span className="text-orange-400 mt-1">•</span>
              {risk}
            </li>
          ))}
        </ul>
      </div>

      {/* Mitigation Steps */}
      <div className="bg-gray-900/50 rounded-lg p-4">
        <h4 className="text-gray-300 text-sm font-medium flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-green-400" />
          Mitigation Steps
        </h4>
        <ul className="space-y-2">
          {assessment.mitigationSteps.map((step, i) => (
            <li key={i} className="text-gray-400 text-sm flex items-start gap-2">
              <span className="text-green-400 mt-1">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-gray-900/50 rounded-lg p-4">
          <h4 className="text-gray-300 text-sm font-medium flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-blue-400" />
            Estimated Effort
          </h4>
          <p className="text-white font-medium">{assessment.estimatedEffort}</p>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-4">
          <h4 className="text-gray-300 text-sm font-medium flex items-center gap-2 mb-2">
            <RotateCcw className="h-4 w-4 text-purple-400" />
            Rollback Plan
          </h4>
          <p className="text-gray-400 text-sm">{assessment.rollbackPlan}</p>
        </div>
      </div>
    </div>
  );
};
