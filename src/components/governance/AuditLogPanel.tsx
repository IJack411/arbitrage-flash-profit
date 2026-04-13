import React, { useState, useMemo, useEffect } from 'react';
import { useGovernance } from '@/contexts/GovernanceContext';
import { AuditLogTable } from './AuditLogTable';
import { DatabaseStatus } from './DatabaseStatus';
import { auditService } from '@/lib/auditService';
import { isSupabaseConfigured, checkConnection } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Download, Search, RefreshCw, FileJson, FileSpreadsheet, Calendar, Database, CheckCircle, AlertCircle, ChevronDown, Settings } from 'lucide-react';

export const AuditLogPanel: React.FC = () => {
  const { auditLogs, refreshAuditLogs, users } = useGovernance();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [showDbSettings, setShowDbSettings] = useState(false);

  useEffect(() => {
    const checkDb = async () => {
      if (!isSupabaseConfigured()) {
        setDbConnected(false);
        return;
      }
      const connected = await checkConnection();
      setDbConnected(connected);
    };
    checkDb();
  }, [auditLogs]);


  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (searchQuery && !log.description.toLowerCase().includes(searchQuery.toLowerCase()) && !log.entityName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (categoryFilter !== 'all' && log.actionCategory !== categoryFilter) return false;
      if (userFilter !== 'all' && log.userId !== userFilter) return false;
      if (dateRange !== 'all') {
        const now = Date.now();
        const ranges: Record<string, number> = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
        if (ranges[dateRange] && log.createdAt < now - ranges[dateRange]) return false;
      }
      return true;
    });
  }, [auditLogs, searchQuery, categoryFilter, userFilter, dateRange]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await refreshAuditLogs();
    setIsLoading(false);
  };

  const handleExport = (format: 'csv' | 'json', includeMetadata = false) => {
    const content = auditService.exportLogs(filteredLogs, { format, includeMetadata });
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `governance-audit-log-${new Date().toISOString().split('T')[0]}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => ({
    total: filteredLogs.length,
    approvals: filteredLogs.filter(l => l.actionCategory === 'approval').length,
    changes: filteredLogs.filter(l => l.actionCategory === 'change_request').length,
    compliance: filteredLogs.filter(l => l.actionCategory === 'compliance').length,
    synced: filteredLogs.filter(l => l.synced).length,
  }), [filteredLogs]);

  return (
    <div className="space-y-6">
      {/* Database Settings Collapsible */}
      <Collapsible open={showDbSettings} onOpenChange={setShowDbSettings}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-400">
              {dbConnected === true && <span className="text-green-400 flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Connected to Supabase</span>}
              {dbConnected === false && <span className="text-yellow-400 flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Using local storage</span>}
              {dbConnected === null && <span>Checking connection...</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{stats.synced}/{stats.total} synced</span>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                <Settings className="h-4 w-4 mr-1" />
                {showDbSettings ? 'Hide' : 'Setup'}
                <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showDbSettings ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent className="mt-4">
          <DatabaseStatus />
        </CollapsibleContent>
      </Collapsible>


      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Entries</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Approvals</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{stats.approvals}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Change Requests</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{stats.changes}</p>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Compliance</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{stats.compliance}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input placeholder="Search audit logs..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-gray-800 border-gray-700 text-white" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px] bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="change_request">Change Requests</SelectItem>
            <SelectItem value="approval">Approvals</SelectItem>
            <SelectItem value="compliance">Compliance</SelectItem>
            <SelectItem value="user">User</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-[150px] bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="User" /></SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="all">All Users</SelectItem>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[130px] bg-gray-800 border-gray-700 text-white"><Calendar className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="1h">Last Hour</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading} className="border-gray-700">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
        <Button variant="outline" onClick={() => handleExport('csv')} className="border-gray-700"><FileSpreadsheet className="h-4 w-4 mr-2" />CSV</Button>
        <Button variant="outline" onClick={() => handleExport('json', true)} className="border-gray-700"><FileJson className="h-4 w-4 mr-2" />JSON</Button>
      </div>

      <AuditLogTable entries={filteredLogs} />
    </div>
  );
};
