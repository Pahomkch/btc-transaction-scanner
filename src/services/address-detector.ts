import {
  Transaction,
  WatchedAddresses,
  AddressInvolvement,
  TransactionInput,
  TransactionOutput,
  AddressType,
} from "../types/bitcoin";
import { BlockParser } from "./block-parser";

export class AddressDetector {
  private watchedAddresses: Set<string>;
  private addressNames: Map<string, string>;
  private blockParser: BlockParser;

  constructor(addresses: WatchedAddresses, private rpcClient?: any) {
    this.watchedAddresses = new Set(Object.keys(addresses));
    this.addressNames = new Map(Object.entries(addresses));
    this.blockParser = new BlockParser();
  }

  updateWatchedAddresses(addresses: WatchedAddresses): void {
    this.watchedAddresses = new Set(Object.keys(addresses));
    this.addressNames = new Map(Object.entries(addresses));
  }

  async detectAddressesInTransaction(transaction: Transaction): Promise<{
    hasWatchedAddress: boolean;
    addressInvolvements: AddressInvolvement[];
    transactionType: "incoming" | "outgoing" | "both" | "none";
    allAddresses: { senders: string[]; receivers: string[] };
  }> {
    const addressInvolvements: AddressInvolvement[] = [];
    const { inputs, outputs } =
      this.blockParser.extractAddressesFromTransaction(transaction);

    await this.processAddresses(
      outputs,
      transaction.vout,
      "output",
      addressInvolvements
    );

    const hasWatchedOutputs = addressInvolvements.length > 0;
    if (hasWatchedOutputs) {
      await this.processAddresses(
        inputs,
        transaction.vin,
        "input",
        addressInvolvements
      );
    }

    const hasWatchedAddress = addressInvolvements.length > 0;
    const transactionType = this.determineTransactionType(addressInvolvements);

    const allAddresses = {
      senders: inputs.filter(addr => addr && addr.length > 10),
      receivers: outputs.filter(addr => addr && addr.length > 10)
    };

    return {
      hasWatchedAddress,
      addressInvolvements,
      transactionType,
      allAddresses,
    };
  }

  private async processAddresses(
    addresses: string[],
    transactionParts: TransactionInput[] | TransactionOutput[],
    direction: "input" | "output",
    addressInvolvements: AddressInvolvement[]
  ): Promise<void> {
    if (direction === "input" && addresses.length === 0 && this.rpcClient) {
      await this.processInputsViaRPC(
        transactionParts as TransactionInput[],
        addressInvolvements
      );
      return;
    }

    const promises = addresses.map(async (address, index) => {
      if (this.watchedAddresses.has(address)) {
        let amount: number = 0;

        if (direction === "output") {
          amount = this.extractOutputAmountFromTransactionPart(
            transactionParts[index] as TransactionOutput
          );
        }

        if (direction === "input") {
          amount = await this.extractInputAmountFromTransactionPart(
            transactionParts[index] as TransactionInput
          );
        }

        const involvement: AddressInvolvement = {
          address,
          name: this.addressNames.get(address),
          direction,
          amount,
          addressType: this.determineAddressType(address),
        };

        addressInvolvements.push(involvement);
      }
    });

    await Promise.all(promises);
  }

