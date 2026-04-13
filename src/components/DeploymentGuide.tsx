import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, ExternalLink, Terminal, Database, Cloud, Wallet } from 'lucide-react';

interface StepProps {
  number: number;
  title: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}

const Step: React.FC<StepProps> = ({ number, title, children, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-750 transition-colors">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 font-bold">{number}</span>
        <span className="text-white font-medium flex-1 text-left">{title}</span>
        {icon}
        {isOpen ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
      </button>
      {isOpen && <div className="p-4 bg-gray-900 border-t border-gray-700">{children}</div>}
    </div>
  );
};

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative bg-gray-950 rounded-lg p-3 mt-2">
      <pre className="text-green-400 text-sm overflow-x-auto">{code}</pre>
      <button onClick={copy} className="absolute top-2 right-2 p-1 hover:bg-gray-800 rounded">
        {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-gray-500" />}
      </button>
    </div>
  );
};

export const DeploymentGuide: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-bold text-white mb-2">Quick Start Guide</h3>
        <p className="text-gray-400 text-sm">Follow these steps to deploy your arbitrage bot with real blockchain data.</p>
      </div>

      <Step number={1} title="Set Up Supabase Project" icon={<Database className="h-5 w-5 text-cyan-400" />}>
        <ol className="space-y-3 text-gray-300 text-sm">
          <li>1. Go to <a href="https://supabase.com" target="_blank" className="text-cyan-400 hover:underline">supabase.com</a> and create an account</li>
          <li>2. Click "New Project" and wait for initialization</li>
          <li>3. Go to Settings → API and copy your credentials</li>
        </ol>
        <CodeBlock code={`VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...`} />
      </Step>

      <Step number={2} title="Run Database Migrations" icon={<Database className="h-5 w-5 text-purple-400" />}>
        <p className="text-gray-300 text-sm mb-2">In Supabase Dashboard → SQL Editor, run:</p>
        <CodeBlock code={`-- Run file: supabase/migrations/002_create_arbitrage_tables.sql`} />
      </Step>

      <Step number={3} title="Deploy Edge Functions" icon={<Cloud className="h-5 w-5 text-green-400" />}>
        <p className="text-gray-300 text-sm mb-2">Install Supabase CLI and deploy:</p>
        <CodeBlock code={`npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy scan-arbitrage-opportunities`} />
      </Step>

      <Step number={4} title="Add API Keys" icon={<Terminal className="h-5 w-5 text-yellow-400" />}>
        <p className="text-gray-300 text-sm mb-2">Add secrets in Supabase Dashboard → Edge Functions → Secrets:</p>
        <CodeBlock code={`INFURA_API_KEY=your_infura_key
ALCHEMY_API_KEY=your_alchemy_key`} />
      </Step>

      <Step number={5} title="Connect Wallet & Test" icon={<Wallet className="h-5 w-5 text-orange-400" />}>
        <ol className="space-y-2 text-gray-300 text-sm">
          <li>1. Connect MetaMask wallet</li>
          <li>2. Start with Simulation mode</li>
          <li>3. Run a manual scan to test</li>
          <li>4. Switch to Live mode when ready</li>
        </ol>
      </Step>
    </div>
  );
};
