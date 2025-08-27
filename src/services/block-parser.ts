import {
  RawBlock,
  Transaction,
  TransactionOutput,
  PerformanceMetrics,
} from "../types/bitcoin";

export class BlockParser {
  // TODO
  async *parseBlockTransactions(
    block: RawBlock
  ): AsyncGenerator<Transaction, void, unknown> {
    for (const transaction of block.tx) {
      yield transaction;

      if (block.tx.indexOf(transaction) % 100 === 0) {
        if (global.gc) {
          global.gc();
        }
      }
    }
  }

  extractAddressesFromTransaction(transaction: Transaction): {
    inputs: string[];
    outputs: string[];
  } {
    const inputs: string[] = [];
    const outputs: string[] = [];

    for (const output of transaction.vout) {
      const addresses = this.extractAddressesFromOutput(output);
      outputs.push(...addresses);
    }

    // TODO
    // Для входов транзакции адреса находятся в предыдущих транзакциях
    // можем получить их из scriptSig или witness данных
    // Но для простоты сосредоточимся на выходах, где адреса более явные
    return { inputs, outputs };
  }

  private extractAddressesFromOutput(output: TransactionOutput): string[] {
    const { scriptPubKey } = output;

    if (scriptPubKey.addresses && scriptPubKey.addresses.length > 0) {
      return scriptPubKey.addresses.filter((addr) => addr && addr.length > 10);
    }

    if (scriptPubKey.desc) {
      const descMatch = scriptPubKey.desc.match(
        /addr\(([13bc][a-zA-Z0-9]{25,62})\)/
      );
      if (descMatch && descMatch[1]) {
        return [descMatch[1]];
      }
    }

    return [];
  }

  extractOpReturnData(transaction: Transaction): string | null {
    for (const output of transaction.vout) {
      if (output.scriptPubKey.type === "nulldata") {
        const hex = output.scriptPubKey.hex;

        if (hex.startsWith("6a")) {
          return hex.substring(4);
        }
      }
    }
    return null;
  }

  calculatePerformanceMetrics(
    startTime: number,
    transactionCount: number,
    addressesMatched: number
  ): PerformanceMetrics {
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    return {
      memory: this.getMemoryUsage(),
      blockProcessingTimeMs: processingTime,
      transactionCount,
      addressesMatched,
      notificationLatencyMs: processingTime, // Примерная латентность
    };
  }

  private getMemoryUsage() {
    return process.memoryUsage();
  }

  checkMemoryLimit(maxMemoryMB: number): {
    isOverLimit: boolean;
    usage: number;
  } {
    const memoryUsage = process.memoryUsage();
    const currentUsageMB = memoryUsage.heapUsed / (1024 * 1024);
    const isOverLimit = currentUsageMB > maxMemoryMB;

    if (currentUsageMB > maxMemoryMB * 0.8) {
      console.warn(
        `Memory usage approaching limit: ${currentUsageMB.toFixed(
          2
        )}MB / ${maxMemoryMB}MB`
      );
    }

    return {
      isOverLimit,
      usage: currentUsageMB,
    };
  }
}
