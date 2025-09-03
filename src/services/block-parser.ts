import {
  RawBlock,
  Transaction,
  TransactionOutput,
  PerformanceMetrics,
  OpReturnData,
} from "../types/bitcoin";
import { bech32, bech32m } from 'bech32';

export class BlockParser {
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

    for (const input of transaction.vin) {
      const addresses = this.extractAddressesFromInput(input);
      inputs.push(...addresses);
    }
    return { inputs, outputs };
  }

  private extractAddressesFromOutput(output: TransactionOutput): string[] {
    const { scriptPubKey } = output;

    if (scriptPubKey.addresses && scriptPubKey.addresses.length > 0) {
      return scriptPubKey.addresses.filter((addr) => addr && addr.length > 10);
    }

    if (scriptPubKey.desc) {
      // Check for addr() descriptor
      const addrMatch = scriptPubKey.desc.match(
        /addr\(([13bc2mntb][a-zA-Z0-9]{25,62})\)/
      );
      if (addrMatch && addrMatch[1]) {
        return [addrMatch[1]];
      }

      // Check for rawtr() descriptor (Taproot)
      const rawtrMatch = scriptPubKey.desc.match(/rawtr\(([a-fA-F0-9]{64})\)/);
      if (rawtrMatch && rawtrMatch[1]) {
        const pubkeyHash = rawtrMatch[1];
        const taprootAddress = this.convertTaprootHashToAddress(pubkeyHash);
        return [taprootAddress];
      }
    }

    // Handle witness_v1_taproot from hex
    if (scriptPubKey.type === 'witness_v1_taproot') {
      if (scriptPubKey.hex && scriptPubKey.hex.length === 68) {
        const pubkeyHash = scriptPubKey.hex.substring(4);
        const taprootAddress = this.convertTaprootHashToAddress(pubkeyHash);
        return [taprootAddress];
      }
    }

    // Handle witness_v0_keyhash (SegWit v0 P2WPKH) from hex
    if (scriptPubKey.type === 'witness_v0_keyhash') {
      if (scriptPubKey.hex && scriptPubKey.hex.length === 44) { // 0014 + 40 chars (20 bytes)
        const keyHash = scriptPubKey.hex.substring(4);
        const segwitAddress = this.convertSegWitV0ToAddress(keyHash, 0);
        return [segwitAddress];
      }
    }

    // Handle witness_v0_scripthash (SegWit v0 P2WSH) from hex
    if (scriptPubKey.type === 'witness_v0_scripthash') {
      if (scriptPubKey.hex && scriptPubKey.hex.length === 68) { // 0020 + 64 chars (32 bytes)
        const scriptHash = scriptPubKey.hex.substring(4);
        const segwitAddress = this.convertSegWitV0ToAddress(scriptHash, 0);
        return [segwitAddress];
      }
    }

    // Handle pubkeyhash (Legacy P2PKH) from hex
    if (scriptPubKey.type === 'pubkeyhash') {
      if (scriptPubKey.hex && scriptPubKey.hex.startsWith('76a914') && scriptPubKey.hex.endsWith('88ac')) {
        const keyHash = scriptPubKey.hex.substring(6, 46); // Extract 20-byte hash
        const legacyAddress = this.convertLegacyP2PKHToAddress(keyHash);
        return [legacyAddress];
      }
    }

    // Handle scripthash (Legacy P2SH) from hex
    if (scriptPubKey.type === 'scripthash') {
      if (scriptPubKey.hex && scriptPubKey.hex.startsWith('a914') && scriptPubKey.hex.endsWith('87')) {
        const scriptHash = scriptPubKey.hex.substring(4, 44); // Extract 20-byte hash
        const p2shAddress = this.convertLegacyP2SHToAddress(scriptHash);
        return [p2shAddress];
      }
    }

    return [];
  }

  private extractAddressesFromInput(input: any): string[] {
    const addresses: string[] = [];

    if (input.addresses && Array.isArray(input.addresses)) {
      addresses.push(
        ...input.addresses.filter((addr: string) => addr && addr.length > 10)
      );
    }

    // Проверяем witness data для SegWit транзакций
    if (input.txinwitness && Array.isArray(input.txinwitness)) {
      // Для SegWit v0 (P2WPKH) обычно последний элемент witness - это публичный ключ
      const witness = input.txinwitness;
      if (witness.length >= 2) {
        try {
          // Попытка извлечь адрес из публичного ключа в witness
          const pubKey = witness[witness.length - 1];
          if (pubKey && pubKey.length === 66) {
            // 33 байта в hex = 66 символов
            // console.log('Found public key in witness, but address conversion not implemented');
          }
        } catch (e) {
          // Игнорируем ошибки при разборе witness
        }
      }
    }

    if (input.scriptSig && input.scriptSig.asm) {
      try {
        const asm = input.scriptSig.asm;
        const pubKeyPattern = /[0-9a-fA-F]{66}/g;
        const pubKeys = asm.match(pubKeyPattern);
        if (pubKeys && pubKeys.length > 0) {
          // TODO Found public keys in scriptSig, but address conversion not implemented
        }
      } catch (e) {
        // Игнорируем ошибки при разборе scriptSig
      }
    }

    return addresses;
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

  private convertTaprootHashToAddress(pubkeyHash: string): string {
    try {
      const data = Buffer.from(pubkeyHash, 'hex');
      if (data.length === 32) {
        // Taproot uses bech32m encoding with version 1
        const words = bech32m.toWords(data);
        const address = bech32m.encode('tb', [1, ...words]);
        return address;
      }
    } catch (error) {
      console.error('Failed to convert Taproot hash to address:', error);
    }
    return `tb1p_error_${pubkeyHash.substring(0, 8)}`;
  }

  private convertSegWitV0ToAddress(hash: string, version: number): string {
    try {
      const data = Buffer.from(hash, 'hex');
      if (data.length === 20 || data.length === 32) {
        // SegWit v0 uses bech32 encoding
        const words = bech32.toWords(data);
        const address = bech32.encode('tb', [version, ...words]);
        return address;
      }
    } catch (error) {
      console.error('Failed to convert SegWit hash to address:', error);
    }
    return `tb1q_error_${hash.substring(0, 8)}`;
  }

  private convertLegacyP2PKHToAddress(keyHash: string): string {
    try {
      const data = Buffer.from(keyHash, 'hex');
      if (data.length === 20) {
        // Testnet P2PKH uses base58 with version byte 0x6f
        const versionedHash = Buffer.concat([Buffer.from([0x6f]), data]);
        const address = this.base58CheckEncode(versionedHash);
        return address;
      }
    } catch (error) {
      console.error('Failed to convert Legacy P2PKH hash:', error);
    }
    return `m_error_${keyHash.substring(0, 8)}`;
  }

  private convertLegacyP2SHToAddress(scriptHash: string): string {
    try {
      const data = Buffer.from(scriptHash, 'hex');
      if (data.length === 20) {
        // Testnet P2SH uses base58 with version byte 0xc4
        const versionedHash = Buffer.concat([Buffer.from([0xc4]), data]);
        const address = this.base58CheckEncode(versionedHash);
        return address;
      }
    } catch (error) {
      console.error('Failed to convert Legacy P2SH hash:', error);
    }
    return `2_error_${scriptHash.substring(0, 8)}`;
  }

  private base58CheckEncode(data: Buffer): string {
    const crypto = require('crypto');
    
    // Double SHA256 for checksum
    const hash1 = crypto.createHash('sha256').update(data).digest();
    const hash2 = crypto.createHash('sha256').update(hash1).digest();
    const checksum = hash2.slice(0, 4);
    
    // Combine data and checksum
    const payload = Buffer.concat([data, checksum]);
    
    // Base58 encode
    return this.base58Encode(payload);
  }

  private base58Encode(buffer: Buffer): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    
    // Convert to big integer
    let num = BigInt('0x' + buffer.toString('hex'));
    
    while (num > 0) {
      const remainder = num % 58n;
      result = alphabet[Number(remainder)] + result;
      num = num / 58n;
    }
    
    // Add leading zeros as '1's
    for (const byte of buffer) {
      if (byte === 0) {
        result = '1' + result;
      } else {
        break;
      }
    }
    
    return result;
  }


  private decodeOpReturnData(hexData: string): OpReturnData {
    const result: OpReturnData = {
      hex: hexData,
      decodingSuccess: false,
    };

    try {
      const buffer = Buffer.from(hexData, "hex");
      const decoded = buffer.toString("utf8");

      // Проверяем, что декодированная строка содержит только печатаемые символы
      const isPrintable = /^[\x20-\x7E\u00A0-\uFFFF]*$/.test(decoded);

      if (isPrintable && decoded.length > 0) {
        result.decoded = decoded;
        result.decodingSuccess = true;
      }
    } catch (error) {
      // Декодирование не удалось, оставляем только HEX
      console.debug("Failed to decode OP_RETURN data as UTF-8:", error);
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
