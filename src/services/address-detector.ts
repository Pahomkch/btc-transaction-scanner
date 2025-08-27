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
  }> {
    const addressInvolvements: AddressInvolvement[] = [];
    const { inputs, outputs } =
      this.blockParser.extractAddressesFromTransaction(transaction);

    await this.processAddresses(
      inputs,
      transaction.vin,
      "input",
      addressInvolvements
    );

    await this.processAddresses(
      outputs,
      transaction.vout,
      "output",
      addressInvolvements
    );

    const hasWatchedAddress = addressInvolvements.length > 0;
    const transactionType = this.determineTransactionType(addressInvolvements);

    return {
      hasWatchedAddress,
      addressInvolvements,
      transactionType,
    };
  }

  private async processAddresses(
    addresses: string[],
    transactionParts: TransactionInput[] | TransactionOutput[],
    direction: "input" | "output",
    addressInvolvements: AddressInvolvement[]
  ): Promise<void> {
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
      // Получаем предыдущую транзакцию
      const prevTx = await this.rpcClient.getRawTransaction(input.txid);
      
      // Извлекаем сумму из соответствующего output
      if (prevTx && prevTx.vout && prevTx.vout[input.vout]) {
        return prevTx.vout[input.vout].value;
      }
      
      console.warn(`Unable to find vout ${input.vout} in transaction ${input.txid}`);
      return 0;
    } catch (error) {
      console.warn(`Failed to get input amount for ${input.txid}:${input.vout}:`, error);
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
    // Legacy P2PKH адреса начинаются с '1'
    if (address.startsWith('1')) {
      return 'Legacy P2PKH';
    }
    
    // Legacy P2SH адреса начинаются с '3' 
    if (address.startsWith('3')) {
      return 'Legacy P2SH';
    }
    
    // SegWit Bech32 адреса начинаются с 'bc1q'
    if (address.startsWith('bc1q')) {
      return 'SegWit Bech32';
    }
    
    // Taproot адреса начинаются с 'bc1p'
    if (address.startsWith('bc1p')) {
      return 'Taproot P2TR';
    }
    
    // Testnet адреса (для полноты)
    if (address.startsWith('m') || address.startsWith('n') || address.startsWith('2')) {
      return 'Unknown'; // Testnet адреса не классифицируем детально
    }
    
    if (address.startsWith('tb1q') || address.startsWith('tb1p')) {
      return 'Unknown'; // Testnet SegWit/Taproot
    }
    
    return 'Unknown';
  }
}
