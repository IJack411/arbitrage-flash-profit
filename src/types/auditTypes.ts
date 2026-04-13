export type AuditActionType = 
  | 'change_request_created'
  | 'change_request_submitted'
  | 'change_request_approved'
  | 'change_request_rejected'
  | 'change_request_implemented'
  | 'feature_created'
  | 'feature_modified'
  | 'feature_deprecated'
  | 'feature_deleted'
  | 'impact_assessment_run'
  | 'validation_executed'
  | 'role_changed'
  | 'notification_sent'
  | 'compliance_check';

export type AuditCategory = 'change_request' | 'feature' | 'approval' | 'compliance' | 'user' | 'system';

export type AuditEntityType = 'change_request' | 'feature' | 'user' | 'validation_rule' | 'notification';

export interface AuditEntry {
  id: string;
  actionType: AuditActionType;
  actionCategory: AuditCategory;
  entityType: AuditEntityType;
  entityId: string;
  entityName: string;
  userId: string;
  userName: string;
  userRole: string;
  description: string;
  metadata: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  createdAt: number;
  synced?: boolean;
}

export interface AuditFilter {
  actionTypes?: AuditActionType[];
  categories?: AuditCategory[];
  entityTypes?: AuditEntityType[];
  userId?: string;
  entityId?: string;
  startDate?: number;
  endDate?: number;
  searchQuery?: string;
}

export interface AuditExportOptions {
  format: 'csv' | 'json';
  filters?: AuditFilter;
  includeMetadata?: boolean;
}
