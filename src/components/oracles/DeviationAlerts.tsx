import React from 'react';
import { AlertTriangle, Bell, CheckCircle, X, Clock } from 'lucide-react';
import { DeviationAlert } from '@/types/oracle';

interface Props {
  alerts: DeviationAlert[];
  onDismiss: (id: string) => void;
  onResolve: (id: string) => void;
}

const severityConfig = {
  info: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  warning: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

export const DeviationAlerts: React.FC<Props> = ({ alerts, onDismiss, onResolve }) => {
  const activeAlerts = alerts.filter(a => !a.resolved);
  const resolvedAlerts = alerts.filter(a => a.resolved).slice(0, 5);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#00F0FF]" />
          Deviation Alerts
        </h3>
        {activeAlerts.length > 0 && (
          <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
            {activeAlerts.length} Active
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {activeAlerts.map((alert) => {
          const config = severityConfig[alert.severity];
          return (
            <div key={alert.id} className={`${config.bg} ${config.border} border rounded-lg p-3`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`h-5 w-5 ${config.color} mt-0.5`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{alert.pair}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-gray-400 text-sm mt-1">
                      {alert.sourceA}: ${alert.priceA.toFixed(2)} vs {alert.sourceB}: ${alert.priceB.toFixed(2)}
                    </div>
                    <div className={`${config.color} text-sm font-medium mt-1`}>
                      Deviation: {alert.deviationPercent.toFixed(3)}%
                    </div>
                    <div className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(alert.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => onResolve(alert.id)} className="p-1 hover:bg-gray-700 rounded" title="Resolve">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </button>
                  <button onClick={() => onDismiss(alert.id)} className="p-1 hover:bg-gray-700 rounded" title="Dismiss">
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {activeAlerts.length === 0 && (
          <div className="text-center py-6 text-gray-500">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400/50" />
            No active deviation alerts
          </div>
        )}

        {resolvedAlerts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h4 className="text-gray-400 text-sm mb-2">Recently Resolved</h4>
            {resolvedAlerts.map((alert) => (
              <div key={alert.id} className="bg-gray-900/50 rounded p-2 mb-1 opacity-60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{alert.pair} - {alert.deviationPercent.toFixed(2)}%</span>
                  <span className="text-gray-500">{new Date(alert.resolvedAt!).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
