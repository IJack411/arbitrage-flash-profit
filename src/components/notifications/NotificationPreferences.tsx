import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Volume2, Mail, Moon, DollarSign, Play } from 'lucide-react';
import { notificationService, NotificationPreferences as Prefs } from '@/lib/notificationService';
import { testSound } from '@/lib/notificationSounds';

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>(notificationService.getPreferences());
  const [pushStatus, setPushStatus] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) setPushStatus(Notification.permission);
  }, []);

  const updatePref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    notificationService.savePreferences({ [key]: value });
  };

  const requestPush = async () => {
    const granted = await notificationService.requestPushPermission();
    setPushStatus(granted ? 'granted' : 'denied');
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="w-5 h-5 text-cyan-400" /> Notification Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-400" />
            <Label>Push Notifications</Label>
          </div>
          <div className="flex items-center gap-2">
            {pushStatus !== 'granted' && (
              <Button size="sm" variant="outline" onClick={requestPush}>Enable</Button>
            )}
            <Switch checked={prefs.pushEnabled} onCheckedChange={v => updatePref('pushEnabled', v)} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-slate-400" />
            <Label>Sound Alerts</Label>
          </div>
          <Switch checked={prefs.soundEnabled} onCheckedChange={v => updatePref('soundEnabled', v)} />
        </div>

        {prefs.soundEnabled && (
          <div className="flex items-center gap-2 ml-6">
            <Select value={prefs.soundType} onValueChange={v => updatePref('soundType', v as Prefs['soundType'])}>
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chime">Chime</SelectItem>
                <SelectItem value="bell">Bell</SelectItem>
                <SelectItem value="alert">Alert</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => testSound(prefs.soundType)}>
              <Play className="w-3 h-3" />
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-400" />
            <Label>Email Notifications</Label>
          </div>
          <Switch checked={prefs.emailEnabled} onCheckedChange={v => updatePref('emailEnabled', v)} />
        </div>

        {prefs.emailEnabled && (
          <Input placeholder="email@example.com" value={prefs.emailAddress}
            onChange={e => updatePref('emailAddress', e.target.value)} className="ml-6 w-auto" />
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-slate-400" />
            <Label>Quiet Hours</Label>
          </div>
          <Switch checked={prefs.quietHoursEnabled} onCheckedChange={v => updatePref('quietHoursEnabled', v)} />
        </div>

        {prefs.quietHoursEnabled && (
          <div className="flex items-center gap-2 ml-6 text-sm">
            <Input type="number" min={0} max={23} value={prefs.quietHoursStart}
              onChange={e => updatePref('quietHoursStart', +e.target.value)} className="w-16 h-8" />
            <span>to</span>
            <Input type="number" min={0} max={23} value={prefs.quietHoursEnd}
              onChange={e => updatePref('quietHoursEnd', +e.target.value)} className="w-16 h-8" />
          </div>
        )}

        <div className="pt-2 border-t border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            <Label>Min Profit Threshold</Label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">$</span>
            <Input type="number" value={prefs.minProfitThreshold}
              onChange={e => updatePref('minProfitThreshold', +e.target.value)} className="w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
