import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { 
  Users, 
  Search, 
  MoreVertical, 
  Shield, 
  Ban, 
  CheckCircle,
  Clock,
  Mail,
  Wallet,
  TrendingUp,
  Download,
  Filter,
  UserCog,
  Crown,
} from 'lucide-react';
import { PlatformUser, adminService } from '@/lib/adminService';
import { useToast } from '@/hooks/use-toast';

export const UserManagementPanel: React.FC = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  const users = useMemo(() => {
    return adminService.getUsers({
      role: roleFilter !== 'all' ? roleFilter as PlatformUser['role'] : undefined,
      status: statusFilter !== 'all' ? statusFilter as PlatformUser['status'] : undefined,
      tier: tierFilter !== 'all' ? tierFilter as PlatformUser['subscriptionTier'] : undefined,
      search: searchQuery || undefined,
    });
  }, [searchQuery, roleFilter, statusFilter, tierFilter]);

  const getStatusBadge = (status: PlatformUser['status']) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      suspended: 'bg-red-500/20 text-red-400 border-red-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    };
    return styles[status];
  };

  const getRoleBadge = (role: PlatformUser['role']) => {
    const styles: Record<string, string> = {
      user: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      admin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      superadmin: 'bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/30',
    };
    return styles[role];
  };

  const getTierBadge = (tier: PlatformUser['subscriptionTier']) => {
    const styles: Record<string, string> = {
      free: 'bg-gray-500/20 text-gray-400',
      basic: 'bg-blue-500/20 text-blue-400',
      pro: 'bg-purple-500/20 text-purple-400',
      enterprise: 'bg-yellow-500/20 text-yellow-400',
    };
    return styles[tier];
  };

  const handleUpdateStatus = (userId: string, status: PlatformUser['status']) => {
    adminService.updateUserStatus(userId, status);
    toast({ 
      title: 'User Updated', 
      description: `User status changed to ${status}` 
    });
  };

  const handleUpdateRole = (userId: string, role: PlatformUser['role']) => {
    adminService.updateUserRole(userId, role);
    toast({ 
      title: 'Role Updated', 
      description: `User role changed to ${role}` 
    });
  };

  const handleUpdateTier = (userId: string, tier: PlatformUser['subscriptionTier']) => {
    adminService.updateUserTier(userId, tier);
    toast({ 
      title: 'Tier Updated', 
      description: `User subscription changed to ${tier}` 
    });
  };

  const handleExport = (format: 'json' | 'csv') => {
    const data = adminService.exportUsers(format);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: `Users exported as ${format.toUpperCase()}` });
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            User Management
            <Badge variant="outline" className="ml-2 text-gray-400">
              {users.length} users
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
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-700 border-gray-600 text-white"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[130px] bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="superadmin">Super Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-[140px] bg-gray-700 border-gray-600 text-white">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">User</th>
                <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Role</th>
                <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Status</th>
                <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Tier</th>
                <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Trades</th>
                <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Volume</th>
                <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Fees</th>
                <th className="text-center py-3 px-4 text-gray-400 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.slice(0, 20).map((user) => (
                <tr 
                  key={user.id} 
                  className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                        {user.displayName?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{user.displayName || 'Unknown'}</p>
                        <p className="text-gray-400 text-xs">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={getRoleBadge(user.role)}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={getStatusBadge(user.status)}>
                      {user.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <Badge className={getTierBadge(user.subscriptionTier)}>
                      {user.subscriptionTier}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right text-white text-sm">
                    {user.totalTrades.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-white text-sm">
                    ${user.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-4 text-right text-[#00F0FF] text-sm">
                    ${user.feesGenerated.toFixed(2)}
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
                          onClick={() => { setSelectedUser(user); setShowUserModal(true); }}
                          className="text-gray-300"
                        >
                          <UserCog className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-gray-700" />
                        <DropdownMenuItem 
                          onClick={() => handleUpdateStatus(user.id, 'active')}
                          className="text-green-400"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Activate
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleUpdateStatus(user.id, 'suspended')}
                          className="text-red-400"
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Suspend
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-gray-700" />
                        <DropdownMenuItem 
                          onClick={() => handleUpdateRole(user.id, 'admin')}
                          className="text-purple-400"
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleUpdateTier(user.id, 'pro')}
                          className="text-yellow-400"
                        >
                          <Crown className="h-4 w-4 mr-2" />
                          Upgrade to Pro
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            No users found matching your filters
          </div>
        )}
      </CardContent>

      {/* User Details Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <UserCog className="h-5 w-5 text-blue-400" />
              User Details
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                  {selectedUser.displayName?.[0] || selectedUser.email[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedUser.displayName || 'Unknown'}</h3>
                  <p className="text-gray-400">{selectedUser.email}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className={getRoleBadge(selectedUser.role)}>
                      {selectedUser.role}
                    </Badge>
                    <Badge variant="outline" className={getStatusBadge(selectedUser.status)}>
                      {selectedUser.status}
                    </Badge>
                    <Badge className={getTierBadge(selectedUser.subscriptionTier)}>
                      {selectedUser.subscriptionTier}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Wallet className="h-4 w-4" />
                    Wallet Address
                  </div>
                  <p className="text-white font-mono text-sm truncate">
                    {selectedUser.walletAddress || 'Not connected'}
                  </p>
                </div>
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <Clock className="h-4 w-4" />
                    Last Active
                  </div>
                  <p className="text-white text-sm">
                    {new Date(selectedUser.lastActive).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-gray-700/50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-white">{selectedUser.totalTrades}</p>
                  <p className="text-xs text-gray-400">Total Trades</p>
                </div>
                <div className="p-4 bg-gray-700/50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-white">
                    ${(selectedUser.totalVolume / 1000).toFixed(1)}K
                  </p>
                  <p className="text-xs text-gray-400">Volume</p>
                </div>
                <div className="p-4 bg-gray-700/50 rounded-lg text-center">
                  <p className={`text-2xl font-bold ${selectedUser.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${selectedUser.totalProfit.toFixed(0)}
                  </p>
                  <p className="text-xs text-gray-400">Profit/Loss</p>
                </div>
                <div className="p-4 bg-gray-700/50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-[#00F0FF]">
                    ${selectedUser.feesGenerated.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">Fees Generated</p>
                </div>
              </div>

              <div className="p-4 bg-gray-700/50 rounded-lg">
                <p className="text-gray-400 text-sm mb-2">Member Since</p>
                <p className="text-white">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserModal(false)} className="border-gray-600">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
