import { ethers } from 'ethers';

export class TransactionService {
  private provider: ethers.BrowserProvider;
  private signer: ethers.Signer;

  constructor(provider: ethers.BrowserProvider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
  }

  async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
    return await this.provider.estimateGas(tx);
  }

  async getCurrentGasPrice(): Promise<string> {
    const feeData = await this.provider.getFeeData();
    return ethers.formatUnits(feeData.gasPrice || 0n, 'gwei');
  }

  async sendTransaction(
    to: string,
    data: string,
    value: string = '0'
  ): Promise<ethers.TransactionResponse> {
    const tx = {
      to,
      data,
      value: ethers.parseEther(value),
    };

    const gasEstimate = await this.estimateGas(tx);
    const feeData = await this.provider.getFeeData();

    const txWithGas = {
      ...tx,
      gasLimit: gasEstimate * 120n / 100n, // 20% buffer
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    };

    return await this.signer.sendTransaction(txWithGas);
  }

  async waitForTransaction(txHash: string): Promise<ethers.TransactionReceipt | null> {
    return await this.provider.waitForTransaction(txHash);
  }
}
