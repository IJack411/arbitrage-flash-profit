import { ethers } from 'ethers';
import { FLASH_LOAN_PROVIDERS, getContractAddresses } from './config';

const AAVE_POOL_ABI = [
  'function flashLoan(address receiverAddress, address[] assets, uint256[] amounts, uint256[] modes, address onBehalfOf, bytes params, uint16 referralCode)',
  'function FLASHLOAN_PREMIUM_TOTAL() view returns (uint256)',
];

export class FlashLoanService {
  private provider: ethers.BrowserProvider;
  private signer: ethers.Signer;

  constructor(provider: ethers.BrowserProvider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
  }

  async executeAaveFlashLoan(
    token: string,
    amount: string,
    receiverContract?: string
  ): Promise<ethers.TransactionResponse> {
    // Use the configured contract addresses if no receiver is passed
    const addresses = getContractAddresses();
    const receiver = receiverContract || addresses.arbitrageContract;
    const poolAddress = addresses.flashLoanProvider || FLASH_LOAN_PROVIDERS.aave.ethereum;

    if (!receiver) {
      throw new Error('No receiver contract address configured. Go to the Contracts tab and enter your deployed contract address.');
    }

    if (!poolAddress) {
      throw new Error('No flash loan provider address configured. Go to the Contracts tab and enter your provider address.');
    }
    
    const pool = new ethers.Contract(poolAddress, AAVE_POOL_ABI, this.signer);
    
    const tx = await pool.flashLoan(
      receiver,
      [token],
      [ethers.parseUnits(amount, 18)],
      [0],
      await this.signer.getAddress(),
      '0x',
      0
    );
    
    return tx;
  }

  async estimateFlashLoanCost(amount: string): Promise<string> {
    return (parseFloat(amount) * 0.0009).toFixed(4); // 0.09% Aave fee
  }
}
