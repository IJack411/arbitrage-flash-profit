export type UserRole = 'admin' | 'manager' | 'developer' | 'viewer';

export type ChangeRequestStatus = 'draft' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'implemented';

export type ComplianceStatus = 'compliant' | 'warning' | 'non_compliant' | 'pending_review';

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Feature {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'deprecated';
  version: string;
  owner: string;
  dependencies: string[];
  dependents: string[];
  createdAt: number;
  updatedAt: number;
  tags: string[];
  complianceStatus: ComplianceStatus;
}

export interface ChangeRequest {
  id: string;
  featureId: string;
  featureName: string;
  title: string;
  description: string;
  changeType: 'create' | 'modify' | 'deprecate' | 'delete';
  requestedBy: string;
  requestedAt: number;
  status: ChangeRequestStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  approvals: Approval[];
  requiredApprovals: number;
  impactAssessment: ImpactAssessment | null;
  validationResults: ValidationResult[];
  comments: Comment[];
}

export interface Approval {
  id: string;
  userId: string;
  userName: string;
  role: UserRole;
  decision: 'approved' | 'rejected' | 'pending';
  comment: string;
  timestamp: number;
}

export interface ImpactAssessment {
  level: ImpactLevel;
  affectedFeatures: string[];
  affectedStakeholders: string[];
  riskFactors: string[];
  mitigationSteps: string[];
  estimatedEffort: string;
  rollbackPlan: string;
}

export interface ValidationResult {
  rule: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: number;
}

export interface Notification {
  id: string;
  type: 'change_request' | 'approval_needed' | 'status_change' | 'dependency_modified';
  title: string;
  message: string;
  featureId: string;
  changeRequestId?: string;
  timestamp: number;
  read: boolean;
  userId: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  subscribedFeatures: string[];
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'error' | 'warning' | 'info';
  condition: string;
}
