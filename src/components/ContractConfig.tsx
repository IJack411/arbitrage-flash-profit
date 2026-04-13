import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, AlertCircle, Copy, ExternalLink, Save, 
  Trash2, Shield, Zap, ArrowRight, Info 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  getContractAddresses, 
  saveContractAddresses, 
  clearContractAddresses, 
  isContractConfigured, 
  isValidAddress,
  NETWORKS,
  ContractAddresses 
} from '@/lib/web3/config';

// Well-known Aave V3 Pool addresses per network
const KNOWN_PROVIDERS: Record<string, { name: string; address: string }[]> = {
  ethereum: [
    { name: 'Aave V3 Pool', address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' },
    { name: 'Aave V2 Pool', address: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9' },
    { name: 'dYdX Solo Margin', address: '0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e' },
  ],
  polygon: [
    { name: 'Aave V3 Pool', address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD' },
    { name: 'Aave V2 Pool', address: '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf' },
  ],
  arbitrum: [
    { name: 'Aave V3 Pool', address: '0x794a61358D6845594F94dc1DB02A252b5b4814aD' },
  ],
  bsc: [
    { name: 'PancakeSwap Flash', address: '0x10ED43C718714eb63d5aA57B78B54704E256024E' },
  ],
};

export function ContractConfig() {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<ContractAddresses>({
    arbitrageContract: '',
    flashLoanProvider: '',
    network: 'ethereum',
  });
  const [isConfigured, setIsConfigured] = useState(false);
  const [errors, setErrors] = useState<{ arbitrage?: string; provider?: string }>({});
  const [saved, setSaved] = useState(false);

  // Load saved addresses on mount
  useEffect(() => {
    const saved = getContractAddresses();
    setAddresses(saved);
    setIsConfigured(isContractConfigured());
  }, []);

  const validate = (): boolean => {
    const newErrors: { arbitrage?: string; provider?: string } = {};
    
    if (addresses.arbitrageContract && !isValidAddress(addresses.arbitrageContract)) {
      newErrors.arbitrage = 'Invalid Ethereum address format (must be 0x + 40 hex characters)';
    }
    if (addresses.flashLoanProvider && !isValidAddress(addresses.flashLoanProvider)) {
      newErrors.provider = 'Invalid Ethereum address format (must be 0x + 40 hex characters)';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    saveContractAddresses(addresses);
    setIsConfigured(isContractConfigured());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    
    toast({
      title: 'Contract Addresses Saved',
      description: 'Your contract addresses have been saved to local storage.',
    });
  };

  const handleClear = () => {
    clearContractAddresses();
    setAddresses({ arbitrageContract: '', flashLoanProvider: '', network: 'ethereum' });
    setIsConfigured(false);
    setErrors({});
    toast({
      title: 'Addresses Cleared',
      description: 'All saved contract addresses have been removed.',
    });
  };

  const handleSelectKnownProvider = (address: string) => {
    setAddresses(prev => ({ ...prev, flashLoanProvider: address }));
    setErrors(prev => ({ ...prev, provider: undefined }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Address copied to clipboard' });
  };

  const getExplorerUrl = (address: string) => {
    const net = NETWORKS[addresses.network as keyof typeof NETWORKS];
    return net ? `${net.explorer}/address/${address}` : `https://etherscan.io/address/${address}`;
  };

  const knownProviders = KNOWN_PROVIDERS[addresses.network] || KNOWN_PROVIDERS.ethereum;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <Card className={`border-2 ${isConfigured ? 'border-green-500/50 bg-green-500/5' : 'border-yellow-500/50 bg-yellow-500/5'}`}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isConfigured ? (
                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-yellow-400" />
                </div>
              )}
              <div>
                <h3 className="text-white font-semibold">
                  {isConfigured ? 'Contract Configured' : 'Contract Not Configured'}
                </h3>
                <p className="text-gray-400 text-sm">
                  {isConfigured 
                    ? `Arbitrage contract ready on ${addresses.network}` 
                    : 'Enter your deployed contract addresses below to start trading'}
                </p>
              </div>
            </div>
            <Badge variant={isConfigured ? 'default' : 'secondary'} className={isConfigured ? 'bg-green-600' : ''}>
              {isConfigured ? 'Ready' : 'Setup Required'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Main Config Card */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#00F0FF]" />
            Contract Address Configuration
          </CardTitle>
          <CardDescription className="text-gray-400">
            Enter the addresses from your deployed arbitrage contract. These are saved locally in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Network Selection */}
          <div>
            <Label className="text-gray-300 mb-2 block">Network</Label>
            <Select 
              value={addresses.network} 
              onValueChange={(val) => setAddresses(prev => ({ ...prev, network: val }))}
            >
              <SelectTrigger className="bg-gray-900 border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ethereum">Ethereum Mainnet</SelectItem>
                <SelectItem value="polygon">Polygon</SelectItem>
                <SelectItem value="arbitrum">Arbitrum</SelectItem>
                <SelectItem value="bsc">BSC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Receiver / Arbitrage Contract */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300 flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" />
                Receiver Address (Your Deployed Contract)
              </Label>
              {addresses.arbitrageContract && isValidAddress(addresses.arbitrageContract) && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(addresses.arbitrageContract)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => window.open(getExplorerUrl(addresses.arbitrageContract), '_blank')}>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <Input
              placeholder="0x... (your deployed arbitrage contract address)"
              value={addresses.arbitrageContract}
              onChange={(e) => {
                setAddresses(prev => ({ ...prev, arbitrageContract: e.target.value.trim() }));
                setErrors(prev => ({ ...prev, arbitrage: undefined }));
              }}
              className={`bg-gray-900 border-gray-600 text-white font-mono text-sm ${errors.arbitrage ? 'border-red-500' : ''}`}
            />
            {errors.arbitrage && <p className="text-red-400 text-xs">{errors.arbitrage}</p>}
            <p className="text-gray-500 text-xs">
              This is the contract that receives the flash loan and executes the arbitrage trades.
            </p>
          </div>

          {/* Divider with arrow */}
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 border-t border-gray-700"></div>
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <ArrowRight className="h-3 w-3" />
              Flash loan flows from Provider to Receiver
              <ArrowRight className="h-3 w-3" />
            </div>
            <div className="flex-1 border-t border-gray-700"></div>
          </div>

          {/* Provider Address */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300 flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#00F0FF]" />
                Provider Address (Flash Loan Source)
              </Label>
              {addresses.flashLoanProvider && isValidAddress(addresses.flashLoanProvider) && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(addresses.flashLoanProvider)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => window.open(getExplorerUrl(addresses.flashLoanProvider), '_blank')}>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <Input
              placeholder="0x... (flash loan provider address, e.g., Aave Pool)"
              value={addresses.flashLoanProvider}
              onChange={(e) => {
                setAddresses(prev => ({ ...prev, flashLoanProvider: e.target.value.trim() }));
                setErrors(prev => ({ ...prev, provider: undefined }));
              }}
              className={`bg-gray-900 border-gray-600 text-white font-mono text-sm ${errors.provider ? 'border-red-500' : ''}`}
            />
            {errors.provider && <p className="text-red-400 text-xs">{errors.provider}</p>}
            
            {/* Quick-select known providers */}
            <div className="mt-2">
              <p className="text-gray-500 text-xs mb-2">Quick select a known provider for {addresses.network}:</p>
              <div className="flex flex-wrap gap-2">
                {knownProviders.map((p) => (
                  <Button
                    key={p.address}
                    size="sm"
                    variant="outline"
                    className={`text-xs h-7 ${
                      addresses.flashLoanProvider === p.address 
                        ? 'border-[#00F0FF] text-[#00F0FF] bg-[#00F0FF]/10' 
                        : 'border-gray-600 text-gray-400 hover:text-white'
                    }`}
                    onClick={() => handleSelectKnownProvider(p.address)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-700">
            <Button 
              onClick={handleSave}
              className={`flex-1 ${saved ? 'bg-green-600 hover:bg-green-700' : 'bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900'}`}
              disabled={!addresses.arbitrageContract && !addresses.flashLoanProvider}
            >
              {saved ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Addresses
                </>
              )}
            </Button>
            <Button 
              onClick={handleClear}
              variant="outline"
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
              disabled={!addresses.arbitrageContract && !addresses.flashLoanProvider}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* How It Works Info */}
      <Card className="bg-gray-800/50 border-gray-700">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-[#00F0FF] mt-0.5 flex-shrink-0" />
            <div className="space-y-3 text-sm">
              <h4 className="text-white font-medium">How the addresses are used:</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-purple-400 font-medium mb-1">Receiver (Your Contract)</p>
                  <p className="text-gray-400 text-xs">
                    This is the smart contract you deployed. When a flash loan is triggered, the borrowed funds 
                    are sent to this address. Your contract then executes the arbitrage swaps and repays the loan + fee.
                  </p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-[#00F0FF] font-medium mb-1">Provider (Lending Pool)</p>
                  <p className="text-gray-400 text-xs">
                    This is the flash loan source (e.g., Aave V3 Pool). Your bot calls this contract's 
                    <code className="text-yellow-400 mx-1">flashLoan()</code> function, which sends the borrowed 
                    tokens to your receiver contract.
                  </p>
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                <p className="text-yellow-400 font-medium mb-1">Flow: Provider → Receiver → DEX Swaps → Repay Provider</p>
                <p className="text-gray-400 text-xs">
                  1. Bot calls <code className="text-yellow-400">flashLoan()</code> on the Provider address<br/>
                  2. Provider sends tokens to your Receiver contract<br/>
                  3. Your contract executes arbitrage swaps on DEXes<br/>
                  4. Your contract repays the loan + 0.09% fee to the Provider<br/>
                  5. Profit stays in your contract (withdraw anytime)
                </p>
              </div>
              <Alert className="bg-gray-900 border-gray-600">
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-gray-400 text-xs">
                  <strong className="text-white">You can also set these in your .env file:</strong><br/>
                  <code className="text-green-400">VITE_ARBITRAGE_CONTRACT_ADDRESS=0x...</code><br/>
                  <code className="text-green-400">VITE_FLASH_LOAN_PROVIDER_ADDRESS=0x...</code><br/>
                  Values entered in the UI take priority over .env values.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
