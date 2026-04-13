import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Eye, Shield, RefreshCw, Users } from 'lucide-react';
import { detectCompetingBundles, generateMockMempool, DetectionResult } from '@/lib/web3/mevDetection';

interface Props {
  targetAddresses: string[];
  onDetectionUpdate: (result: DetectionResult) => void;
}

const riskColors = {
  low: { bg: 'bg-green-400/10', text: 'text-green-400', border: 'border-green-400/30' },
  medium: { bg: 'bg-yellow-400/10', text: 'text-yellow-400', border: 'border-yellow-400/30' },
  high: { bg: 'bg-orange-400/10', text: 'text-orange-400', border: 'border-orange-400/30' },
  critical: { bg: 'bg-red-400/10', text: 'text-red-400', border: 'border-red-400/30' },
};

export const CompetingBundleDetector: React.FC<Props> = ({ targetAddresses, onDetectionUpdate }) => {
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);

  const scanMempool = useCallback(async () => {
    setIsScanning(true);
    await new Promise(r => setTimeout(r, 800));
    const mempool = generateMockMempool(30);
    const result = detectCompetingBundles(targetAddresses, mempool);
    setDetection(result);
    onDetectionUpdate(result);
    setIsScanning(false);
  }, [targetAddresses, onDetectionUpdate]);

  useEffect(() => {
    if (autoScan) {
      const interval = setInterval(scanMempool, 5000);
      return () => clearInterval(interval);
    }
  }, [autoScan, scanMempool]);

  const colors = detection ? riskColors[detection.riskLevel] : riskColors.low;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-[#00F0FF]" />
          <h3 className="text-white font-semibold">Competing Bundle Detection</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoScan(!autoScan)}
            className={`px-3 py-1 rounded text-xs ${autoScan ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
            {autoScan ? 'Auto ON' : 'Auto OFF'}
          </button>
          <button onClick={scanMempool} disabled={isScanning}
            title="Scan mempool now"
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 text-gray-300 ${isScanning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {detection && (
        <>
          <div className={`${colors.bg} ${colors.border} border rounded-lg p-3 mb-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${colors.text}`} />
                <span className={`font-semibold ${colors.text} capitalize`}>{detection.riskLevel} Risk</span>
              </div>
              <div className="flex items-center gap-1 text-gray-400">
                <Users className="h-4 w-4" />
                <span className="text-sm">{detection.competitors.length}</span>
              </div>
            </div>
            <p className="text-gray-300 text-sm mt-2">{detection.recommendedAction}</p>
          </div>

          {detection.competitors.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {detection.competitors.slice(0, 4).map((comp, i) => (
                <div key={i} className="bg-gray-900 rounded p-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-mono text-xs">{comp.bundleHash.slice(0, 14)}...</span>
                    <span className="text-yellow-400 text-xs">{(comp.probability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between mt-1 text-xs">
                    <span className="text-gray-500">Bribe: ${comp.estimatedBribe.toFixed(4)}</span>
                    <span className="text-gray-500">{comp.txSignatures.length} txs</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!detection && (
        <div className="text-center py-6 text-gray-400">
          <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Scan mempool to detect competitors</p>
        </div>
      )}
    </div>
  );
};
