import { Feature, ChangeRequest, User, ValidationRule, Notification } from '@/types/governance';

export const mockUsers: User[] = [
  { id: 'u1', name: 'Alice Chen', email: 'alice@company.com', role: 'admin', subscribedFeatures: ['f1', 'f2', 'f3'] },
  { id: 'u2', name: 'Bob Smith', email: 'bob@company.com', role: 'manager', subscribedFeatures: ['f1', 'f4'] },
  { id: 'u3', name: 'Carol Davis', email: 'carol@company.com', role: 'developer', subscribedFeatures: ['f2', 'f5'] },
  { id: 'u4', name: 'David Lee', email: 'david@company.com', role: 'developer', subscribedFeatures: ['f3', 'f6'] },
  { id: 'u5', name: 'Eva Martinez', email: 'eva@company.com', role: 'viewer', subscribedFeatures: ['f1'] },
];

export const mockFeatures: Feature[] = [
  { id: 'f1', name: 'Flash Loan Engine', description: 'Core flash loan execution engine', status: 'active', version: '2.1.0', owner: 'u1', dependencies: [], dependents: ['f2', 'f3'], createdAt: Date.now() - 90*24*60*60*1000, updatedAt: Date.now() - 5*24*60*60*1000, tags: ['core', 'defi'], complianceStatus: 'compliant' },
  { id: 'f2', name: 'Arbitrage Scanner', description: 'Real-time arbitrage opportunity scanner', status: 'active', version: '1.5.2', owner: 'u2', dependencies: ['f1'], dependents: ['f4'], createdAt: Date.now() - 60*24*60*60*1000, updatedAt: Date.now() - 2*24*60*60*1000, tags: ['scanner', 'defi'], complianceStatus: 'compliant' },
  { id: 'f3', name: 'DEX Integration', description: 'Multi-DEX trading integration', status: 'active', version: '3.0.1', owner: 'u3', dependencies: ['f1'], dependents: ['f2', 'f4'], createdAt: Date.now() - 45*24*60*60*1000, updatedAt: Date.now() - 1*24*60*60*1000, tags: ['integration', 'trading'], complianceStatus: 'warning' },
  { id: 'f4', name: 'Risk Management', description: 'Automated risk assessment and limits', status: 'active', version: '1.2.0', owner: 'u2', dependencies: ['f2', 'f3'], dependents: [], createdAt: Date.now() - 30*24*60*60*1000, updatedAt: Date.now() - 10*24*60*60*1000, tags: ['risk', 'compliance'], complianceStatus: 'compliant' },
  { id: 'f5', name: 'Notification Service', description: 'Real-time alerts and notifications', status: 'active', version: '2.0.0', owner: 'u4', dependencies: [], dependents: [], createdAt: Date.now() - 20*24*60*60*1000, updatedAt: Date.now() - 3*24*60*60*1000, tags: ['notifications'], complianceStatus: 'compliant' },
  { id: 'f6', name: 'Legacy Reporter', description: 'Old reporting system', status: 'deprecated', version: '0.9.5', owner: 'u4', dependencies: [], dependents: [], createdAt: Date.now() - 180*24*60*60*1000, updatedAt: Date.now() - 60*24*60*60*1000, tags: ['legacy', 'reporting'], complianceStatus: 'non_compliant' },
];

export const mockValidationRules: ValidationRule[] = [
  { id: 'vr1', name: 'Security Review Required', description: 'Changes to core features require security review', enabled: true, severity: 'error', condition: 'tags.includes("core")' },
  { id: 'vr2', name: 'Documentation Updated', description: 'All changes must include documentation updates', enabled: true, severity: 'warning', condition: 'true' },
  { id: 'vr3', name: 'Test Coverage', description: 'Minimum 80% test coverage required', enabled: true, severity: 'error', condition: 'true' },
  { id: 'vr4', name: 'Breaking Change Notice', description: 'Breaking changes require 2-week notice', enabled: true, severity: 'warning', condition: 'changeType === "modify"' },
  { id: 'vr5', name: 'Dependency Check', description: 'Verify all dependencies are compatible', enabled: true, severity: 'error', condition: 'dependencies.length > 0' },
];

export const generateMockChangeRequests = (): ChangeRequest[] => [
  { id: 'cr1', featureId: 'f1', featureName: 'Flash Loan Engine', title: 'Upgrade to v2.2.0', description: 'Add support for new lending protocols', changeType: 'modify', requestedBy: 'u1', requestedAt: Date.now() - 2*24*60*60*1000, status: 'in_review', priority: 'high', approvals: [{ id: 'a1', userId: 'u2', userName: 'Bob Smith', role: 'manager', decision: 'approved', comment: 'Looks good', timestamp: Date.now() - 1*24*60*60*1000 }], requiredApprovals: 2, impactAssessment: { level: 'high', affectedFeatures: ['f2', 'f3'], affectedStakeholders: ['u2', 'u3'], riskFactors: ['Breaking API changes', 'Performance impact'], mitigationSteps: ['Staged rollout', 'Monitoring'], estimatedEffort: '2 weeks', rollbackPlan: 'Revert to v2.1.0' }, validationResults: [{ rule: 'Security Review', passed: true, message: 'Security review completed', severity: 'error' }], comments: [] },
  { id: 'cr2', featureId: 'f3', featureName: 'DEX Integration', title: 'Add Curve Finance support', description: 'Integrate Curve Finance DEX', changeType: 'modify', requestedBy: 'u3', requestedAt: Date.now() - 5*24*60*60*1000, status: 'pending', priority: 'medium', approvals: [], requiredApprovals: 2, impactAssessment: null, validationResults: [], comments: [] },
];
