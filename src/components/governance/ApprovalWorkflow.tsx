import React, { useState } from 'react';
import { ChangeRequest } from '@/types/governance';
import { useGovernance } from '@/contexts/GovernanceContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, Clock, User, MessageSquare, AlertTriangle, Zap } from 'lucide-react';

interface ApprovalWorkflowProps {
  changeRequest: ChangeRequest;
}

const statusColors = {
  draft: 'bg-gray-500/20 text-gray-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  in_review: 'bg-blue-500/20 text-blue-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
  implemented: 'bg-purple-500/20 text-purple-400',
};

const priorityColors = {
  low: 'bg-gray-500/20 text-gray-400',
  medium: 'bg-blue-500/20 text-blue-400',
  high: 'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
};

export const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({ changeRequest }) => {
  const { approveChangeRequest, rejectChangeRequest, runImpactAssessment, hasPermission, currentUser } = useGovernance();
  const [comment, setComment] = useState('');
  const [showCommentBox, setShowCommentBox] = useState(false);

  const hasAlreadyVoted = changeRequest.approvals.some(a => a.userId === currentUser.id);
  const approvalCount = changeRequest.approvals.filter(a => a.decision === 'approved').length;
  const canApprove = hasPermission('approve') && !hasAlreadyVoted && changeRequest.status !== 'approved' && changeRequest.status !== 'rejected';

  const handleApprove = () => {
    approveChangeRequest(changeRequest.id, comment);
    setComment('');
    setShowCommentBox(false);
  };

  const handleReject = () => {
    rejectChangeRequest(changeRequest.id, comment);
    setComment('');
    setShowCommentBox(false);
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-white font-semibold text-lg">{changeRequest.title}</h3>
          <p className="text-gray-400 text-sm mt-1">{changeRequest.featureName}</p>
        </div>
        <div className="flex gap-2">
          <Badge className={priorityColors[changeRequest.priority]}>{changeRequest.priority}</Badge>
          <Badge className={statusColors[changeRequest.status]}>{changeRequest.status.replace('_', ' ')}</Badge>
        </div>
      </div>

      <p className="text-gray-300 text-sm">{changeRequest.description}</p>

      {/* Approval Progress */}
      <div className="bg-gray-900/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 text-sm">Approval Progress</span>
          <span className="text-white font-medium">{approvalCount}/{changeRequest.requiredApprovals}</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-[#00F0FF] h-2 rounded-full transition-all"
            style={{ width: `${(approvalCount / changeRequest.requiredApprovals) * 100}%` }}
          />
        </div>
      </div>

      {/* Approvals List */}
      <div className="space-y-2">
        {changeRequest.approvals.map(approval => (
          <div key={approval.id} className="flex items-center gap-3 p-2 bg-gray-900/30 rounded-lg">
            {approval.decision === 'approved' ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : (
              <XCircle className="h-5 w-5 text-red-400" />
            )}
            <div className="flex-1">
              <span className="text-white text-sm">{approval.userName}</span>
              <span className="text-gray-500 text-xs ml-2">({approval.role})</span>
              {approval.comment && <p className="text-gray-400 text-xs mt-1">{approval.comment}</p>}
            </div>
            <span className="text-gray-500 text-xs">{new Date(approval.timestamp).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      {/* Impact Assessment */}
      {!changeRequest.impactAssessment && changeRequest.status === 'draft' && (
        <Button onClick={() => runImpactAssessment(changeRequest.id)} variant="outline" className="w-full border-gray-600">
          <Zap className="h-4 w-4 mr-2" />
          Run Impact Assessment
        </Button>
      )}

      {/* Actions */}
      {canApprove && (
        <div className="space-y-3 pt-2 border-t border-gray-700">
          {showCommentBox ? (
            <>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a comment (optional)..."
                className="bg-gray-900 border-gray-700 text-white"
              />
              <div className="flex gap-2">
                <Button onClick={handleApprove} className="flex-1 bg-green-600 hover:bg-green-700">
                  <CheckCircle className="h-4 w-4 mr-2" />Approve
                </Button>
                <Button onClick={handleReject} variant="destructive" className="flex-1">
                  <XCircle className="h-4 w-4 mr-2" />Reject
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={() => setShowCommentBox(true)} className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
              <MessageSquare className="h-4 w-4 mr-2" />Review & Vote
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
