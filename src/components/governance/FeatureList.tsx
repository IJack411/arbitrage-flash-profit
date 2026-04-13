import React from 'react';
import { Feature } from '@/types/governance';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Users, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface FeatureListProps {
  features: Feature[];
  onSelect: (feature: Feature) => void;
  selectedId?: string;
}

const statusColors = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  deprecated: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const complianceIcons = {
  compliant: <CheckCircle className="h-4 w-4 text-green-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-400" />,
  non_compliant: <XCircle className="h-4 w-4 text-red-400" />,
  pending_review: <Clock className="h-4 w-4 text-blue-400" />,
};

export const FeatureList: React.FC<FeatureListProps> = ({ features, onSelect, selectedId }) => {
  return (
    <div className="space-y-3">
      {features.map(feature => (
        <div
          key={feature.id}
          onClick={() => onSelect(feature)}
          className={`p-4 rounded-lg border cursor-pointer transition-all ${
            selectedId === feature.id
              ? 'bg-[#00F0FF]/10 border-[#00F0FF]/50'
              : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-white font-semibold flex items-center gap-2">
                {feature.name}
                {complianceIcons[feature.complianceStatus]}
              </h3>
              <p className="text-gray-400 text-sm mt-1">{feature.description}</p>
            </div>
            <Badge className={statusColors[feature.status]}>{feature.status}</Badge>
          </div>
          
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              v{feature.version}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {feature.dependents.length} dependents
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(feature.updatedAt).toLocaleDateString()}
            </span>
          </div>
          
          <div className="flex gap-1 mt-2">
            {feature.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs border-gray-600 text-gray-400">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
