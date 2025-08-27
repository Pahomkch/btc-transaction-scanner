const { BlockParser } = require('../../dist/services/block-parser');

describe('BlockParser', () => {
  let parser;

  beforeEach(() => {
    parser = new BlockParser();
  });

  describe('OP_RETURN Data Processing', () => {
    test('should extract and decode OP_RETURN data', () => {
      const hexData = '48656c6c6f20576f726c64'; // "Hello World" in hex
      const result = parser.decodeOpReturnData(hexData);
      
      expect(result).toEqual({
        hex: hexData,
        decoded: 'Hello World',
        decodingSuccess: true
      });
    });

    test('should handle non-UTF8 OP_RETURN data', () => {
      const hexData = 'deadbeef'; // Non-printable UTF-8
      const result = parser.decodeOpReturnData(hexData);
      
      expect(result.hex).toBe(hexData);
      // May or may not decode depending on implementation
      expect(typeof result.decodingSuccess).toBe('boolean');
    });

    test('should extract OP_RETURN from transaction', () => {
      const transaction = {
        vout: [
          {
            scriptPubKey: {
              type: 'pubkeyhash',
              hex: '76a914...'
            }
          },
          {
            scriptPubKey: {
              type: 'nulldata',
              hex: '6a1548656c6c6f20576f726c64' // OP_RETURN + length + "Hello World"
            }
          }
        ]
      };
      
      const result = parser.extractOpReturnData(transaction);
      
      expect(result).not.toBeNull();
      expect(result.hex).toBe('48656c6c6f20576f726c64');
      expect(result.decoded).toBe('Hello World');
      expect(result.decodingSuccess).toBe(true);
    });

    test('should return null when no OP_RETURN found', () => {
      const transaction = {
        vout: [
          {
            scriptPubKey: {
              type: 'pubkeyhash',
              hex: '76a914...'
            }
          }
        ]
      };
      
      const result = parser.extractOpReturnData(transaction);
      expect(result).toBeNull();
    });
  });

  describe('Address Extraction', () => {
    test('should extract addresses from outputs', () => {
      const transaction = {
        vin: [],
        vout: [
          {
            scriptPubKey: {
              addresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa']
            }
          },
          {
            scriptPubKey: {
              desc: 'addr(bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh)'
            }
          }
        ]
      };
      
      const result = parser.extractAddressesFromTransaction(transaction);
      
      expect(result.outputs).toContain('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(result.outputs).toContain('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
      expect(result.inputs).toEqual([]);
    });

    test('should filter out invalid addresses', () => {
      const output = {
        scriptPubKey: {
          addresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'short', '', null]
        }
      };
      
      const result = parser.extractAddressesFromOutput(output);
      
      expect(result).toEqual(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa']);
    });

    test('should extract address from desc field', () => {
      const output = {
        scriptPubKey: {
          desc: 'wpkh(addr(bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh))'
        }
      };
      
      const result = parser.extractAddressesFromOutput(output);
      
      expect(result).toEqual(['bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh']);
    });
  });

  describe('Block Transaction Parsing', () => {
    test('should yield transactions from block', async () => {
      const block = {
        tx: [
          { txid: 'tx1', vin: [], vout: [] },
          { txid: 'tx2', vin: [], vout: [] },
          { txid: 'tx3', vin: [], vout: [] }
        ]
      };
      
      const transactions = [];
      for await (const tx of parser.parseBlockTransactions(block)) {
        transactions.push(tx);
      }
      
      expect(transactions).toHaveLength(3);
      expect(transactions[0].txid).toBe('tx1');
      expect(transactions[1].txid).toBe('tx2');
      expect(transactions[2].txid).toBe('tx3');
    });
  });

  describe('Performance Metrics', () => {
    test('should calculate performance metrics', () => {
      const startTime = Date.now() - 1000; // 1 second ago
      const transactionCount = 50;
      const addressesMatched = 5;
      
      const metrics = parser.calculatePerformanceMetrics(
        startTime,
        transactionCount,
        addressesMatched
      );
      
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('blockProcessingTimeMs');
      expect(metrics).toHaveProperty('transactionCount');
      expect(metrics).toHaveProperty('addressesMatched');
      expect(metrics).toHaveProperty('notificationLatencyMs');
      
      expect(metrics.transactionCount).toBe(50);
      expect(metrics.addressesMatched).toBe(5);
      expect(metrics.blockProcessingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Memory Management', () => {
    test('should check memory limit', () => {
      const maxMemoryMB = 512;
      const result = parser.checkMemoryLimit(maxMemoryMB);
      
      expect(result).toHaveProperty('isOverLimit');
      expect(result).toHaveProperty('usage');
      expect(typeof result.isOverLimit).toBe('boolean');
      expect(typeof result.usage).toBe('number');
      expect(result.usage).toBeGreaterThan(0);
    });

    test('should detect memory over limit', () => {
      const veryLowLimit = 1; // 1MB - definitely over limit
      const result = parser.checkMemoryLimit(veryLowLimit);
      
      expect(result.isOverLimit).toBe(true);
      expect(result.usage).toBeGreaterThan(veryLowLimit);
    });
  });
});