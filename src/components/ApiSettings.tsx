import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Eye, EyeOff, Save, Shield, Check, Zap, Bell, ExternalLink, Wallet, DollarSign, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { saveApiConfig, getUnifiedConfig } from '@/lib/web3/unifiedApiConfig';
import { feeService, FeeConfig } from '@/lib/feeService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ApiSettings() {
  const { toast } = useToast();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [alchemyKey, setAlchemyKey] = useState('');
  const [webhooks, setWebhooks] = useState({ discord: '', telegram: '', slack: '', custom: '' });
  
  // Fee configuration state
  const [feeConfig, setFeeConfig] = useState<FeeConfig>(feeService.getConfig());
  const [feeStats, setFeeStats] = useState(feeService.getStats());

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  useEffect(() => {
    const config = getUnifiedConfig();
    setAlchemyKey(config.provider.apiKey);
    setWebhooks({
      discord: config.webhooks.discord || '',
      telegram: config.webhooks.telegram || '',
      slack: config.webhooks.slack || '',
      custom: config.webhooks.custom || '',
    });
  }, []);

  const handleSave = () => {
    saveApiConfig({
      provider: { type: 'alchemy', apiKey: alchemyKey, networks: {} },
      webhooks,
    });
    // Also save to old format for backward compatibility
    const oldKeys = JSON.parse(localStorage.getItem('apiKeys') || '{}');
    oldKeys.dex = { ...oldKeys.dex, alchemyKey };
    localStorage.setItem('apiKeys', JSON.stringify(oldKeys));
    
    setSaved(true);
    toast({ title: "Configuration Saved", description: "Your unified API configuration has been saved." });
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSaveFeeConfig = () => {
    try {
      if (feeConfig.feeWalletAddress && !/^0x[a-fA-F0-9]{40}$/.test(feeConfig.feeWalletAddress)) {
        toast({ title: "Invalid Address", description: "Please enter a valid Ethereum wallet address.", variant: "destructive" });
        return;
      }
      feeService.updateConfig(feeConfig);
      setFeeStats(feeService.getStats());
      toast({ title: "Fee Configuration Saved", description: "Platform fee settings have been updated." });
    } catch (error: unknown) {
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const toggleShow = (field: string) => setShowKeys(prev => ({ ...prev, [field]: !prev[field] }));

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-cyan-400" />
          Platform Configuration
        </CardTitle>
        <CardDescription>
          Configure API keys, webhooks, and platform fee settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="api" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api">API & Webhooks</TabsTrigger>
            <TabsTrigger value="fees">Platform Fees</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="space-y-6">
            <Alert className="bg-cyan-500/10 border-cyan-500/30">
              <Zap className="h-4 w-4 text-cyan-400" />
              <AlertDescription className="text-cyan-100">
                <strong>Alchemy API Key</strong> provides: RPC for all networks, transaction simulation, The Graph queries, and mempool access.
              </AlertDescription>
            </Alert>

            {/* Primary API Key */}
            <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" /> Primary API Key (Required)
              </h3>
              <div>
                <Label htmlFor="alchemy">Alchemy API Key</Label>
                <div className="relative mt-1">
                  <Input id="alchemy" type={showKeys['alchemy'] ? 'text' : 'password'} placeholder="Enter your Alchemy API key" value={alchemyKey} onChange={(e) => setAlchemyKey(e.target.value)} className="pr-10" />
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => toggleShow('alchemy')}>
                    {showKeys['alchemy'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <a href="https://dashboard.alchemy.com" target="_blank" rel="noopener" className="text-xs text-cyan-400 hover:underline flex items-center gap-1 mt-1">
                  Get free key at Alchemy <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Webhook URLs */}
            <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Bell className="h-4 w-4 text-green-400" /> Notification Webhooks (Optional)
              </h3>
              <p className="text-gray-400 text-sm">No API keys needed - just paste webhook URLs</p>
              
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="discord">Discord Webhook URL</Label>
                  <Input id="discord" placeholder="https://discord.com/api/webhooks/..." value={webhooks.discord} onChange={(e) => setWebhooks(p => ({ ...p, discord: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="telegram">Telegram Bot Webhook</Label>
                  <Input id="telegram" placeholder="https://api.telegram.org/bot.../sendMessage" value={webhooks.telegram} onChange={(e) => setWebhooks(p => ({ ...p, telegram: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="slack">Slack Webhook URL</Label>
                  <Input id="slack" placeholder="https://hooks.slack.com/services/..." value={webhooks.slack} onChange={(e) => setWebhooks(p => ({ ...p, slack: e.target.value }))} className="mt-1" />
                </div>
              </div>
            </div>

            <Button onClick={handleSave} className="w-full gap-2 bg-cyan-500 hover:bg-cyan-600">
              {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? 'Saved!' : 'Save Configuration'}
            </Button>
          </TabsContent>

          <TabsContent value="fees" className="space-y-6">
            {/* Fee Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <DollarSign className="h-4 w-4" />
                  Total Collected
                </div>
                <div className="text-2xl font-bold text-green-400">
                  ${feeStats.totalCollected.toFixed(2)}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Pending Fees
                </div>
                <div className="text-2xl font-bold text-yellow-400">
                  ${feeStats.pendingFees.toFixed(2)}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <Check className="h-4 w-4" />
                  Transactions
                </div>
                <div className="text-2xl font-bold text-white">
                  {feeStats.completedTransactions}
                </div>
              </div>
            </div>

            {/* Fee Wallet Configuration */}
            <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[#00F0FF]" /> Fee Collection Wallet
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Enable Fees</span>
                  <Switch
                    checked={feeConfig.enabled}
                    onCheckedChange={(checked) => setFeeConfig(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="feeWallet">Wallet Address</Label>
                <div className="relative mt-1">
                  <Input 
                    id="feeWallet" 
                    type={showKeys['feeWallet'] ? 'text' : 'password'} 
                    placeholder="0x..." 
                    value={feeConfig.feeWalletAddress} 
                    onChange={(e) => setFeeConfig(prev => ({ ...prev, feeWalletAddress: e.target.value }))} 
                    className="pr-10 font-mono" 
                  />
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => toggleShow('feeWallet')}>
                    {showKeys['feeWallet'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Platform fees will be sent to this wallet address</p>
              </div>
            </div>

            {/* Fee Percentages */}
            <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-400" /> Fee Rates
              </h3>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <Label>Trade Fee: {feeConfig.tradeFeePercent}%</Label>
                    <span className="text-gray-400 text-sm">of profit</span>
                  </div>
                  <Slider
                    value={[feeConfig.tradeFeePercent]}
                    onValueChange={([val]) => setFeeConfig(prev => ({ ...prev, tradeFeePercent: val }))}
                    min={0}
                    max={5}
                    step={0.1}
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <Label>Flash Loan Fee: {feeConfig.flashLoanFeePercent}%</Label>
                    <span className="text-gray-400 text-sm">of profit</span>
                  </div>
                  <Slider
                    value={[feeConfig.flashLoanFeePercent]}
                    onValueChange={([val]) => setFeeConfig(prev => ({ ...prev, flashLoanFeePercent: val }))}
                    min={0}
                    max={3}
                    step={0.1}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minFee">Minimum Fee ($)</Label>
                    <Input
                      id="minFee"
                      type="number"
                      value={feeConfig.minFeeUSD}
                      onChange={(e) => setFeeConfig(prev => ({ ...prev, minFeeUSD: parseFloat(e.target.value) || 0 }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxFee">Maximum Fee ($)</Label>
                    <Input
                      id="maxFee"
                      type="number"
                      value={feeConfig.maxFeeUSD}
                      onChange={(e) => setFeeConfig(prev => ({ ...prev, maxFeeUSD: parseFloat(e.target.value) || 0 }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Subscription Discounts */}
            <div className="space-y-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
              <h3 className="text-white font-semibold">Subscription Discounts</h3>
              <p className="text-gray-400 text-sm">Fee discounts for subscription tiers</p>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Basic: {(feeConfig.subscriptionDiscounts.basic * 100)}% off</Label>
                  <Slider
                    value={[feeConfig.subscriptionDiscounts.basic * 100]}
                    onValueChange={([val]) => setFeeConfig(prev => ({
                      ...prev,
                      subscriptionDiscounts: { ...prev.subscriptionDiscounts, basic: val / 100 }
                    }))}
                    min={0}
                    max={50}
                    step={5}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Pro: {(feeConfig.subscriptionDiscounts.pro * 100)}% off</Label>
                  <Slider
                    value={[feeConfig.subscriptionDiscounts.pro * 100]}
                    onValueChange={([val]) => setFeeConfig(prev => ({
                      ...prev,
                      subscriptionDiscounts: { ...prev.subscriptionDiscounts, pro: val / 100 }
                    }))}
                    min={0}
                    max={75}
                    step={5}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Enterprise: {(feeConfig.subscriptionDiscounts.enterprise * 100)}% off</Label>
                  <Slider
                    value={[feeConfig.subscriptionDiscounts.enterprise * 100]}
                    onValueChange={([val]) => setFeeConfig(prev => ({
                      ...prev,
                      subscriptionDiscounts: { ...prev.subscriptionDiscounts, enterprise: val / 100 }
                    }))}
                    min={0}
                    max={100}
                    step={5}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>

            <Button onClick={handleSaveFeeConfig} className="w-full gap-2 bg-green-500 hover:bg-green-600">
              <Save className="h-4 w-4" />
              Save Fee Configuration
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
