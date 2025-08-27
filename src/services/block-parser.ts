import {
  RawBlock,
  Transaction,
  TransactionOutput,
  PerformanceMetrics,
  OpReturnData,
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

  extractOpReturnData(transaction: Transaction): OpReturnData | null {
    for (const output of transaction.vout) {
      if (output.scriptPubKey.type === "nulldata") {
        const hex = output.scriptPubKey.hex;

        if (hex.startsWith("6a")) {
          // Пропускаем OP_RETURN опкод (6a) и длину данных
          // Первый байт после 6a - это длина данных
          let dataHex = hex.substring(4); // Простое удаление первых 2 байтов
          
          // Более правильный парсинг длины данных
          if (hex.length >= 6) {
            const lengthByte = hex.substring(2, 4);
            const length = parseInt(lengthByte, 16);
            if (length > 0 && hex.length >= 4 + length * 2) {
              dataHex = hex.substring(4, 4 + length * 2);
            }
          }
          
          return this.decodeOpReturnData(dataHex);
        }
      }
    }
    return null;
  }

  private decodeOpReturnData(hexData: string): OpReturnData {
    const result: OpReturnData = {
      hex: hexData,
      decodingSuccess: false,
    };

    try {
      // Попытка декодирования в UTF-8
      const buffer = Buffer.from(hexData, 'hex');
      const decoded = buffer.toString('utf8');
      
      // Проверяем, что декодированная строка содержит только печатаемые символы
      const isPrintable = /^[\x20-\x7E\u00A0-\uFFFF]*$/.test(decoded);
      
      if (isPrintable && decoded.length > 0) {
        result.decoded = decoded;
        result.decodingSuccess = true;
      }
    } catch (error) {
      // Декодирование не удалось, оставляем только HEX
      console.debug('Failed to decode OP_RETURN data as UTF-8:', error);
    }

    return result;
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
