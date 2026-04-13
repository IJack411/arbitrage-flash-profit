import React from 'react';
import { Globe, Check } from 'lucide-react';

interface Network {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const NETWORKS: Network[] = [
  { id: 'ethereum', name: 'Ethereum', icon: 'Ξ', color: '#627EEA' },
  { id: 'polygon', name: 'Polygon', icon: '⬡', color: '#8247E5' },
  { id: 'arbitrum', name: 'Arbitrum', icon: '◆', color: '#28A0F0' },
  { id: 'bsc', name: 'BSC', icon: '◈', color: '#F0B90B' },
];

interface NetworkSelectorProps {
  selectedNetworks: string[];
  onNetworksChange: (networks: string[]) => void;
}

export const NetworkSelector: React.FC<NetworkSelectorProps> = ({
  selectedNetworks,
  onNetworksChange,
}) => {
  const toggleNetwork = (networkId: string) => {
    if (selectedNetworks.includes(networkId)) {
      if (selectedNetworks.length > 1) {
        onNetworksChange(selectedNetworks.filter(n => n !== networkId));
      }
    } else {
      onNetworksChange([...selectedNetworks, networkId]);
    }
  };

  const selectAll = () => onNetworksChange(NETWORKS.map(n => n.id));

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-[#00F0FF]" />
          <h3 className="text-white font-semibold">Networks to Scan</h3>
        </div>
        <button
          onClick={selectAll}
          className="text-xs text-[#00F0FF] hover:text-[#00D0E0]"
        >
          Select All
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {NETWORKS.map(network => (
          <button
            key={network.id}
            onClick={() => toggleNetwork(network.id)}
            className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
              selectedNetworks.includes(network.id)
                ? 'border-[#00F0FF] bg-[#00F0FF]/10'
                : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
            }`}
          >
            <span style={{ color: network.color }} className="text-xl font-bold">
              {network.icon}
            </span>
            <span className="text-white text-sm font-medium">{network.name}</span>
            {selectedNetworks.includes(network.id) && (
              <Check className="h-4 w-4 text-[#00F0FF] ml-auto" />
            )}
          </button>
        ))}
      </div>
      <p className="text-gray-400 text-xs mt-2">
        Selected: {selectedNetworks.length} network{selectedNetworks.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
};
