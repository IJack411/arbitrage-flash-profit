import React, { useState, useEffect, useCallback } from 'react';
import { webhookService, Webhook, WebhookDelivery } from '@/lib/webhookService';
import { WebhookCard } from './WebhookCard';
import { WebhookConfigForm } from './WebhookConfigForm';
import { WebhookDeliveryHistory } from './WebhookDeliveryHistory';
import { useWeb3 } from '@/contexts/Web3Context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Webhook as WebhookIcon, RefreshCw, AlertCircle } from 'lucide-react';

export const WebhookManager: React.FC = () => {
  const { account } = useWeb3();
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | undefined>();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [historyWebhook, setHistoryWebhook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const loadWebhooks = useCallback(async () => {
    if (!account) return;
    try {
      setLoading(true);
      const data = await webhookService.getWebhooks(account);
      setWebhooks(data);
    } catch (err: unknown) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [account, toast]);

  useEffect(() => { void loadWebhooks(); }, [loadWebhooks]);

  const handleSave = async (data: Partial<Webhook>) => {
    try {
      if (editingWebhook) {
        await webhookService.updateWebhook(editingWebhook.id, data);
        toast({ title: 'Updated', description: 'Webhook updated successfully' });
      } else {
        await webhookService.createWebhook({ ...data, user_id: account! });
        toast({ title: 'Created', description: 'Webhook created successfully' });
      }
      setShowForm(false);
      setEditingWebhook(undefined);
      loadWebhooks();
    } catch (err: unknown) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    try {
      await webhookService.deleteWebhook(id);
      toast({ title: 'Deleted', description: 'Webhook removed' });
      loadWebhooks();
    } catch (err: unknown) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const handleTest = async (webhook: Webhook) => {
    setTestingId(webhook.id);
    try {
      const result = await webhookService.testWebhook(webhook);
      toast({
        title: result.success ? 'Test Successful' : 'Test Failed',
        description: result.message,
        variant: result.success ? 'default' : 'destructive'
      });
    } catch (err: unknown) {
      toast({ title: 'Test Failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (webhook: Webhook, active: boolean) => {
    try {
      await webhookService.updateWebhook(webhook.id, { is_active: active });
      loadWebhooks();
    } catch (err: unknown) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const viewHistory = async (webhook: Webhook) => {
    setHistoryWebhook(webhook);
    setLoadingHistory(true);
    try {
      const data = await webhookService.getDeliveryHistory(webhook.id);
      setDeliveries(data);
    } catch (err: unknown) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!account) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
        <AlertCircle className="h-12 w-12 text-gray-500 mx-auto mb-4" />
        <h3 className="text-white font-semibold mb-2">Connect Wallet</h3>
        <p className="text-gray-400">Connect your wallet to manage webhooks</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <WebhookIcon className="h-7 w-7 text-cyan-400" />
            Webhook Notifications
          </h2>
          <p className="text-gray-400 mt-1">Send alerts to Discord, Slack, Telegram, or custom APIs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadWebhooks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button onClick={() => { setEditingWebhook(undefined); setShowForm(true); }} className="bg-cyan-500 hover:bg-cyan-600">
            <Plus className="h-4 w-4 mr-2" /> Add Webhook
          </Button>
        </div>
      </div>

      {webhooks.length === 0 && !loading ? (
        <div className="bg-gray-800 border border-dashed border-gray-600 rounded-xl p-12 text-center">
          <WebhookIcon className="h-16 w-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-white font-semibold text-lg mb-2">No Webhooks Configured</h3>
          <p className="text-gray-400 mb-6">Set up webhooks to receive real-time alerts</p>
          <Button onClick={() => setShowForm(true)} className="bg-cyan-500 hover:bg-cyan-600">
            <Plus className="h-4 w-4 mr-2" /> Create First Webhook
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {webhooks.map(wh => (
            <WebhookCard key={wh.id} webhook={wh} onEdit={() => { setEditingWebhook(wh); setShowForm(true); }}
              onDelete={() => handleDelete(wh.id)} onTest={() => handleTest(wh)}
              onToggle={(active) => handleToggle(wh, active)} onViewHistory={() => viewHistory(wh)}
              isTesting={testingId === wh.id} />
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">{editingWebhook ? 'Edit Webhook' : 'New Webhook'}</DialogTitle>
          </DialogHeader>
          <WebhookConfigForm webhook={editingWebhook} onSave={handleSave} onCancel={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyWebhook} onOpenChange={() => setHistoryWebhook(null)}>
        <DialogContent className="max-w-lg bg-gray-800 border-gray-700 p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-white">Delivery History - {historyWebhook?.name}</DialogTitle>
          </DialogHeader>
          {historyWebhook && (
            <WebhookDeliveryHistory deliveries={deliveries} webhookName={historyWebhook.name}
              onClose={() => setHistoryWebhook(null)} isLoading={loadingHistory} />
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};
