import React, { useState } from 'react';
import { 
  Key, ExternalLink, Copy, Check, ChevronRight, 
  AlertCircle, CheckCircle2, Loader2, ArrowRight,
  MousePointer, Eye, Plus, Save, Shield
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface StepProps {
  number: number;
  title: string;
  description: string;
  isActive: boolean;
  isComplete: boolean;
  children: React.ReactNode;
}

const SetupStep: React.FC<StepProps> = ({ number, title, description, isActive, isComplete, children }) => (
  <div className={`relative border rounded-xl p-6 transition-all duration-300 ${
    isActive 
      ? 'border-cyan-500 bg-cyan-500/5 shadow-lg shadow-cyan-500/10' 
      : isComplete 
        ? 'border-green-500/50 bg-green-500/5' 
        : 'border-gray-700 bg-gray-800/50 opacity-60'
  }`}>
    <div className="flex items-start gap-4">
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
        isComplete 
          ? 'bg-green-500 text-white' 
          : isActive 
            ? 'bg-cyan-500 text-white' 
            : 'bg-gray-700 text-gray-400'
      }`}>
        {isComplete ? <Check className="h-5 w-5" /> : number}
      </div>
      <div className="flex-1">
        <h3 className={`text-lg font-semibold mb-1 ${isActive || isComplete ? 'text-white' : 'text-gray-400'}`}>
          {title}
        </h3>
        <p className="text-gray-400 text-sm mb-4">{description}</p>
        {(isActive || isComplete) && children}
      </div>
    </div>
  </div>
);

export const AlchemySecretSetup: React.FC = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [alchemyKey, setAlchemyKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const PROJECT_REF = 'ujhsrxinfcycjtulpvqk';
  const SUPABASE_SECRETS_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/settings/functions`;
  const ALCHEMY_DASHBOARD_URL = 'https://dashboard.alchemy.com/apps';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ 
      title: 'Copied!', 
      description: `${label} copied to clipboard. Now paste it in Supabase.` 
    });
  };

  const markStepComplete = (step: number) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps([...completedSteps, step]);
    }
    setCurrentStep(step + 1);
  };

  const testConnection = async () => {
    setTestStatus('testing');
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: { test: true }
      });
      
      if (error) throw error;
      
      setTestStatus('success');
      markStepComplete(4);
      toast({ 
        title: 'Connection Successful!', 
        description: 'Your Alchemy API key is working correctly.' 
      });
    } catch (err: unknown) {
      setTestStatus('error');
      toast({ 
        title: 'Connection Failed', 
        description: `The edge function could not connect. ${getErrorMessage(err)}`,
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 mb-4">
          <Key className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Add Your Alchemy API Key</h1>
        <p className="text-gray-400 max-w-xl mx-auto">
          Follow these simple steps to connect your Alchemy API key to Supabase Edge Functions. 
          No coding required - just click, copy, and paste!
        </p>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center justify-between mb-8 px-4">
        {[1, 2, 3, 4].map((step, idx) => (
          <React.Fragment key={step}>
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
              completedSteps.includes(step) 
                ? 'bg-green-500 text-white' 
                : currentStep === step 
                  ? 'bg-cyan-500 text-white' 
                  : 'bg-gray-700 text-gray-400'
            }`}>
              {completedSteps.includes(step) ? <Check className="h-4 w-4" /> : step}
            </div>
            {idx < 3 && (
              <div className={`flex-1 h-1 mx-2 rounded ${
                completedSteps.includes(step) ? 'bg-green-500' : 'bg-gray-700'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {/* Step 1: Get Alchemy API Key */}
        <SetupStep
          number={1}
          title="Get Your Free Alchemy API Key"
          description="Create a free Alchemy account and get your API key"
          isActive={currentStep === 1}
          isComplete={completedSteps.includes(1)}
        >
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MousePointer className="h-3 w-3 text-cyan-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Click the button below to open Alchemy Dashboard</p>
                  <p className="text-gray-400 text-sm">Sign up for free if you don't have an account</p>
                </div>
              </div>
              
              <Button 
                onClick={() => window.open(ALCHEMY_DASHBOARD_URL, '_blank')}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-6 text-lg"
              >
                <ExternalLink className="h-5 w-5 mr-2" />
                Open Alchemy Dashboard
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>

            <Alert className="bg-yellow-500/10 border-yellow-500/30">
              <AlertCircle className="h-4 w-4 text-yellow-400" />
              <AlertDescription className="text-yellow-200">
                <strong>In Alchemy Dashboard:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                  <li>Click "Create new app" (or use an existing one)</li>
                  <li>Select "Ethereum" as the chain</li>
                  <li>Click on your app, then click "API Key"</li>
                  <li>Copy the API key (looks like: abc123xyz...)</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-white font-medium">Paste your Alchemy API Key here:</label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={alchemyKey}
                  onChange={(e) => setAlchemyKey(e.target.value)}
                  placeholder="Paste your API key here..."
                  className="pr-20 py-6 text-lg font-mono"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  {showKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>

            <Button 
              onClick={() => markStepComplete(1)}
              disabled={!alchemyKey || alchemyKey.length < 10}
              className="w-full bg-cyan-500 hover:bg-cyan-600 py-6 text-lg"
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              I Have My API Key - Continue
              <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </SetupStep>

        {/* Step 2: Open Supabase Secrets */}
        <SetupStep
          number={2}
          title="Open Supabase Secrets Page"
          description="Go to your Supabase project's Edge Function secrets"
          isActive={currentStep === 2}
          isComplete={completedSteps.includes(2)}
        >
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MousePointer className="h-3 w-3 text-green-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Click to open Supabase Edge Functions settings</p>
                  <p className="text-gray-400 text-sm">This will open in a new tab</p>
                </div>
              </div>
              
              <Button 
                onClick={() => window.open(SUPABASE_SECRETS_URL, '_blank')}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-6 text-lg"
              >
                <ExternalLink className="h-5 w-5 mr-2" />
                Open Supabase Dashboard
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>

            <Alert className="bg-purple-500/10 border-purple-500/30">
              <Shield className="h-4 w-4 text-purple-400" />
              <AlertDescription className="text-purple-200">
                <strong>In Supabase Dashboard:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                  <li>Look for "Edge Function Secrets" section</li>
                  <li>Click "Add new secret" or "Manage secrets"</li>
                  <li>You'll add your API key in the next step</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Button 
              onClick={() => markStepComplete(2)}
              className="w-full bg-cyan-500 hover:bg-cyan-600 py-6 text-lg"
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              I'm on the Supabase Secrets Page
              <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </SetupStep>

        {/* Step 3: Add the Secret */}
        <SetupStep
          number={3}
          title="Add ALCHEMY_API_KEY Secret"
          description="Create the secret with your API key"
          isActive={currentStep === 3}
          isComplete={completedSteps.includes(3)}
        >
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <p className="text-white font-medium mb-4 flex items-center gap-2">
                <Plus className="h-5 w-5 text-cyan-400" />
                Copy these values and paste them in Supabase:
              </p>
              
              <div className="space-y-4">
                {/* Secret Name */}
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Secret Name (copy exactly):</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard('ALCHEMY_API_KEY', 'Secret name')}
                      className="h-8"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <code className="text-xl font-mono text-cyan-400 block">ALCHEMY_API_KEY</code>
                </div>

                {/* Secret Value */}
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">Secret Value (your API key):</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(alchemyKey, 'API key')}
                      className="h-8"
                      disabled={!alchemyKey}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <code className="text-xl font-mono text-green-400 block break-all">
                    {alchemyKey ? (showKey ? alchemyKey : '••••••••••••••••••••') : 'Enter your key in Step 1'}
                  </code>
                </div>
              </div>
            </div>

            <Alert className="bg-blue-500/10 border-blue-500/30">
              <Save className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-200">
                <strong>In Supabase:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                  <li>Paste <code className="bg-gray-800 px-1 rounded">ALCHEMY_API_KEY</code> in the "Name" field</li>
                  <li>Paste your API key in the "Value" field</li>
                  <li>Click "Save" or "Add secret"</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Button 
              onClick={() => markStepComplete(3)}
              className="w-full bg-cyan-500 hover:bg-cyan-600 py-6 text-lg"
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              I've Saved the Secret in Supabase
              <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </SetupStep>

        {/* Step 4: Test Connection */}
        <SetupStep
          number={4}
          title="Test Your Connection"
          description="Verify everything is working correctly"
          isActive={currentStep === 4}
          isComplete={completedSteps.includes(4)}
        >
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <p className="text-white font-medium mb-4">
                Click the button below to test if your API key is working:
              </p>
              
              <Button 
                onClick={testConnection}
                disabled={testStatus === 'testing'}
                className={`w-full py-6 text-lg ${
                  testStatus === 'success' 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : testStatus === 'error'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'
                }`}
              >
                {testStatus === 'testing' ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Testing Connection...
                  </>
                ) : testStatus === 'success' ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Connection Successful!
                  </>
                ) : testStatus === 'error' ? (
                  <>
                    <AlertCircle className="h-5 w-5 mr-2" />
                    Test Failed - Click to Retry
                  </>
                ) : (
                  <>
                    <Key className="h-5 w-5 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>
            </div>

            {testStatus === 'error' && (
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-200">
                  <strong>Connection failed.</strong> Please check:
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                    <li>The secret name is exactly <code className="bg-gray-800 px-1 rounded">ALCHEMY_API_KEY</code></li>
                    <li>Your API key is correct (no extra spaces)</li>
                    <li>The edge function is deployed</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {testStatus === 'success' && (
              <Alert className="bg-green-500/10 border-green-500/30">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-200">
                  <strong>Congratulations!</strong> Your Alchemy API key is now connected to your Supabase Edge Functions. 
                  The arbitrage bot can now access blockchain data!
                </AlertDescription>
              </Alert>
            )}
          </div>
        </SetupStep>
      </div>

      {/* Success Message */}
      {completedSteps.length === 4 && (
        <Card className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500 mb-4">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Setup Complete!</h2>
              <p className="text-gray-300 mb-4">
                Your Alchemy API key is now configured. Your arbitrage bot can access blockchain data 
                across Ethereum, Polygon, Arbitrum, and other networks.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button 
                  onClick={() => window.location.href = '/'}
                  className="bg-green-500 hover:bg-green-600"
                >
                  Go to Dashboard
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => window.open(`https://supabase.com/dashboard/project/${PROJECT_REF}/logs/edge-functions`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Function Logs
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
            Need Help?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-gray-300">
            <span className="text-cyan-400">•</span>
            <span>Alchemy offers a free tier with 300M compute units/month</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <span className="text-cyan-400">•</span>
            <span>Your API key is stored securely in Supabase and never exposed</span>
          </div>
          <div className="flex items-center gap-3 text-gray-300">
            <span className="text-cyan-400">•</span>
            <span>The edge functions use your key for RPC calls to blockchain networks</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AlchemySecretSetup;
