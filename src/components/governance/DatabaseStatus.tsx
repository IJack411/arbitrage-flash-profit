import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Database, CheckCircle, XCircle, AlertTriangle, ExternalLink, Copy, Check } from 'lucide-react';
import { isSupabaseConfigured, checkConnection, getConfigStatus } from '@/lib/supabase';

export const DatabaseStatus: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected' | 'not-configured'>('checking');
  const [copied, setCopied] = useState(false);
  const configStatus = getConfigStatus();

  useEffect(() => {
    const check = async () => {
      if (!isSupabaseConfigured()) {
        setStatus('not-configured');
        return;
      }
      const connected = await checkConnection();
      setStatus(connected ? 'connected' : 'disconnected');
    };
    check();
  }, []);

  const copyEnvExample = () => {
    const envContent = `VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here`;
    navigator.clipboard.writeText(envContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Connection
        </CardTitle>
        <CardDescription>Supabase connection status for persistent audit storage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          {status === 'checking' && <Badge variant="outline">Checking...</Badge>}
          {status === 'connected' && (
            <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>
          )}
          {status === 'disconnected' && (
            <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Disconnected</Badge>
          )}
          {status === 'not-configured' && (
            <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Not Configured</Badge>
          )}
        </div>

        {status === 'not-configured' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Supabase Not Configured</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>Using localStorage fallback. To enable persistent storage:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Create a Supabase project at supabase.com</li>
                <li>Copy .env.example to .env</li>
                <li>Add your credentials from Settings → API</li>
                <li>Run the migration in SQL Editor</li>
                <li>Restart the dev server</li>
              </ol>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={copyEnvExample}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? 'Copied!' : 'Copy .env template'}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />Supabase Dashboard
                  </a>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {status === 'connected' && (
          <p className="text-sm text-muted-foreground">
            Audit logs are being stored persistently in Supabase.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
