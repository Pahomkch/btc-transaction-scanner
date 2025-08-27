import {
  Transaction,
  WatchedAddresses,
  AddressInvolvement,
  TransactionInput,
  TransactionOutput,
} from "../types/bitcoin";
import { BlockParser } from "./block-parser";

export class AddressDetector {
  private watchedAddresses: Set<string>;
  private addressNames: Map<string, string>;
  private blockParser: BlockParser;

  constructor(addresses: WatchedAddresses) {
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
          amount = this.extractInputAmountFromTransactionPart();
        }

        const involvement: AddressInvolvement = {
          address,
          name: this.addressNames.get(address),
          direction,
          amount,
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

  // FIXME
  // FIXME
  // FIXME
  // FIXME
  private extractInputAmountFromTransactionPart(): number {
    // Для входов нужно получить сумму из предыдущей транзакции
    // В рамках этого ТЗ возвращаем 0, в продакшене нужен дополнительный RPC вызов
    return 0; // Требует getRawTransaction для предыдущей транзакции
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
}
