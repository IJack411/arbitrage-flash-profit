import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  DollarSign, 
  Settings, 
  Plus, 
  Trash2, 
  Edit,
  Percent,
  Wallet,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { feeService, FeeConfig, FeeTransaction } from '@/lib/feeService';
import { adminService, FeeOverride } from '@/lib/adminService';
import { useToast } from '@/hooks/use-toast';

export const FeeConfigPanel: React.FC = () => {
  const { toast } = useToast();
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(feeService.getConfig());
  const [feeOverrides, setFeeOverrides] = useState<FeeOverride[]>([]);
  const [feeHistory, setFeeHistory] = useState<FeeTransaction[]>([]);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState<FeeOverride | null>(null);
  
  // New override form state
  const [newOverride, setNewOverride] = useState({
    walletAddress: '',
    feePercent: 0.25,
    reason: '',
    expiresAt: '',
  });

  useEffect(() => {
    setFeeOverrides(adminService.getFeeOverrides());
    setFeeHistory(adminService.getFeeHistory(50));
  }, []);

  const handleSaveConfig = () => {
    try {
      adminService.updateFeeConfig(feeConfig);
      toast({ 
        title: 'Configuration Saved', 
        description: 'Fee configuration has been updated' 
      });
    } catch (error: unknown) {
      toast({ 
        title: 'Error', 
        description: getErrorMessage(error), 
        variant: 'destructive' 
      });
    }
  };

  const handleCreateOverride = () => {
    const override = adminService.createFeeOverride({
      walletAddress: newOverride.walletAddress || undefined,
      feePercent: newOverride.feePercent,
      reason: newOverride.reason,
      createdBy: 'admin@platform.com',
      expiresAt: newOverride.expiresAt || undefined,
      isActive: true,
    });
    setFeeOverrides([override, ...feeOverrides]);
    setShowOverrideModal(false);
    setNewOverride({ walletAddress: '', feePercent: 0.25, reason: '', expiresAt: '' });
    toast({ title: 'Override Created', description: 'Fee override has been added' });
  };

  const handleDeleteOverride = (id: string) => {
    adminService.deleteFeeOverride(id);
    setFeeOverrides(feeOverrides.filter(o => o.id !== id));
    toast({ title: 'Override Deleted', description: 'Fee override has been removed' });
  };

  const handleToggleOverride = (id: string, isActive: boolean) => {
    adminService.updateFeeOverride(id, { isActive });
    setFeeOverrides(feeOverrides.map(o => o.id === id ? { ...o, isActive } : o));
  };

  const feeStats = feeService.getStats();

  return (
    <div className="space-y-6">
      {/* Fee Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <DollarSign className="h-6 w-6 text-[#00F0FF] mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">
              ${feeStats.totalCollected.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400">Total Collected</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 text-yellow-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">
              ${feeStats.pendingFees.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400">Pending Fees</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{feeStats.completedTransactions}</p>
            <p className="text-xs text-gray-400">Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <XCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{feeStats.failedTransactions}</p>
            <p className="text-xs text-gray-400">Failed</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4 text-center">
            <Percent className="h-6 w-6 text-purple-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">${feeStats.averageFee.toFixed(2)}</p>
            <p className="text-xs text-gray-400">Avg Fee</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Fee Configuration */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="h-5 w-5 text-[#00F0FF]" />
              Fee Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Enable Fee Collection</Label>
                <p className="text-gray-400 text-xs">Turn on/off platform fees</p>
              </div>
              <Switch
                checked={feeConfig.enabled}
                onCheckedChange={(enabled) => setFeeConfig({ ...feeConfig, enabled })}
              />
            </div>

            <div>
              <Label className="text-white">Fee Wallet Address</Label>
              <Input
                value={feeConfig.feeWalletAddress}
                onChange={(e) => setFeeConfig({ ...feeConfig, feeWalletAddress: e.target.value })}
                placeholder="0x..."
                className="bg-gray-700 border-gray-600 text-white mt-1 font-mono"
              />
            </div>

            <div>
              <Label className="text-white">Trade Fee: {feeConfig.tradeFeePercent}%</Label>
              <Slider
                value={[feeConfig.tradeFeePercent]}
                onValueChange={([val]) => setFeeConfig({ ...feeConfig, tradeFeePercent: val })}
                max={2}
                step={0.05}
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-white">Flash Loan Fee: {feeConfig.flashLoanFeePercent}%</Label>
              <Slider
                value={[feeConfig.flashLoanFeePercent]}
                onValueChange={([val]) => setFeeConfig({ ...feeConfig, flashLoanFeePercent: val })}
                max={1}
                step={0.05}
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white">Min Fee ($)</Label>
                <Input
                  type="number"
                  value={feeConfig.minFeeUSD}
                  onChange={(e) => setFeeConfig({ ...feeConfig, minFeeUSD: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-700 border-gray-600 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-white">Max Fee ($)</Label>
                <Input
                  type="number"
                  value={feeConfig.maxFeeUSD}
                  onChange={(e) => setFeeConfig({ ...feeConfig, maxFeeUSD: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-700 border-gray-600 text-white mt-1"
                />
              </div>
            </div>

            <div className="pt-2">
              <Label className="text-white mb-2 block">Subscription Discounts</Label>
              <div className="space-y-2">
                {(['basic', 'pro', 'enterprise'] as const).map((tier) => (
                  <div key={tier} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                    <span className="text-gray-300 capitalize">{tier}</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={(feeConfig.subscriptionDiscounts[tier] * 100).toFixed(0)}
                        onChange={(e) => setFeeConfig({
                          ...feeConfig,
                          subscriptionDiscounts: {
                            ...feeConfig.subscriptionDiscounts,
                            [tier]: parseFloat(e.target.value) / 100 || 0,
                          },
                        })}
                        className="w-20 bg-gray-600 border-gray-500 text-white text-sm"
                      />
                      <span className="text-gray-400 text-sm">% off</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button 
              onClick={handleSaveConfig}
              className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900"
            >
              Save Configuration
            </Button>
          </CardContent>
        </Card>

        {/* Fee Overrides */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Percent className="h-5 w-5 text-purple-400" />
                Fee Overrides
              </CardTitle>
              <Button
                size="sm"
                onClick={() => setShowOverrideModal(true)}
                className="bg-purple-500 hover:bg-purple-600"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Override
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {feeOverrides.map((override) => (
                <div
                  key={override.id}
                  className={`p-3 rounded-lg border ${
                    override.isActive 
                      ? 'bg-gray-700/50 border-gray-600' 
                      : 'bg-gray-800/50 border-gray-700 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={override.isActive ? 'border-green-500 text-green-400' : 'border-gray-500 text-gray-400'}
                      >
                        {override.feePercent}% fee
                      </Badge>
                      {override.expiresAt && (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-400 text-xs">
                          Expires {new Date(override.expiresAt).toLocaleDateString()}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={override.isActive}
                        onCheckedChange={(checked) => handleToggleOverride(override.id, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteOverride(override.id)}
                        className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {override.walletAddress && (
                    <p className="text-gray-400 text-xs font-mono truncate">
                      {override.walletAddress}
                    </p>
                  )}
                  <p className="text-gray-300 text-sm mt-1">{override.reason}</p>
                </div>
              ))}
              {feeOverrides.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No fee overrides configured
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Fee Transactions */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-400" />
            Recent Fee Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700">
                <TableHead className="text-gray-400">Trade ID</TableHead>
                <TableHead className="text-gray-400">Wallet</TableHead>
                <TableHead className="text-gray-400">Amount</TableHead>
                <TableHead className="text-gray-400">Status</TableHead>
                <TableHead className="text-gray-400">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeHistory.slice(0, 10).map((tx) => (
                <TableRow key={tx.id} className="border-gray-700/50">
                  <TableCell className="text-white font-mono text-sm">
                    {tx.tradeId.slice(0, 12)}...
                  </TableCell>
                  <TableCell className="text-gray-300 font-mono text-sm">
                    {tx.walletAddress.slice(0, 6)}...{tx.walletAddress.slice(-4)}
                  </TableCell>
                  <TableCell className="text-[#00F0FF] font-medium">
                    ${tx.feeAmount.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      className={
                        tx.status === 'completed' ? 'border-green-500 text-green-400' :
                        tx.status === 'pending' ? 'border-yellow-500 text-yellow-400' :
                        'border-red-500 text-red-400'
                      }
                    >
                      {tx.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-400 text-sm">
                    {new Date(tx.timestamp).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Override Modal */}
      <Dialog open={showOverrideModal} onOpenChange={setShowOverrideModal}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Plus className="h-5 w-5 text-purple-400" />
              Add Fee Override
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-white">Wallet Address (optional)</Label>
              <Input
                value={newOverride.walletAddress}
                onChange={(e) => setNewOverride({ ...newOverride, walletAddress: e.target.value })}
                placeholder="0x... (leave empty for user-level override)"
                className="bg-gray-700 border-gray-600 text-white mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-white">Override Fee: {newOverride.feePercent}%</Label>
              <Slider
                value={[newOverride.feePercent]}
                onValueChange={([val]) => setNewOverride({ ...newOverride, feePercent: val })}
                max={1}
                step={0.05}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-white">Reason</Label>
              <Input
                value={newOverride.reason}
                onChange={(e) => setNewOverride({ ...newOverride, reason: e.target.value })}
                placeholder="e.g., VIP customer, promotional offer"
                className="bg-gray-700 border-gray-600 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-white">Expires At (optional)</Label>
              <Input
                type="date"
                value={newOverride.expiresAt}
                onChange={(e) => setNewOverride({ ...newOverride, expiresAt: e.target.value })}
                className="bg-gray-700 border-gray-600 text-white mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverrideModal(false)} className="border-gray-600">
              Cancel
            </Button>
            <Button 
              onClick={handleCreateOverride}
              disabled={!newOverride.reason}
              className="bg-purple-500 hover:bg-purple-600"
            >
              Create Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
