import React, { useState } from 'react';
import { GovernanceProvider, useGovernance } from '@/contexts/GovernanceContext';
import { FeatureList } from './governance/FeatureList';
import { ChangeRequestForm } from './governance/ChangeRequestForm';
import { ApprovalWorkflow } from './governance/ApprovalWorkflow';
import { ImpactAssessment } from './governance/ImpactAssessment';
import { ComplianceTracker } from './governance/ComplianceTracker';
import { NotificationCenter } from './governance/NotificationCenter';
import { RoleSelector } from './governance/RoleSelector';
import { AuditLogPanel } from './governance/AuditLogPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Feature } from '@/types/governance';
import { GitBranch, GitPullRequest, Shield, Bell, Plus, ClipboardList } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const GovernanceContent: React.FC = () => {
  const { features, changeRequests, validationRules, notifications, users, currentUser, auditLogs } = useGovernance();
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);

  const unreadNotifications = notifications.filter(n => n.userId === currentUser.id && !n.read).length;
  const pendingRequests = changeRequests.filter(cr => cr.status === 'pending' || cr.status === 'in_review').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="h-7 w-7 text-[#00F0FF]" />Feature Governance
          </h2>
          <p className="text-gray-400 mt-1">Manage feature changes with approval workflows and compliance tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="relative border-gray-700 text-gray-300">
                <Bell className="h-4 w-4" />
                {unreadNotifications > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">{unreadNotifications}</span>}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-gray-700 p-0 max-w-md">
              <DialogHeader className="p-4 pb-0">
                <DialogTitle className="text-white">Notifications</DialogTitle>
              </DialogHeader>
              <NotificationCenter />
            </DialogContent>

          </Dialog>
          <Dialog open={showNewRequest} onOpenChange={setShowNewRequest}>
            <DialogTrigger asChild><Button className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900"><Plus className="h-4 w-4 mr-2" />New Change Request</Button></DialogTrigger>
            <DialogContent className="bg-gray-900 border-gray-700">
              <DialogHeader><DialogTitle className="text-white">Create Change Request</DialogTitle></DialogHeader>
              <ChangeRequestForm features={features} onSuccess={() => setShowNewRequest(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"><p className="text-gray-400 text-sm">Total Features</p><p className="text-2xl font-bold text-white mt-1">{features.length}</p></div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"><p className="text-gray-400 text-sm">Pending Requests</p><p className="text-2xl font-bold text-yellow-400 mt-1">{pendingRequests}</p></div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"><p className="text-gray-400 text-sm">Compliant Features</p><p className="text-2xl font-bold text-green-400 mt-1">{features.filter(f => f.complianceStatus === 'compliant').length}</p></div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"><p className="text-gray-400 text-sm">Active Users</p><p className="text-2xl font-bold text-[#00F0FF] mt-1">{users.length}</p></div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"><p className="text-gray-400 text-sm">Audit Entries</p><p className="text-2xl font-bold text-purple-400 mt-1">{auditLogs.length}</p></div>
      </div>

      <RoleSelector />

      <Tabs defaultValue="features" className="space-y-4">
        <TabsList className="bg-gray-800 border border-gray-700">
          <TabsTrigger value="features" className="data-[state=active]:bg-gray-700"><GitBranch className="h-4 w-4 mr-2" />Features</TabsTrigger>
          <TabsTrigger value="requests" className="data-[state=active]:bg-gray-700"><GitPullRequest className="h-4 w-4 mr-2" />Change Requests{pendingRequests > 0 && <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">{pendingRequests}</span>}</TabsTrigger>
          <TabsTrigger value="compliance" className="data-[state=active]:bg-gray-700"><Shield className="h-4 w-4 mr-2" />Compliance</TabsTrigger>
          <TabsTrigger value="audit" className="data-[state=active]:bg-gray-700"><ClipboardList className="h-4 w-4 mr-2" />Audit Log<span className="ml-2 px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs">{auditLogs.length}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="features">
          <div className="grid lg:grid-cols-2 gap-6">
            <div><h3 className="text-white font-semibold mb-4">All Features</h3><FeatureList features={features} onSelect={setSelectedFeature} selectedId={selectedFeature?.id} /></div>
            <div>{selectedFeature && <div className="space-y-4"><h3 className="text-white font-semibold">Feature Details</h3><div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"><h4 className="text-white font-medium">{selectedFeature.name}</h4><p className="text-gray-400 text-sm mt-2">{selectedFeature.description}</p><div className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><span className="text-gray-500">Version:</span> <span className="text-white">{selectedFeature.version}</span></div><div><span className="text-gray-500">Status:</span> <span className="text-white">{selectedFeature.status}</span></div><div><span className="text-gray-500">Dependencies:</span> <span className="text-white">{selectedFeature.dependencies.length}</span></div><div><span className="text-gray-500">Dependents:</span> <span className="text-white">{selectedFeature.dependents.length}</span></div></div></div></div>}</div>
          </div>
        </TabsContent>

        <TabsContent value="requests">
          <div className="space-y-4">{changeRequests.length === 0 ? <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center"><p className="text-gray-400">No change requests yet</p></div> : changeRequests.map(cr => <div key={cr.id} className="space-y-4"><ApprovalWorkflow changeRequest={cr} />{cr.impactAssessment && <ImpactAssessment assessment={cr.impactAssessment} features={features} users={users} />}</div>)}</div>
        </TabsContent>

        <TabsContent value="compliance"><ComplianceTracker rules={validationRules} /></TabsContent>

        <TabsContent value="audit"><AuditLogPanel /></TabsContent>
      </Tabs>
    </div>
  );
};

export const FeatureGovernance: React.FC = () => <GovernanceProvider><GovernanceContent /></GovernanceProvider>;
