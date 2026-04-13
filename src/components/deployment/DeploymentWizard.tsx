import React, { useState } from 'react';
import { Terminal, Database, Cloud, Key, Play, CheckCircle, AlertCircle, Loader2, Bell, Webhook, Copy, ExternalLink } from 'lucide-react';
import { WizardStep } from './WizardStep';
import { CodeBlock } from './CodeBlock';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export const DeploymentWizard: React.FC = () => {
  const { toast } = useToast();
  const [openStep, setOpenStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [webhookTestStatus, setWebhookTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  // Your project details
  const PROJECT_REF = 'ujhsrxinfcycjtulpvqk';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c';

  const markComplete = (step: number) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps([...completedSteps, step]);
    }
    setOpenStep(step + 1);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} copied to clipboard` });
  };

  const testEdgeFunction = async () => {
    setTestStatus('testing');
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: { test: true }
      });
      if (error) throw error;
      setTestStatus('success');
      setTestResult(data);
      markComplete(6);
      toast({ title: 'Success!', description: 'Edge function is responding correctly.' });
    } catch (err: unknown) {
      setTestStatus('error');
      const message = getErrorMessage(err);
      setTestResult({ error: message });
      toast({ title: 'Test Failed', description: message, variant: 'destructive' });
    }
  };

  const runFullScan = async () => {
    setTestStatus('testing');
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: { networks: ['ethereum', 'polygon', 'arbitrum'] }
      });
      if (error) throw error;
      setTestStatus('success');
      setTestResult(data);
      toast({ 
        title: 'Scan Complete!', 
        description: `Found ${data?.found || 0} arbitrage opportunities.` 
      });
    } catch (err: unknown) {
      setTestStatus('error');
      const message = getErrorMessage(err);
      setTestResult({ error: message });
      toast({ title: 'Scan Failed', description: message, variant: 'destructive' });
    }
  };

  const testWebhooks = async () => {
    setWebhookTestStatus('testing');
    try {
      const { data, error } = await supabase.functions.invoke('trading-signals', {
        body: { 
          action: 'test-webhooks',
          webhooks: {
            // Add your webhook URLs here for testing
          }
        }
      });
      if (error) throw error;
      setWebhookTestStatus('success');
      toast({ title: 'Webhook Test Sent!', description: 'Check your configured channels for the test message.' });
    } catch (err: unknown) {
      setWebhookTestStatus('error');
      toast({ title: 'Webhook Test Failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-xl p-6 mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Deploy Edge Functions</h2>
        <p className="text-gray-400">Follow these steps to deploy your arbitrage scanner and webhook endpoints.</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
            {completedSteps.length}/7 Complete
          </span>
          <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-sm">
            Project: {PROJECT_REF}
          </span>
        </div>
        
        {/* Quick Copy Section */}
        <div className="mt-4 p-4 bg-gray-800/50 rounded-lg">
          <p className="text-sm text-gray-400 mb-2">Quick Copy:</p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => copyToClipboard(PROJECT_REF, 'Project Ref')}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> Project Ref
            </button>
            <button 
              onClick={() => copyToClipboard(ANON_KEY, 'Anon Key')}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm flex items-center gap-1"
            >
              <Copy className="h-3 w-3" /> Anon Key
            </button>
            <a 
              href={`https://supabase.com/dashboard/project/${PROJECT_REF}/functions`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> Open Dashboard
            </a>
          </div>
        </div>
      </div>

      <WizardStep
        number={1} title="Install Supabase CLI" description="Install the CLI tool globally"
        isOpen={openStep === 1} isCompleted={completedSteps.includes(1)} isActive={openStep === 1}
        onToggle={() => setOpenStep(openStep === 1 ? 0 : 1)} icon={<Terminal className="h-5 w-5 text-cyan-400" />}
      >
        <div className="space-y-4">
          <p className="text-gray-300">Install using npm or brew:</p>
          <CodeBlock code="npm install -g supabase" title="Terminal" />
          <CodeBlock code="# Or on macOS:\nbrew install supabase/tap/supabase" title="Alternative" />
          <button onClick={() => markComplete(1)} className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg">
            Mark as Complete
          </button>
        </div>
      </WizardStep>

      <WizardStep
        number={2} title="Login & Link Project" description="Connect to your Supabase project"
        isOpen={openStep === 2} isCompleted={completedSteps.includes(2)} isActive={openStep === 2}
        onToggle={() => setOpenStep(openStep === 2 ? 0 : 2)} icon={<Database className="h-5 w-5 text-purple-400" />}
      >
        <div className="space-y-4">
          <CodeBlock code="supabase login" title="Step 1: Login" />
          <CodeBlock code={`supabase link --project-ref ${PROJECT_REF}`} title="Step 2: Link" />
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-green-400 text-sm">Your project ref is pre-filled: <code className="bg-gray-800 px-2 py-0.5 rounded">{PROJECT_REF}</code></p>
          </div>
          <button onClick={() => markComplete(2)} className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg">
            Mark as Complete
          </button>
        </div>
      </WizardStep>

      <WizardStep
        number={3} title="Set API Secrets (Alchemy)" description="Add your Alchemy API key for blockchain access"
        isOpen={openStep === 3} isCompleted={completedSteps.includes(3)} isActive={openStep === 3}
        onToggle={() => setOpenStep(openStep === 3 ? 0 : 3)} icon={<Key className="h-5 w-5 text-yellow-400" />}
      >
        <div className="space-y-4">
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-400 font-medium mb-2">Get Your Alchemy API Key:</p>
            <ol className="text-gray-300 text-sm space-y-1 list-decimal list-inside">
              <li>Go to <a href="https://dashboard.alchemy.com" target="_blank" className="text-cyan-400 hover:underline">dashboard.alchemy.com</a></li>
              <li>Create a free account or sign in</li>
              <li>Create a new app (select Ethereum Mainnet)</li>
              <li>Copy your API key</li>
            </ol>
          </div>
          
          <CodeBlock code="# Set your Alchemy API key (REQUIRED)\nsupabase secrets set ALCHEMY_API_KEY=your_alchemy_key_here" title="Primary RPC Provider" />
          <CodeBlock code="# Optional: Add Infura as backup\nsupabase secrets set INFURA_API_KEY=your_infura_key_here" title="Backup Provider (Optional)" />
          
          <p className="text-gray-400 text-sm">
            Or add via Dashboard: <a href={`https://supabase.com/dashboard/project/${PROJECT_REF}/settings/functions`} target="_blank" className="text-cyan-400 hover:underline">Settings → Edge Functions → Secrets</a>
          </p>
          <button onClick={() => markComplete(3)} className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg">
            Mark as Complete
          </button>
        </div>
      </WizardStep>

      <WizardStep
        number={4} title="Create Edge Functions" description="Create the scanner and webhook functions"
        isOpen={openStep === 4} isCompleted={completedSteps.includes(4)} isActive={openStep === 4}
        onToggle={() => setOpenStep(openStep === 4 ? 0 : 4)} icon={<Cloud className="h-5 w-5 text-green-400" />}
      >
        <div className="space-y-4">
          <p className="text-gray-300">Create all three edge functions:</p>
          <CodeBlock code={`# 1. Arbitrage Scanner
supabase functions new scan-arbitrage-opportunities

# 2. Price Alert Webhooks
supabase functions new price-alert-webhook

# 3. Trading Signals
supabase functions new trading-signals`} title="Create Functions" />
          
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-blue-400 text-sm">
              Copy the function code from <code className="bg-gray-800 px-2 py-0.5 rounded">EDGE_FUNCTION_DEPLOYMENT_GUIDE.md</code> in your project root.
            </p>
          </div>
          
          <button onClick={() => markComplete(4)} className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg">
            Mark as Complete
          </button>
        </div>
      </WizardStep>

      <WizardStep
        number={5} title="Configure Webhooks" description="Set up Discord, Slack, and Telegram notifications"
        isOpen={openStep === 5} isCompleted={completedSteps.includes(5)} isActive={openStep === 5}
        onToggle={() => setOpenStep(openStep === 5 ? 0 : 5)} icon={<Bell className="h-5 w-5 text-pink-400" />}
      >
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-[#5865F2]/10 border border-[#5865F2]/30 rounded-lg">
              <h4 className="text-[#5865F2] font-medium mb-2">Discord</h4>
              <ol className="text-gray-400 text-xs space-y-1 list-decimal list-inside">
                <li>Server Settings → Integrations</li>
                <li>Create Webhook</li>
                <li>Copy URL</li>
              </ol>
            </div>
            <div className="p-4 bg-[#4A154B]/30 border border-[#4A154B]/50 rounded-lg">
              <h4 className="text-purple-400 font-medium mb-2">Slack</h4>
              <ol className="text-gray-400 text-xs space-y-1 list-decimal list-inside">
                <li>api.slack.com/apps</li>
                <li>Incoming Webhooks</li>
                <li>Add to Workspace</li>
              </ol>
            </div>
            <div className="p-4 bg-[#0088cc]/10 border border-[#0088cc]/30 rounded-lg">
              <h4 className="text-[#0088cc] font-medium mb-2">Telegram</h4>
              <ol className="text-gray-400 text-xs space-y-1 list-decimal list-inside">
                <li>Message @BotFather</li>
                <li>Create new bot</li>
                <li>Copy token</li>
              </ol>
            </div>
          </div>
          
          <CodeBlock code="# Add Telegram bot token to secrets\nsupabase secrets set TELEGRAM_BOT_TOKEN=your_bot_token" title="Telegram Setup" />
          
          <button onClick={() => markComplete(5)} className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg">
            Mark as Complete
          </button>
        </div>
      </WizardStep>

      <WizardStep
        number={6} title="Deploy Functions" description="Deploy all edge functions to Supabase"
        isOpen={openStep === 6} isCompleted={completedSteps.includes(6)} isActive={openStep === 6}
        onToggle={() => setOpenStep(openStep === 6 ? 0 : 6)} icon={<Play className="h-5 w-5 text-orange-400" />}
      >
        <div className="space-y-4">
          <CodeBlock code={`# Deploy all functions
supabase functions deploy scan-arbitrage-opportunities
supabase functions deploy price-alert-webhook
supabase functions deploy trading-signals

# Or deploy all at once
supabase functions deploy`} title="Deploy" />
          
          <button onClick={() => markComplete(6)} className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg">
            Mark as Complete
          </button>
        </div>
      </WizardStep>

      <WizardStep
        number={7} title="Test Deployment" description="Verify everything is working"
        isOpen={openStep === 7} isCompleted={completedSteps.includes(7)} isActive={openStep === 7}
        onToggle={() => setOpenStep(openStep === 7 ? 0 : 7)} icon={<CheckCircle className="h-5 w-5 text-emerald-400" />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={testEdgeFunction} 
              disabled={testStatus === 'testing'} 
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2"
            >
              {testStatus === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Test Connection
            </button>
            <button 
              onClick={runFullScan} 
              disabled={testStatus === 'testing'} 
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2"
            >
              {testStatus === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Full Scan
            </button>
            <button 
              onClick={testWebhooks} 
              disabled={webhookTestStatus === 'testing'} 
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg flex items-center gap-2"
            >
              {webhookTestStatus === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Test Webhooks
            </button>
          </div>
          
          {testResult && (
            <div className={`p-4 rounded-lg ${testStatus === 'success' ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              <div className="flex items-center gap-2 mb-2">
                {testStatus === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                )}
                <span className="text-white font-medium">
                  {testStatus === 'success' ? 'Success' : 'Error'}
                </span>
              </div>
              <pre className="text-sm text-gray-300 overflow-auto max-h-48">{JSON.stringify(testResult, null, 2)}</pre>
            </div>
          )}
          
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Manual test with curl:</p>
            <CodeBlock code={`curl -X POST 'https://${PROJECT_REF}.supabase.co/functions/v1/scan-arbitrage-opportunities' \\
  -H 'Authorization: Bearer ${ANON_KEY}' \\
  -H 'Content-Type: application/json' \\
  -d '{"test": true}'`} title="Test Command" />
          </div>
        </div>
      </WizardStep>

      {completedSteps.length === 7 && (
        <div className="p-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="h-8 w-8 text-green-400" />
            <h3 className="text-xl font-bold text-white">Deployment Complete!</h3>
          </div>
          <p className="text-gray-300">
            Your edge functions are now deployed and ready. The arbitrage scanner will scan for opportunities
            across Ethereum, Polygon, and Arbitrum networks using your Alchemy API key.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a 
              href={`https://supabase.com/dashboard/project/${PROJECT_REF}/functions`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" /> View Functions
            </a>
            <a 
              href={`https://supabase.com/dashboard/project/${PROJECT_REF}/logs/edge-functions`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2"
            >
              <Terminal className="h-4 w-4" /> View Logs
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
