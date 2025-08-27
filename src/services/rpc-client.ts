import axios, { AxiosInstance } from "axios";
import { RPCResponse, RPCError, RawBlock } from "../types/bitcoin";

export class BitcoinRPCClient {
  private client: AxiosInstance;
  private requestId = 0;

  constructor(private rpcUrl: string) {
    this.client = axios.create({
      baseURL: this.rpcUrl,
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async callRPC<T>(
    method: string,
    params: any[] = [],
    retries = 3
  ): Promise<T> {
    const requestId = (++this.requestId).toString();
    const payload = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.client.post<RPCResponse<T>>("", payload);

        if (response.data.error) {
          throw new Error(`RPC Error: ${response.data.error.message}`);
        }

        return response.data.result;
      } catch (error) {
        const isLastAttempt = attempt === retries;

        if (isLastAttempt) {
          throw error;
        }

        const delay = Math.pow(2, attempt) * 1000;
        console.warn(
          `RPC call failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`,
          error
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error("All RPC retry attempts failed");
  }

  async getBlockchainInfo(): Promise<{
    blocks: number;
    headers: number;
    bestblockhash: string;
    difficulty: number;
    mediantime: number;
    verificationprogress: number;
    chainwork: string;
    size_on_disk: number;
    warnings: string;
  }> {
    return this.callRPC("getblockchaininfo");
  }

  async getBlockHash(height: number): Promise<string> {
    return this.callRPC("getblockhash", [height]);
  }

  async getBlock(blockHash: string): Promise<RawBlock> {
    return this.callRPC("getblock", [blockHash, 2]);
  }

  async getRawTransaction(txid: string): Promise<any> {
    return this.callRPC("getrawtransaction", [txid, true]);
  }

  async ping(): Promise<void> {
    await this.callRPC("ping");
  }
}
