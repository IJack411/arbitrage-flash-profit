import React from 'react';
import { User, UserRole } from '@/types/governance';
import { useGovernance } from '@/contexts/GovernanceContext';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, User as UserIcon, Code, Eye } from 'lucide-react';

const roleIcons: Record<UserRole, React.ReactNode> = {
  admin: <Shield className="h-4 w-4 text-red-400" />,
  manager: <UserIcon className="h-4 w-4 text-orange-400" />,
  developer: <Code className="h-4 w-4 text-blue-400" />,
  viewer: <Eye className="h-4 w-4 text-gray-400" />,
};

const roleColors: Record<UserRole, string> = {
  admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  manager: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  developer: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  viewer: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const rolePermissions: Record<UserRole, string[]> = {
  admin: ['Create', 'Approve', 'Reject', 'Delete', 'Configure'],
  manager: ['Create', 'Approve', 'Reject'],
  developer: ['Create'],
  viewer: ['View Only'],
};

export const RoleSelector: React.FC = () => {
  const { currentUser, users, setCurrentUser } = useGovernance();

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-700 rounded-lg">
            {roleIcons[currentUser.role]}
          </div>
          <div>
            <p className="text-white font-medium">{currentUser.name}</p>
            <p className="text-gray-400 text-sm">{currentUser.email}</p>
          </div>
        </div>
        <Badge className={roleColors[currentUser.role]}>
          {currentUser.role}
        </Badge>
      </div>

      <div className="mb-4">
        <label className="text-gray-400 text-sm mb-2 block">Switch User (Demo)</label>
        <Select value={currentUser.id} onValueChange={(id) => {
          const user = users.find(u => u.id === id);
          if (user) setCurrentUser(user);
        }}>
          <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            {users.map(user => (
              <SelectItem key={user.id} value={user.id} className="text-white hover:bg-gray-700">
                <div className="flex items-center gap-2">
                  {roleIcons[user.role]}
                  <span>{user.name}</span>
                  <span className="text-gray-500 text-xs">({user.role})</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-gray-900/50 rounded-lg p-3">
        <p className="text-gray-400 text-xs mb-2">Permissions</p>
        <div className="flex flex-wrap gap-1">
          {rolePermissions[currentUser.role].map(perm => (
            <Badge key={perm} variant="outline" className="text-xs border-gray-600 text-gray-300">
              {perm}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
};
