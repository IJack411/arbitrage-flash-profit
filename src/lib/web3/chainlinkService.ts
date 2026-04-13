// Chainlink Oracle Price Feed Service
import { ethers } from 'ethers';

// Chainlink Price Feed ABI (minimal)
const CHAINLINK_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
];

// Chainlink Price Feed Addresses (Ethereum Mainnet)
export const CHAINLINK_FEEDS: Record<string, Record<string, string>> = {
  ethereum: {
    'ETH/USD': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    'BTC/USD': '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    'LINK/USD': '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c',
    'USDC/USD': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
    'DAI/USD': '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
    'AAVE/USD': '0x547a514d5e3769680Ce22B2361c10Ea13619e8a9',
    'UNI/USD': '0x553303d460EE0afB37EdFf9bE42922D8FF63220e',
  },
  polygon: {
    'ETH/USD': '0xF9680D99D6C9589e2a93a78A04A279e509205945',
    'BTC/USD': '0xc907E116054Ad103354f2D350FD2514433D57F6f',
    'MATIC/USD': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
    'LINK/USD': '0xd9FFdb71EbE7496cC440152d43986Aae0AB76665',
  },
  arbitrum: {
    'ETH/USD': '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
    'BTC/USD': '0x6ce185860a4963106506C203335A2910E5B5C7A3',
    'LINK/USD': '0x86E53CF1B870786351Da77A57575e79CB55812CB',
  },
  bsc: {
    'ETH/USD': '0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e',
    'BTC/USD': '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf',
    'BNB/USD': '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
  },
};

export interface ChainlinkPrice {
  pair: string;
  price: number;
  decimals: number;
  updatedAt: number;
  roundId: string;
  source: 'chainlink';
}

export class ChainlinkService {
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();

  constructor() {
    this.initProviders();
  }

  private initProviders() {
    const rpcs: Record<string, string> = {
      ethereum: 'https://eth.llamarpc.com',
      polygon: 'https://polygon-rpc.com',
      arbitrum: 'https://arb1.arbitrum.io/rpc',
      bsc: 'https://bsc-dataseed1.binance.org',
    };
    Object.entries(rpcs).forEach(([network, rpc]) => {
      this.providers.set(network, new ethers.JsonRpcProvider(rpc));
    });
  }

  async getPrice(network: string, pair: string): Promise<ChainlinkPrice | null> {
    const feedAddress = CHAINLINK_FEEDS[network]?.[pair];
    const provider = this.providers.get(network);
    if (!feedAddress || !provider) return null;

    try {
      const contract = new ethers.Contract(feedAddress, CHAINLINK_ABI, provider);
      const [roundData, decimals] = await Promise.all([
        contract.latestRoundData(),
        contract.decimals(),
      ]);
      const price = Number(roundData.answer) / Math.pow(10, Number(decimals));
      return {
        pair, price, decimals: Number(decimals),
        updatedAt: Number(roundData.updatedAt) * 1000,
        roundId: roundData.roundId.toString(),
        source: 'chainlink',
      };
    } catch (e) {
      console.error(`Chainlink fetch error for ${pair}:`, e);
      return null;
    }
  }

  async getAllPrices(network: string): Promise<ChainlinkPrice[]> {
    const feeds = CHAINLINK_FEEDS[network] || {};
    const results = await Promise.all(
      Object.keys(feeds).map(pair => this.getPrice(network, pair))
    );
    return results.filter((p): p is ChainlinkPrice => p !== null);
  }
}

export const chainlinkService = new ChainlinkService();
