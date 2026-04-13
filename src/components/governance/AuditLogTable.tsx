import React from 'react';
import { AuditEntry } from '@/types/auditTypes';
import { Badge } from '@/components/ui/badge';
import { FileText, GitPullRequest, Shield, User, Settings, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

interface Props {
  entries: AuditEntry[];
}

const categoryIcons: Record<string, React.ReactNode> = {
  change_request: <GitPullRequest className="h-4 w-4" />,
  feature: <FileText className="h-4 w-4" />,
  approval: <CheckCircle className="h-4 w-4" />,
  compliance: <Shield className="h-4 w-4" />,
  user: <User className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
};

const actionColors: Record<string, string> = {
  change_request_created: 'bg-blue-500/20 text-blue-400',
  change_request_submitted: 'bg-purple-500/20 text-purple-400',
  change_request_approved: 'bg-green-500/20 text-green-400',
  change_request_rejected: 'bg-red-500/20 text-red-400',
  feature_modified: 'bg-yellow-500/20 text-yellow-400',
  impact_assessment_run: 'bg-cyan-500/20 text-cyan-400',
  role_changed: 'bg-orange-500/20 text-orange-400',
};

export const AuditLogTable: React.FC<Props> = ({ entries }) => {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  const formatAction = (action: string) => action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  if (entries.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center">
        <Clock className="h-12 w-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">No audit entries found</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-900/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Time</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Action</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Entity</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">User</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {entries.map(entry => (
            <tr key={entry.id} className="hover:bg-gray-700/30 transition-colors">
              <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">{formatTime(entry.createdAt)}</td>
              <td className="px-4 py-3">
                <Badge className={actionColors[entry.actionType] || 'bg-gray-500/20 text-gray-400'}>
                  {formatAction(entry.actionType)}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{categoryIcons[entry.actionCategory]}</span>
                  <span className="text-white text-sm">{entry.entityName}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="text-sm">
                  <p className="text-white">{entry.userName}</p>
                  <p className="text-gray-500 text-xs">{entry.userRole}</p>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">{entry.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
