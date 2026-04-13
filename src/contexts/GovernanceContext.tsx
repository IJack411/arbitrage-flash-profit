import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Feature, ChangeRequest, User, ValidationRule, Notification, UserRole } from '@/types/governance';
import { AuditEntry, AuditFilter } from '@/types/auditTypes';
import { mockUsers, mockFeatures, mockValidationRules, generateMockChangeRequests } from '@/data/governanceData';
import { auditService } from '@/lib/auditService';

interface GovernanceContextType {
  currentUser: User;
  users: User[];
  features: Feature[];
  changeRequests: ChangeRequest[];
  validationRules: ValidationRule[];
  notifications: Notification[];
  auditLogs: AuditEntry[];
  setCurrentUser: (user: User) => void;
  createChangeRequest: (request: Partial<ChangeRequest>) => void;
  approveChangeRequest: (requestId: string, comment: string) => void;
  rejectChangeRequest: (requestId: string, comment: string) => void;
  runImpactAssessment: (requestId: string) => void;
  markNotificationRead: (notificationId: string) => void;
  hasPermission: (action: string) => boolean;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  refreshAuditLogs: (filter?: AuditFilter) => Promise<void>;
}

const GovernanceContext = createContext<GovernanceContextType | null>(null);

export const useGovernance = () => {
  const context = useContext(GovernanceContext);
  if (!context) throw new Error('useGovernance must be used within GovernanceProvider');
  return context;
};

