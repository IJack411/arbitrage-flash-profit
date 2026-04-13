import { supabase, isSupabaseConfigured } from './supabase';
import { AuditEntry, AuditFilter, AuditExportOptions } from '@/types/auditTypes';

const STORAGE_KEY = 'governance_audit_logs';

interface DbAuditRow {
  id: string;
  action_type: AuditEntry['actionType'];
  action_category: AuditEntry['actionCategory'];
  entity_type: AuditEntry['entityType'];
  entity_id: string;
  entity_name: string;
  user_id: string;
  user_name: string;
  user_role: string;
  description: string;
  metadata?: Record<string, unknown>;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  created_at: string;
}

type DbQueryResult<T> = { data: T | null; error: unknown };

const getLocalLogs = (): AuditEntry[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveLocalLogs = (logs: AuditEntry[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 1000)));
  } catch {
    // Ignore storage errors
  }
};

const mapDbToEntry = (row: DbAuditRow): AuditEntry => ({
  id: row.id,
  actionType: row.action_type,
  actionCategory: row.action_category,
  entityType: row.entity_type,
  entityId: row.entity_id,
  entityName: row.entity_name,
  userId: row.user_id,
  userName: row.user_name,
  userRole: row.user_role,
  description: row.description,
  metadata: row.metadata || {},
  previousState: row.previous_state,
  newState: row.new_state,
  createdAt: new Date(row.created_at).getTime(),
  synced: true,
});

// Safe query helper
const safeDbQuery = async <T>(queryFn: () => Promise<DbQueryResult<T>>): Promise<T | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    const result = await queryFn();
    return result?.error ? null : (result?.data ?? null);
  } catch {
    return null;
  }
};

export const auditService = {
  async createEntry(entry: Omit<AuditEntry, 'id' | 'createdAt' | 'synced'>): Promise<AuditEntry> {
    const newEntry: AuditEntry = {
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      synced: false,
    };
    
    const logs = getLocalLogs();
    logs.unshift(newEntry);
    saveLocalLogs(logs);
    
    const dbResult = await safeDbQuery(() => supabase.from('governance_audit_logs').insert({
      action_type: entry.actionType,
      action_category: entry.actionCategory,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entity_name: entry.entityName,
      user_id: entry.userId,
      user_name: entry.userName,
      user_role: entry.userRole,
      description: entry.description,
      metadata: entry.metadata,
      previous_state: entry.previousState,
      new_state: entry.newState,
    }).select().single());
    
    if (dbResult) {
      newEntry.id = dbResult.id;
      newEntry.synced = true;
      const updatedLogs = getLocalLogs();
      if (updatedLogs.length > 0) {
        updatedLogs[0] = newEntry;
        saveLocalLogs(updatedLogs);
      }
    }
    
    return newEntry;
  },

  async getLogs(filter?: AuditFilter): Promise<AuditEntry[]> {
    if (!isSupabaseConfigured()) {
      return this.getLocalLogs(filter);
    }

    try {
      let query = supabase.from('governance_audit_logs').select('*').order('created_at', { ascending: false }).limit(500);
      
      if (filter?.actionTypes?.length) query = query.in('action_type', filter.actionTypes);
      if (filter?.categories?.length) query = query.in('action_category', filter.categories);
      if (filter?.entityTypes?.length) query = query.in('entity_type', filter.entityTypes);
      if (filter?.userId) query = query.eq('user_id', filter.userId);
      if (filter?.entityId) query = query.eq('entity_id', filter.entityId);
      if (filter?.startDate) query = query.gte('created_at', new Date(filter.startDate).toISOString());
      if (filter?.endDate) query = query.lte('created_at', new Date(filter.endDate).toISOString());
      
      const dbData = await safeDbQuery(() => query);
      if (dbData && Array.isArray(dbData) && dbData.length > 0) {
        return dbData.map(mapDbToEntry);
      }
    } catch {
      // Ignore query errors
    }
    
    return this.getLocalLogs(filter);
  },

  getLocalLogs(filter?: AuditFilter): AuditEntry[] {
    const logs = getLocalLogs();
    if (!filter) return logs;
    
    return logs.filter(log => {
      if (filter.actionTypes?.length && !filter.actionTypes.includes(log.actionType)) return false;
      if (filter.categories?.length && !filter.categories.includes(log.actionCategory)) return false;
      if (filter.entityTypes?.length && !filter.entityTypes.includes(log.entityType)) return false;
      if (filter.userId && log.userId !== filter.userId) return false;
      if (filter.entityId && log.entityId !== filter.entityId) return false;
      if (filter.startDate && log.createdAt < filter.startDate) return false;
      if (filter.endDate && log.createdAt > filter.endDate) return false;
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase();
        return log.description.toLowerCase().includes(q) || log.entityName.toLowerCase().includes(q);
      }
      return true;
    });
  },

  exportLogs(logs: AuditEntry[], options: AuditExportOptions): string {
    const exportData = options.includeMetadata ? logs : logs.map(({ metadata, previousState, newState, ...rest }) => rest);
    if (options.format === 'json') return JSON.stringify(exportData, null, 2);
    
    const headers = ['ID', 'Timestamp', 'Action', 'Category', 'Entity Type', 'Entity', 'User ID', 'User', 'Role', 'Description'];
    const rows = logs.map(l => [
      l.id, new Date(l.createdAt).toISOString(), l.actionType, l.actionCategory, l.entityType,
      l.entityName, l.userId, l.userName, l.userRole, `"${l.description.replace(/"/g, '""')}"`
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  },

  async getStats() {
    const logs = await this.getLogs();
    return {
      total: logs.length,
      approvals: logs.filter(l => l.actionType.includes('approved')).length,
      rejections: logs.filter(l => l.actionType.includes('rejected')).length,
      changeRequests: logs.filter(l => l.actionCategory === 'change_request').length,
      compliance: logs.filter(l => l.actionCategory === 'compliance').length,
    };
  },
};
