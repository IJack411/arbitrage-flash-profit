import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeploymentWizard } from './deployment/DeploymentWizard';
import { FullFunctionCode } from './deployment/FullFunctionCode';
import { AlchemySecretSetup } from './deployment/AlchemySecretSetup';
import { NoCodeDeployment } from './deployment/NoCodeDeployment';
import { CodeBlock } from './deployment/CodeBlock';
import { Terminal, FileCode, Rocket, BookOpen, ExternalLink, Play, Loader2, CheckCircle, AlertCircle, Key, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface ScanResult {
  found?: number;
  error?: string;
  [key: string]: unknown;
}

export const EdgeFunctionDeployer: React.FC = () => {
  const { toast } = useToast();
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const runManualScan = async () => {
    setScanStatus('scanning');
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities');
      if (error) throw error;
      setScanStatus('success');
      setScanResult(data);
      toast({ title: 'Scan Complete', description: `Found ${data?.found || 0} opportunities` });
    } catch (err: unknown) {
      setScanStatus('error');
      const message = getErrorMessage(err);
      setScanResult({ error: message });
      toast({ title: 'Scan Failed', description: message, variant: 'destructive' });
    }
  };

  const testConnection = async () => {
    setScanStatus('scanning');
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: { test: true }
      });
      if (error) throw error;
      setScanStatus('success');
      setScanResult(data);
      toast({ title: 'Connection OK', description: 'Edge function is responding' });
    } catch (err: unknown) {
      setScanStatus('error');
      const message = getErrorMessage(err);
      setScanResult({ error: message });
      toast({ title: 'Connection Failed', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Rocket className="h-7 w-7 text-cyan-400" />
              Edge Function Deployment
            </h2>
            <p className="text-gray-400 mt-1">Deploy and test your arbitrage scanner on Supabase</p>
          </div>
          <div className="flex gap-3">
            <button onClick={testConnection} disabled={scanStatus === 'scanning'}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg flex items-center gap-2">
              {scanStatus === 'scanning' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Test Connection
            </button>
            <button onClick={runManualScan} disabled={scanStatus === 'scanning'}
              className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-lg flex items-center gap-2">
              {scanStatus === 'scanning' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              Run Full Scan
            </button>
          </div>
        </div>
        {scanResult && (
          <div className={`mt-4 p-4 rounded-lg ${scanStatus === 'success' ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              {scanStatus === 'success' ? <CheckCircle className="h-5 w-5 text-green-400" /> : <AlertCircle className="h-5 w-5 text-red-400" />}
              <span className="text-white font-medium">
                {scanStatus === 'success' ? (scanResult.found !== undefined ? `Found ${scanResult.found} opportunities` : 'Connection successful') : 'Error'}
              </span>
            </div>
            <pre className="text-xs text-gray-400 overflow-auto max-h-24">{JSON.stringify(scanResult, null, 2)}</pre>
          </div>
        )}
      </div>

      <Tabs defaultValue="easy-deploy" className="p-6">
        <TabsList className="bg-gray-900 border border-gray-700 mb-6 flex-wrap">
          <TabsTrigger value="easy-deploy" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white">
            <Sparkles className="h-4 w-4 mr-2" />
            Easy Deploy
          </TabsTrigger>
          <TabsTrigger value="api-setup" className="data-[state=active]:bg-yellow-500 data-[state=active]:text-gray-900">
            <Key className="h-4 w-4 mr-2" />
            API Key Setup
          </TabsTrigger>
          <TabsTrigger value="wizard"><Terminal className="h-4 w-4 mr-2" />Advanced</TabsTrigger>
          <TabsTrigger value="code"><FileCode className="h-4 w-4 mr-2" />Full Code</TabsTrigger>
          <TabsTrigger value="docs"><BookOpen className="h-4 w-4 mr-2" />Quick Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="easy-deploy">
          <NoCodeDeployment />
        </TabsContent>
        <TabsContent value="api-setup">
          <AlchemySecretSetup />
        </TabsContent>
        <TabsContent value="wizard"><DeploymentWizard /></TabsContent>
        <TabsContent value="code"><FullFunctionCode /></TabsContent>
        <TabsContent value="docs">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-900 rounded-lg p-5">
              <h4 className="text-white font-semibold mb-3">Quick Commands</h4>
              <CodeBlock code={`npm install -g supabase
supabase login
supabase link --project-ref YOUR_REF
supabase functions new scan-arbitrage-opportunities
supabase secrets set ALCHEMY_API_KEY=your_key
supabase functions deploy`} />
            </div>
            <div className="bg-gray-900 rounded-lg p-5">
              <h4 className="text-white font-semibold mb-3">Useful Links</h4>
              <ul className="space-y-3">
                <li><a href="https://supabase.com/docs/guides/functions" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline flex items-center gap-2"><ExternalLink className="h-4 w-4" />Supabase Functions Docs</a></li>
                <li><a href="https://dashboard.alchemy.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline flex items-center gap-2"><ExternalLink className="h-4 w-4" />Get Alchemy API Key (Free)</a></li>
                <li><a href="https://infura.io" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline flex items-center gap-2"><ExternalLink className="h-4 w-4" />Get Infura API Key (Backup)</a></li>
                <li><a href="https://docs.flashbots.net" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline flex items-center gap-2"><ExternalLink className="h-4 w-4" />Flashbots Documentation</a></li>
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
