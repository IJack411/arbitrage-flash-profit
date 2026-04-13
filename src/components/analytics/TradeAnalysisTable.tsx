import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TradeRecord } from '@/types/analytics';
import { ArrowUpDown, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

interface Props {
  trades: TradeRecord[];
}

export const TradeAnalysisTable: React.FC<Props> = ({ trades }) => {
  const [sortField, setSortField] = useState<keyof TradeRecord>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<'all' | 'win' | 'loss'>('all');
  const [page, setPage] = useState(0);
  const perPage = 10;

  const filtered = trades.filter(t => filter === 'all' || t.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal instanceof Date && bVal instanceof Date) {
      return sortDir === 'asc' ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });
  
  const paginated = sorted.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(sorted.length / perPage);

  const handleSort = (field: keyof TradeRecord) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortHeader = ({ field, label }: { field: keyof TradeRecord; label: string }) => (
    <th className="px-3 py-2 text-left cursor-pointer hover:bg-gray-700" onClick={() => handleSort(field)}>
      <div className="flex items-center gap-1 text-gray-400 text-xs font-medium">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </th>
  );

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-white">Trade Analysis</CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select value={filter} onChange={e => { setFilter(e.target.value as 'all' | 'win' | 'loss'); setPage(0); }} className="bg-gray-700 border-gray-600 text-white text-sm rounded px-2 py-1">
              <option value="all">All Trades</option>
              <option value="win">Winners</option>
              <option value="loss">Losers</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-700">
              <tr>
                <SortHeader field="timestamp" label="Date" />
                <th className="px-3 py-2 text-left text-gray-400 text-xs font-medium">Pair</th>
                <SortHeader field="entryPrice" label="Entry" />
                <SortHeader field="exitPrice" label="Exit" />
                <SortHeader field="netProfit" label="P&L" />
                <SortHeader field="profitPercent" label="%" />
                <SortHeader field="duration" label="Duration" />
                <th className="px-3 py-2 text-left text-gray-400 text-xs font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(trade => (
                <tr key={trade.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-3 py-2 text-gray-300 text-sm">{trade.timestamp.toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-white text-sm font-medium">{trade.tokenPair}</td>
                  <td className="px-3 py-2 text-gray-300 text-sm">${trade.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-300 text-sm">${trade.exitPrice.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-sm font-medium ${trade.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {trade.netProfit >= 0 ? '+' : ''}${trade.netProfit.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2 text-sm ${trade.profitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-sm">{trade.duration}s</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${trade.status === 'win' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {trade.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-700">
          <p className="text-gray-400 text-sm">{sorted.length} trades</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 bg-gray-700 rounded disabled:opacity-50">
              <ChevronLeft className="h-4 w-4 text-gray-400" />
            </button>
            <span className="text-gray-400 text-sm">{page + 1} / {totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 bg-gray-700 rounded disabled:opacity-50">
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
