import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { 
  Wallet, 
  Search, 
  MoreVertical, 
  AlertTriangle, 
  CheckCircle,
  Ban,
  ExternalLink,
  Copy,
  Download,
  Flag,
  Activity,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { AdminWallet, adminService } from '@/lib/adminService';
import { useToast } from '@/hooks/use-toast';

export const WalletManagementPanel: React.FC = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [selectedWallet, setSelectedWallet] = useState<AdminWallet | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletNote, setWalletNote] = useState('');

  const wallets = useMemo(() => {
    return adminService.getWallets({
      network: networkFilter !== 'all' ? networkFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter as AdminWallet['status'] : undefined,
      search: searchQuery || undefined,
      minRiskScore: riskFilter === 'high' ? 70 : riskFilter === 'medium' ? 40 : undefined,
    });
  }, [searchQuery, networkFilter, statusFilter, riskFilter]);

  const getStatusBadge = (status: AdminWallet['status']) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      flagged: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      suspended: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status];
  };

  const getNetworkColor = (network: string) => {
    const colors: Record<string, string> = {
      ethereum: 'text-blue-400',
      polygon: 'text-purple-400',
      arbitrum: 'text-blue-300',
      bsc: 'text-yellow-400',
      optimism: 'text-red-400',
    };
    return colors[network] || 'text-gray-400';
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'text-red-400 bg-red-500/20';
    if (score >= 40) return 'text-yellow-400 bg-yellow-500/20';
    return 'text-green-400 bg-green-500/20';
  };

  const handleUpdateStatus = (walletId: string, status: AdminWallet['status']) => {
    adminService.updateWalletStatus(walletId, status);
    toast({ 
      title: 'Wallet Updated', 
      description: `Wallet status changed to ${status}` 
    });
  };

  const handleToggleTrading = (walletId: string, enabled: boolean) => {
    adminService.toggleWalletTrading(walletId, enabled);
    toast({ 
      title: enabled ? 'Trading Enabled' : 'Trading Disabled', 
      description: `Trading ${enabled ? 'enabled' : 'disabled'} for this wallet` 
    });
  };

  const handleSaveNote = () => {
    if (selectedWallet) {
      adminService.addWalletNote(selectedWallet.id, walletNote);
      toast({ title: 'Note Saved', description: 'Wallet note has been updated' });
    }
  };

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast({ title: 'Copied', description: 'Address copied to clipboard' });
  };

  const handleExport = (format: 'json' | 'csv') => {
    const data = adminService.exportWallets(format);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallets.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: `Wallets exported as ${format.toUpperCase()}` });
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-purple-400" />
            Wallet Management
            <Badge variant="outline" className="ml-2 text-gray-400">
              {wallets.length} wallets
            </Badge>
          </CardTitle>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-gray-600">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-gray-800 border-gray-700">
                <DropdownMenuItem onClick={() => handleExport('json')} className="text-gray-300">
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')} className="text-gray-300">
                  Export as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by address, owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-700 border-gray-600 text-white"
            />
          </div>
          <Select value={networkFilter} onValueChange={setNetworkFilter}>
            <SelectTrigger className="w-[130px] bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="Network" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all">All Networks</SelectItem>
              <SelectItem value="ethereum">Ethereum</SelectItem>
              <SelectItem value="polygon">Polygon</SelectItem>
              <SelectItem value="arbitrum">Arbitrum</SelectItem>
              <SelectItem value="bsc">BSC</SelectItem>
              <SelectItem value="optimism">Optimism</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[130px] bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="Risk" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all">All Risk</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Wallets Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Wallet</th>
                <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Network</th>
                <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Status</th>
                <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Balance</th>
                <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Volume</th>
                <th className="text-center py-3 px-4 text-gray-400 text-sm font-medium">Risk</th>
                <th className="text-center py-3 px-4 text-gray-400 text-sm font-medium">Trading</th>
                <th className="text-center py-3 px-4 text-gray-400 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wallets.slice(0, 20).map((wallet) => (
                <tr 
                  key={wallet.id} 
                  className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-mono text-sm">{formatAddress(wallet.address)}</p>
                        <button
                          onClick={() => handleCopyAddress(wallet.address)}
                          className="text-gray-400 hover:text-white"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      {wallet.ownerName && (
                        <p className="text-gray-400 text-xs">{wallet.ownerName}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-sm font-medium capitalize ${getNetworkColor(wallet.network)}`}>
                      {wallet.network}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={getStatusBadge(wallet.status)}>
                      {wallet.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="text-white text-sm">${wallet.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    <p className="text-gray-400 text-xs">{wallet.balance.toFixed(4)} ETH</p>
                  </td>
                  <td className="py-3 px-4 text-right text-white text-sm">
                    ${wallet.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(wallet.riskScore)}`}>
                      {wallet.riskScore}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Switch
                      checked={wallet.tradingEnabled}
                      onCheckedChange={(checked) => handleToggleTrading(wallet.id, checked)}
                    />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4 text-gray-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700">
                        <DropdownMenuItem 
                          onClick={() => { 
                            setSelectedWallet(wallet); 
                            setWalletNote(wallet.notes || '');
                            setShowWalletModal(true); 
                          }}
                          className="text-gray-300"
                        >
                          <Activity className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => window.open(`https://etherscan.io/address/${wallet.address}`, '_blank')}
                          className="text-gray-300"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View on Explorer
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-gray-700" />
                        <DropdownMenuItem 
                          onClick={() => handleUpdateStatus(wallet.id, 'active')}
                          className="text-green-400"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Mark Active
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleUpdateStatus(wallet.id, 'flagged')}
                          className="text-yellow-400"
                        >
                          <Flag className="h-4 w-4 mr-2" />
                          Flag Wallet
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleUpdateStatus(wallet.id, 'suspended')}
                          className="text-red-400"
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Suspend
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {wallets.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            No wallets found matching your filters
          </div>
        )}
      </CardContent>

      {/* Wallet Details Modal */}
      <Dialog open={showWalletModal} onOpenChange={setShowWalletModal}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-purple-400" />
              Wallet Details
            </DialogTitle>
          </DialogHeader>
          {selectedWallet && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Address</p>
                    <p className="text-white font-mono">{selectedWallet.address}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyAddress(selectedWallet.address)}
                      className="border-gray-600"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`https://etherscan.io/address/${selectedWallet.address}`, '_blank')}
                      className="border-gray-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <p className="text-gray-400 text-sm">Owner</p>
                  <p className="text-white">{selectedWallet.ownerName || 'Unknown'}</p>
                  <p className="text-gray-400 text-xs">{selectedWallet.ownerEmail}</p>
                </div>
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <p className="text-gray-400 text-sm">Network</p>
                  <p className={`font-medium capitalize ${getNetworkColor(selectedWallet.network)}`}>
                    {selectedWallet.network}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-gray-700/50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-white">
                    ${(selectedWallet.balanceUSD / 1000).toFixed(1)}K
                  </p>
                  <p className="text-xs text-gray-400">Balance</p>
                </div>
                <div className="p-4 bg-gray-700/50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-white">{selectedWallet.totalTrades}</p>
                  <p className="text-xs text-gray-400">Trades</p>
                </div>
                <div className="p-4 bg-gray-700/50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-white">
                    ${(selectedWallet.totalVolume / 1000).toFixed(1)}K
                  </p>
                  <p className="text-xs text-gray-400">Volume</p>
                </div>
                <div className="p-4 bg-gray-700/50 rounded-lg text-center">
                  <p className={`text-2xl font-bold ${getRiskColor(selectedWallet.riskScore).split(' ')[0]}`}>
                    {selectedWallet.riskScore}
                  </p>
                  <p className="text-xs text-gray-400">Risk Score</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-gray-400" />
                  <span className="text-gray-300">Trading Enabled</span>
                </div>
                <Switch
                  checked={selectedWallet.tradingEnabled}
                  onCheckedChange={(checked) => handleToggleTrading(selectedWallet.id, checked)}
                />
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-2">Admin Notes</p>
                <Textarea
                  value={walletNote}
                  onChange={(e) => setWalletNote(e.target.value)}
                  placeholder="Add notes about this wallet..."
                  className="bg-gray-700 border-gray-600 text-white"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWalletModal(false)} className="border-gray-600">
              Cancel
            </Button>
            <Button onClick={handleSaveNote} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
