
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface EvaluationLog {
  id: string;
  timestamp: number;
  ruleName: string;
  ruleId: string;
  triggered: boolean;
  reason?: string;
  values?: Record<string, number>;
}

interface Props {
  logs: EvaluationLog[];
}

export const RuleEvaluationLog: React.FC<Props> = ({ logs }) => {
  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="w-5 h-5 text-blue-400" />
          Evaluation Log
          <Badge variant="outline" className="ml-auto">{logs.length} entries</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[250px]">
          <div className="space-y-1 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No evaluations yet. Start the engine to see logs.
              </div>
            ) : (
              logs.slice(0, 50).map(log => (
                <div 
                  key={log.id} 
                  className={`flex items-center gap-2 p-2 rounded ${
                    log.triggered ? 'bg-orange-500/10 border-l-2 border-orange-500' : 'bg-gray-800/30'
                  }`}
                >
                  <span className="text-gray-500 w-20">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  {log.triggered ? (
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-gray-500" />
                  )}
                  <span className={log.triggered ? 'text-orange-300' : 'text-gray-400'}>
                    {log.ruleName}
                  </span>
                  {log.triggered && (
                    <Badge className="bg-orange-500/20 text-orange-400 text-xs">TRIGGERED</Badge>
                  )}
                  {log.values && (
                    <span className="text-gray-500 ml-auto">
                      {Object.entries(log.values).map(([k, v]) => `${k}=${v}`).join(', ')}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