export const GovernanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUserState] = useState<User>(mockUsers[0]);
  const [users] = useState<User[]>(mockUsers);
  const [features] = useState<Feature[]>(mockFeatures);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>(generateMockChangeRequests());
  const [validationRules] = useState<ValidationRule[]>(mockValidationRules);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  const refreshAuditLogs = useCallback(async (filter?: AuditFilter) => {
    try {
      const logs = await auditService.getLogs(filter);
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch {
      setAuditLogs([]);
    }
  }, []);

  useEffect(() => { refreshAuditLogs(); }, [refreshAuditLogs]);

  const logAudit = useCallback(async (entry: Omit<AuditEntry, 'id' | 'createdAt' | 'synced'>) => {
    try {
      await auditService.createEntry(entry);
      refreshAuditLogs();
    } catch {
      // Ignore audit write failures to avoid interrupting primary user flows.
    }
  }, [refreshAuditLogs]);

  const hasPermission = useCallback((action: string): boolean => {
    const perms: Record<UserRole, string[]> = { admin: ['create', 'approve', 'reject', 'delete', 'configure'], manager: ['create', 'approve', 'reject'], developer: ['create'], viewer: [] };
    return perms[currentUser.role]?.includes(action) || false;
  }, [currentUser]);

  const setCurrentUser = useCallback((user: User) => {
    const prev = currentUser;
    setCurrentUserState(user);
    logAudit({ actionType: 'role_changed', actionCategory: 'user', entityType: 'user', entityId: user.id, entityName: user.name, userId: user.id, userName: user.name, userRole: user.role, description: `Role changed from ${prev.role} to ${user.role}`, metadata: { previousRole: prev.role, newRole: user.role }, previousState: { role: prev.role }, newState: { role: user.role } });
  }, [currentUser, logAudit]);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const n: Notification = { ...notification, id: `n-${Date.now()}`, timestamp: Date.now(), read: false };
    setNotifications(prev => [n, ...prev]);
  }, []);

  const createChangeRequest = useCallback((request: Partial<ChangeRequest>) => {
    const feature = features.find(f => f.id === request.featureId);
    const newReq: ChangeRequest = { id: `cr-${Date.now()}`, featureId: request.featureId || '', featureName: feature?.name || '', title: request.title || '', description: request.description || '', changeType: request.changeType || 'modify', requestedBy: currentUser.id, requestedAt: Date.now(), status: 'draft', priority: request.priority || 'medium', approvals: [], requiredApprovals: 2, impactAssessment: null, validationResults: [], comments: [] };
    setChangeRequests(prev => [newReq, ...prev]);
    logAudit({ actionType: 'change_request_created', actionCategory: 'change_request', entityType: 'change_request', entityId: newReq.id, entityName: newReq.title, userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, description: `Created change request "${newReq.title}" for ${feature?.name}`, metadata: { featureId: request.featureId, changeType: request.changeType, priority: request.priority }, newState: newReq });
    if (feature) users.filter(u => u.subscribedFeatures.includes(feature.id) && u.id !== currentUser.id).forEach(u => addNotification({ type: 'change_request', title: 'New Change Request', message: `${currentUser.name} created a change request for ${feature.name}`, featureId: feature.id, changeRequestId: newReq.id, userId: u.id }));
  }, [currentUser, features, users, addNotification, logAudit]);

  const approveChangeRequest = useCallback((requestId: string, comment: string) => {
    setChangeRequests(prev => prev.map(cr => {
      if (cr.id !== requestId) return cr;
      const approval = { id: `a-${Date.now()}`, userId: currentUser.id, userName: currentUser.name, role: currentUser.role, decision: 'approved' as const, comment, timestamp: Date.now() };
      const approvals = [...cr.approvals, approval];
      const status = approvals.filter(a => a.decision === 'approved').length >= cr.requiredApprovals ? 'approved' : 'in_review';
      logAudit({ actionType: 'change_request_approved', actionCategory: 'approval', entityType: 'change_request', entityId: cr.id, entityName: cr.title, userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, description: `Approved change request "${cr.title}"${comment ? `: ${comment}` : ''}`, metadata: { comment, newStatus: status, approvalCount: approvals.length }, previousState: { status: cr.status }, newState: { status } });
      return { ...cr, approvals, status };
    }));
  }, [currentUser, logAudit]);

  const rejectChangeRequest = useCallback((requestId: string, comment: string) => {
    setChangeRequests(prev => prev.map(cr => {
      if (cr.id !== requestId) return cr;
      const approval = { id: `a-${Date.now()}`, userId: currentUser.id, userName: currentUser.name, role: currentUser.role, decision: 'rejected' as const, comment, timestamp: Date.now() };
      logAudit({ actionType: 'change_request_rejected', actionCategory: 'approval', entityType: 'change_request', entityId: cr.id, entityName: cr.title, userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, description: `Rejected change request "${cr.title}"${comment ? `: ${comment}` : ''}`, metadata: { comment, reason: comment }, previousState: { status: cr.status }, newState: { status: 'rejected' } });
      return { ...cr, approvals: [...cr.approvals, approval], status: 'rejected' };
    }));
  }, [currentUser, logAudit]);

  const runImpactAssessment = useCallback((requestId: string) => {
    setChangeRequests(prev => prev.map(cr => {
      if (cr.id !== requestId) return cr;
      const feature = features.find(f => f.id === cr.featureId);
      const affected = feature?.dependents || [];
      const assessment = { level: (affected.length > 2 ? 'high' : affected.length > 0 ? 'medium' : 'low') as const, affectedFeatures: affected, affectedStakeholders: users.filter(u => u.subscribedFeatures.some(f => affected.includes(f))).map(u => u.id), riskFactors: ['Potential breaking changes', 'Performance considerations'], mitigationSteps: ['Staged rollout', 'Comprehensive testing'], estimatedEffort: '1-2 weeks', rollbackPlan: 'Revert to previous version' };
      logAudit({ actionType: 'impact_assessment_run', actionCategory: 'compliance', entityType: 'change_request', entityId: cr.id, entityName: cr.title, userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, description: `Ran impact assessment for "${cr.title}" - ${assessment.level} impact`, metadata: { impactLevel: assessment.level, affectedCount: affected.length }, newState: { impactAssessment: assessment } });
      return { ...cr, impactAssessment: assessment, status: 'pending' };
    }));
  }, [features, users, currentUser, logAudit]);

  const markNotificationRead = useCallback((id: string) => { setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)); }, []);

  return <GovernanceContext.Provider value={{ currentUser, users, features, changeRequests, validationRules, notifications, auditLogs, setCurrentUser, createChangeRequest, approveChangeRequest, rejectChangeRequest, runImpactAssessment, markNotificationRead, hasPermission, addNotification, refreshAuditLogs }}>{children}</GovernanceContext.Provider>;
};
