import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, CheckCircle, AlertCircle, Copy, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { ethers } from 'ethers';
import { saveContractAddresses } from '@/lib/web3/config';
import { ContractConfig } from './ContractConfig';

const ARBITRAGE_BYTECODE = '0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550';

const ARBITRAGE_ABI = [
  'function executeArbitrage(address token0, address token1, uint256 amount, address[] calldata routers, bytes calldata swapData) external',
  'function executeFlashLoan(address asset, uint256 amount, bytes calldata params) external',
  'function withdraw(address token) external',
  'function owner() view returns (address)'
];

export function SmartContractDeployer() {
  const [network, setNetwork] = useState('mainnet');
  const [contractType, setContractType] = useState('arbitrage');
  const [privateKey, setPrivateKey] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployedAddress, setDeployedAddress] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [activeSection, setActiveSection] = useState<'config' | 'deploy'>('config');
  const { toast } = useToast();

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const deployContract = async () => {
    if (!privateKey) {
      toast({
        title: 'Error',
        description: 'Please enter your private key',
        variant: 'destructive'
      });
      return;
    }

    setDeploying(true);
    try {
      const provider = new ethers.JsonRpcProvider(
        network === 'mainnet' 
          ? 'https://eth.llamarpc.com'
          : 'https://eth-goerli.public.blastapi.io'
      );

      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Deploy contract
      const factory = new ethers.ContractFactory(ARBITRAGE_ABI, ARBITRAGE_BYTECODE, wallet);
      const contract = await factory.deploy();
      await contract.waitForDeployment();
      
      const address = await contract.getAddress();
      setDeployedAddress(address);

      // Auto-save the deployed address as the receiver contract
      saveContractAddresses({ 
        arbitrageContract: address,
        network: network === 'mainnet' ? 'ethereum' : network,
      });

      // Save to database
      await supabase.from('smart_contracts').insert({
        name: `${contractType}-${Date.now()}`,
        address,
        network,
        abi: ARBITRAGE_ABI,
        bytecode: ARBITRAGE_BYTECODE,
        verified: false
      });

      toast({
        title: 'Contract Deployed!',
        description: `Contract deployed at ${address}. Address auto-saved to config.`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Deployment Failed',
        description: getErrorMessage(error),
        variant: 'destructive'
      });
    } finally {
      setDeploying(false);
    }
  };

  const verifyContract = async () => {
    if (!deployedAddress) return;

    setVerifying(true);
    try {
      const apiKey = network === 'mainnet' 
        ? 'YourEtherscanAPIKey'
        : 'YourGoerliEtherscanAPIKey';

      const response = await fetch(`https://api${network === 'goerli' ? '-goerli' : ''}.etherscan.io/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          module: 'contract',
          action: 'verifysourcecode',
          apikey: apiKey,
          contractaddress: deployedAddress,
          sourceCode: 'contract source here',
          contractname: 'ArbitrageBot',
          compilerversion: 'v0.8.19+commit.7dd6d404',
          optimizationUsed: '1',
          runs: '200'
        })
      });

      const result = await response.json();
      
      if (result.status === '1') {
        await supabase
          .from('smart_contracts')
          .update({ verified: true })
          .eq('address', deployedAddress);

        toast({
          title: 'Contract Verified!',
          description: 'Your contract has been verified on Etherscan',
        });
      }
    } catch (error: unknown) {
      toast({
        title: 'Verification Failed',
        description: getErrorMessage(error),
        variant: 'destructive'
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Toggle */}
      <div className="flex gap-2 bg-gray-800 border border-gray-700 rounded-lg p-1">
        <button
          onClick={() => setActiveSection('config')}
          className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeSection === 'config' 
              ? 'bg-[#00F0FF] text-gray-900' 
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          Configure Addresses (Already Deployed)
        </button>
        <button
          onClick={() => setActiveSection('deploy')}
          className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeSection === 'deploy' 
              ? 'bg-purple-600 text-white' 
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          Deploy New Contract
        </button>
      </div>

      {/* Contract Config Section */}
      {activeSection === 'config' && <ContractConfig />}

      {/* Deploy Section */}
      {activeSection === 'deploy' && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Deploy New Smart Contract</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Network</Label>
                <Select value={network} onValueChange={setNetwork}>
                  <SelectTrigger className="bg-gray-900 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mainnet">Ethereum Mainnet</SelectItem>
                    <SelectItem value="goerli">Goerli Testnet</SelectItem>
                    <SelectItem value="polygon">Polygon</SelectItem>
                    <SelectItem value="bsc">BSC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-gray-300">Contract Type</Label>
                <Select value={contractType} onValueChange={setContractType}>
                  <SelectTrigger className="bg-gray-900 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="arbitrage">Arbitrage Bot</SelectItem>
                    <SelectItem value="flashloan">Flash Loan Handler</SelectItem>
                    <SelectItem value="mev">MEV Executor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-gray-300">Private Key (for deployment)</Label>
              <Input
                type="password"
                placeholder="0x..."
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="bg-gray-900 border-gray-600 text-white"
              />
            </div>

            {deployedAddress && (
              <Alert className="bg-green-500/10 border-green-500/50">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="flex items-center justify-between text-green-300">
                  <span>Contract: {deployedAddress.slice(0, 10)}...{deployedAddress.slice(-8)}</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigator.clipboard.writeText(deployedAddress)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`https://etherscan.io/address/${deployedAddress}`, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={deployContract} 
                disabled={deploying || !privateKey}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
              >
                {deploying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Deploy Contract
                  </>
                )}
              </Button>
              
              {deployedAddress && (
                <Button 
                  onClick={verifyContract}
                  disabled={verifying}
                  variant="outline"
                  className="border-gray-600 text-gray-300"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify on Etherscan'
                  )}
                </Button>
              )}
            </div>

            <Alert className="bg-gray-900 border-gray-600">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-gray-400">
                <strong className="text-white">Security Note:</strong> Never share your private key. Use a dedicated deployment wallet with minimal funds.
                After deployment, the contract address is automatically saved to your configuration.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