  private async processInputsViaRPC(
    inputs: TransactionInput[],
    addressInvolvements: AddressInvolvement[]
  ): Promise<void> {
    const MAX_CONCURRENT_REQUESTS = 5;
    const inputChunks = this.chunkArray(inputs, MAX_CONCURRENT_REQUESTS);

    for (const chunk of inputChunks) {
      const promises = chunk.map(async (input) => {
        if (!input.txid || (input as any).coinbase) {
          return;
        }

        try {
          await this.delay(50);
          const prevTx = await this.rpcClient.getRawTransaction(input.txid);

          if (prevTx && prevTx.vout && prevTx.vout[input.vout]) {
            const prevOutput = prevTx.vout[input.vout];
            const addresses: string[] = [];

            if (prevOutput.scriptPubKey.address) {
              addresses.push(prevOutput.scriptPubKey.address);
            }

            if (
              prevOutput.scriptPubKey.addresses &&
              Array.isArray(prevOutput.scriptPubKey.addresses)
            ) {
              addresses.push(...prevOutput.scriptPubKey.addresses);
            }

            addresses.forEach((address) => {
              if (this.watchedAddresses.has(address)) {
                const involvement: AddressInvolvement = {
                  address,
                  name: this.addressNames.get(address),
                  direction: "input",
                  amount: prevOutput.value || 0,
                  addressType: this.determineAddressType(address),
                };

                addressInvolvements.push(involvement);
                console.log(
                  `🔍 Found watched address in input: ${address} sending ${involvement.amount} BTC`
                );
              }
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("429")) {
            console.warn(`⚠️ Rate limit hit for ${input.txid}, waiting...`);
            await this.delay(1000);
          } else {
            console.warn(
              `Failed to process input ${input.txid}:${input.vout}:`,
              errorMessage
            );
          }
        }
      });

      await Promise.all(promises);
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractOutputAmountFromTransactionPart(
    transactionPart: TransactionOutput
  ): number {
    return transactionPart.value || 0;
  }

  private async extractInputAmountFromTransactionPart(
    input: TransactionInput
  ): Promise<number> {
    if (!this.rpcClient) {
      console.warn("RPC client not available for input amount extraction");
      return 0;
    }

    try {
      const prevTx = await this.rpcClient.getRawTransaction(input.txid);

      if (prevTx && prevTx.vout && prevTx.vout[input.vout]) {
        return prevTx.vout[input.vout].value;
      }

      console.warn(
        `Unable to find vout ${input.vout} in transaction ${input.txid}`
      );
      return 0;
    } catch (error) {
      console.warn(
        `Failed to get input amount for ${input.txid}:${input.vout}:`,
        error
      );
      return 0;
    }
  }

  private determineTransactionType(
    addressInvolvements: AddressInvolvement[]
  ): "incoming" | "outgoing" | "both" | "none" {
    if (addressInvolvements.length === 0) {
      return "none";
    }

    const hasInputs = addressInvolvements.some(
      (inv) => inv.direction === "input"
    );
    const hasOutputs = addressInvolvements.some(
      (inv) => inv.direction === "output"
    );

    if (hasInputs && hasOutputs) {
      return "both";
    } else if (hasInputs) {
      return "outgoing";
    } else if (hasOutputs) {
      return "incoming";
    } else {
      return "none";
    }
  }

  calculateBalanceDifference(
    addressInvolvements: AddressInvolvement[]
  ): number {
    let totalIncoming = 0;
    let totalOutgoing = 0;

    for (const involvement of addressInvolvements) {
      if (involvement.direction === "output") {
        totalIncoming += involvement.amount;
      } else if (involvement.direction === "input") {
        totalOutgoing += involvement.amount;
      }
    }

    return totalIncoming - totalOutgoing;
  }

  calculateTotalBTC(addressInvolvements: AddressInvolvement[]): number {
    return addressInvolvements.reduce((total, involvement) => {
      return total + involvement.amount;
    }, 0);
  }

  private determineAddressType(address: string): AddressType {
    if (address.startsWith("1")) {
      return "Legacy P2PKH";
    }

    if (address.startsWith("3")) {
      return "Legacy P2SH";
    }

    if (address.startsWith("bc1q")) {
      return "SegWit Bech32";
    }

    if (address.startsWith("bc1p")) {
      return "Taproot P2TR";
    }

    if (address.startsWith("tb1q")) {
      return "SegWit Bech32";
    }

    if (address.startsWith("tb1p")) {
      return "Taproot P2TR";
    }

    if (address.startsWith("m") || address.startsWith("n")) {
      return "Legacy P2PKH";
    }

    if (address.startsWith("2")) {
      return "Legacy P2SH";
    }

    return "Unknown";
  }

  private async getAllTransactionAddresses(
    transaction: Transaction,
    inputs: string[],
    outputs: string[]
  ): Promise<{ senders: string[]; receivers: string[] }> {
    const senders: string[] = [];
    const receivers: string[] = [];

    outputs.forEach((addr) => {
      if (addr && !receivers.includes(addr)) {
        receivers.push(addr);
      }
    });

    if (inputs.length > 0) {
      inputs.forEach((addr) => {
        if (addr && !senders.includes(addr)) {
          senders.push(addr);
        }
      });
    } else if (this.rpcClient) {
      for (const input of transaction.vin) {
        if (!input.txid || (input as any).coinbase) {
          continue;
        }

        try {
          const prevTx = await this.rpcClient.getRawTransaction(input.txid);
          if (prevTx && prevTx.vout && prevTx.vout[input.vout]) {
            const prevOutput = prevTx.vout[input.vout];
            const addresses: string[] = [];

            if (prevOutput.scriptPubKey.address) {
              addresses.push(prevOutput.scriptPubKey.address);
            }

            if (
              prevOutput.scriptPubKey.addresses &&
              Array.isArray(prevOutput.scriptPubKey.addresses)
            ) {
              addresses.push(...prevOutput.scriptPubKey.addresses);
            }

            addresses.forEach((addr) => {
              if (addr && !senders.includes(addr)) {
                senders.push(addr);
              }
            });
          }
        } catch (error) {
          console.error(error);
        }
      }
    }

    return { senders, receivers };
  }
}
