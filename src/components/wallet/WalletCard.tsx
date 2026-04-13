import React, { useState } from 'react';
import { ConnectedWallet, WalletGroup, STRATEGY_INFO, NETWORK_INFO } from '@/types/multiWallet';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Wallet,
  MoreVertical,
  Star,
  Trash2,
  Edit2,
  Copy,
  Check,
  ExternalLink,
  Bot,
  Settings,
  FolderPlus,
  Target,
  Network,
  Zap,
} from 'lucide-react';

interface WalletCardProps {
  wallet: ConnectedWallet;
  groups: WalletGroup[];
  isActive: boolean;
  onSelect: () => void;
  onSetPrimary: () => void;
  onDisconnect: () => void;
  onRename: (name: string) => void;
  onAddToGroup: (groupId: string) => void;
  onRemoveFromGroup: () => void;
  onConfigureLimits: () => void;
  onManageBots: () => void;
  onConfigureStrategy?: () => void;
}

export const WalletCard: React.FC<WalletCardProps> = ({
  wallet,
  groups,
  isActive,
  onSelect,
  onSetPrimary,
  onDisconnect,
  onRename,
  onAddToGroup,
  onRemoveFromGroup,
  onConfigureLimits,
  onManageBots,
  onConfigureStrategy,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(wallet.name);
  const [copied, setCopied] = useState(false);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveName = () => {
    onRename(editName);
    setIsEditing(false);
  };

  const getConnectionIcon = () => {
    switch (wallet.connectionType) {
      case 'metamask':
        return <span className="text-lg">🦊</span>;
      case 'walletconnect':
        return <span className="text-lg">🔗</span>;
      case 'coinbase':
        return <span className="text-lg">💰</span>;
      case 'trust':
        return <span className="text-lg">🛡️</span>;
      default:
        return <Wallet className="h-5 w-5" />;
    }
  };

  const walletGroup = groups.find(g => g.id === wallet.groupId);

  // Get enabled strategies
  const enabledStrategies = wallet.strategyConfigs?.filter(s => s.isEnabled) || [];
  
  // Get enabled networks
  const enabledNetworks = wallet.networkConfigs?.filter(n => n.isEnabled) || [];

  const purposeColors: Record<string, string> = {
    trading: 'border-green-500 text-green-400',
    holding: 'border-blue-500 text-blue-400',
    testing: 'border-yellow-500 text-yellow-400',
    'gas-reserve': 'border-purple-500 text-purple-400',
  };

  return (
    <Card
      className={`bg-gray-800 border-2 transition-all cursor-pointer hover:border-gray-600 ${
        isActive ? 'border-[#00F0FF]' : 'border-gray-700'
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isActive ? 'bg-[#00F0FF]/20' : 'bg-gray-700'}`}>
              {getConnectionIcon()}
            </div>
            <div>
              {isEditing ? (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 w-32 bg-gray-700 border-gray-600 text-white text-sm"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" onClick={handleSaveName}>
                    <Check className="h-4 w-4 text-green-400" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold">{wallet.name}</h3>
                  {wallet.isPrimary && (
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-400 text-sm font-mono">
                  {formatAddress(wallet.address)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); copyAddress(); }}
                  className="text-gray-500 hover:text-gray-300"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-gray-800 border-gray-700" align="end">
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                className="text-gray-300 hover:bg-gray-700"
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Rename
              </DropdownMenuItem>
              {!wallet.isPrimary && (
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onSetPrimary(); }}
                  className="text-gray-300 hover:bg-gray-700"
                >
                  <Star className="h-4 w-4 mr-2" />
                  Set as Primary
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-gray-700" />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onConfigureLimits(); }}
                className="text-gray-300 hover:bg-gray-700"
              >
                <Settings className="h-4 w-4 mr-2" />
                Trading Limits
              </DropdownMenuItem>
              {onConfigureStrategy && (
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onConfigureStrategy(); }}
                  className="text-gray-300 hover:bg-gray-700"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Strategy & Networks
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onManageBots(); }}
                className="text-gray-300 hover:bg-gray-700"
              >
                <Bot className="h-4 w-4 mr-2" />
                Manage Bots
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-700" />
              {wallet.groupId ? (
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }}
                  className="text-gray-300 hover:bg-gray-700"
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Remove from Group
                </DropdownMenuItem>
              ) : (
                groups.map(group => (
                  <DropdownMenuItem
                    key={group.id}
                    onClick={(e) => { e.stopPropagation(); onAddToGroup(group.id); }}
                    className="text-gray-300 hover:bg-gray-700"
                  >
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: group.color }}
                    />
                    Add to {group.name}
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator className="bg-gray-700" />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); window.open(`https://etherscan.io/address/${wallet.address}`, '_blank'); }}
                className="text-gray-300 hover:bg-gray-700"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View on Explorer
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
                className="text-red-400 hover:bg-gray-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Balance */}
        <div className="mb-3">
          <div className="text-2xl font-bold text-white">
            ${wallet.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="text-sm text-gray-400">
            {parseFloat(wallet.balance).toFixed(4)} ETH
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
            {wallet.connectionType}
          </Badge>
          {wallet.designatedPurpose && (
            <Badge 
              variant="outline" 
              className={`text-xs ${purposeColors[wallet.designatedPurpose] || 'border-gray-600 text-gray-400'}`}
            >
              {wallet.designatedPurpose}
            </Badge>
          )}
          {walletGroup && (
            <Badge
              style={{ backgroundColor: `${walletGroup.color}20`, borderColor: walletGroup.color, color: walletGroup.color }}
              className="text-xs"
            >
              {walletGroup.name}
            </Badge>
          )}
          {wallet.allocatedBots.length > 0 && (
            <Badge variant="outline" className="border-purple-500 text-purple-400 text-xs">
              <Bot className="h-3 w-3 mr-1" />
              {wallet.allocatedBots.length} bots
            </Badge>
          )}
          {!wallet.tradingLimits.isEnabled && (
            <Badge variant="outline" className="border-red-500 text-red-400 text-xs">
              Trading Disabled
            </Badge>
          )}
        </div>

        {/* Strategies & Networks Preview */}
        {(enabledStrategies.length > 0 || enabledNetworks.length > 0) && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            {enabledStrategies.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                  <Zap className="h-3 w-3" />
                  <span>Strategies</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {enabledStrategies.slice(0, 3).map(s => (
                    <Badge 
                      key={s.strategy} 
                      variant="outline" 
                      className="text-xs border-[#00F0FF]/50 text-[#00F0FF]"
                    >
                      {STRATEGY_INFO[s.strategy]?.name?.split(' ')[0] || s.strategy}
                    </Badge>
                  ))}
                  {enabledStrategies.length > 3 && (
                    <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                      +{enabledStrategies.length - 3}
                    </Badge>
                  )}
                </div>
              </div>
            )}
            {enabledNetworks.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                  <Network className="h-3 w-3" />
                  <span>Networks</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {enabledNetworks.slice(0, 4).map(n => (
                    <div
                      key={n.network}
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${NETWORK_INFO[n.network]?.color || '#666'}20` }}
                      title={NETWORK_INFO[n.network]?.name || n.network}
                    >
                      <Network 
                        className="h-3 w-3" 
                        style={{ color: NETWORK_INFO[n.network]?.color || '#666' }} 
                      />
                    </div>
                  ))}
                  {enabledNetworks.length > 4 && (
                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center">
                      <span className="text-xs text-gray-400">+{enabledNetworks.length - 4}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Token Preview - only show if no strategies/networks */}
        {enabledStrategies.length === 0 && enabledNetworks.length === 0 && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Top Tokens</span>
              <span>{wallet.tokens.length} tokens</span>
            </div>
            <div className="flex gap-2 mt-2">
              {wallet.tokens.slice(0, 3).map(token => (
                <div
                  key={token.symbol}
                  className="flex items-center gap-1 bg-gray-700 px-2 py-1 rounded text-xs"
                >
                  <span className="text-white font-medium">{token.symbol}</span>
                  <span className="text-gray-400">
                    ${token.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags from wallet */}
        {wallet.tags && wallet.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {wallet.tags.slice(0, 3).map(tag => (
              <Badge 
                key={tag} 
                variant="outline" 
                className="text-xs border-gray-600 text-gray-500"
              >
                #{tag}
              </Badge>
            ))}
            {wallet.tags.length > 3 && (
              <Badge variant="outline" className="text-xs border-gray-600 text-gray-500">
                +{wallet.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
