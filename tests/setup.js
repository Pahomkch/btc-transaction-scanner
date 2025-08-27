// Global test setup for Bitcoin Transaction Scanner

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for all tests
jest.setTimeout(30000);

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  // Keep error and warn for important messages
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Create mock Bitcoin transaction
  createMockTransaction: (overrides = {}) => ({
    txid: 'mock-tx-id',
    hash: 'mock-tx-hash',
    version: 1,
    size: 250,
    vsize: 140,
    weight: 560,
    locktime: 0,
    vin: [
      {
        txid: 'prev-tx-id',
        vout: 0,
        scriptSig: {
          asm: 'mock asm',
          hex: 'mock hex'
        },
        sequence: 4294967295
      }
    ],
    vout: [
      {
        value: 0.001,
        n: 0,
        scriptPubKey: {
          asm: 'OP_DUP OP_HASH160 mock OP_EQUALVERIFY OP_CHECKSIG',
          hex: '76a914mock88ac',
          reqSigs: 1,
          type: 'pubkeyhash',
          addresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa']
        }
      }
    ],
    ...overrides
  }),

  // Create mock Bitcoin block
  createMockBlock: (overrides = {}) => ({
    hash: 'mock-block-hash',
    confirmations: 1,
    size: 285,
    strippedsize: 285,
    weight: 1140,
    height: 720000,
    version: 536870912,
    versionHex: '20000000',
    merkleroot: 'mock-merkle-root',
    time: 1640000000,
    mediantime: 1639998000,
    nonce: 123456789,
    bits: '170e1a2d',
    difficulty: 25000000000.0,
    chainwork: 'mock-chainwork',
    nTx: 2,
    previousblockhash: 'prev-block-hash',
    nextblockhash: 'next-block-hash',
    tx: [
      global.testUtils.createMockTransaction(),
      global.testUtils.createMockTransaction({ txid: 'tx2' })
    ],
    ...overrides
  }),

  // Create mock RPC response
  createMockRPCResponse: (result, error = null) => ({
    data: {
      result,
      error,
      id: '1'
    }
  }),

  // Sleep utility for async tests
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate random Bitcoin address for testing
  generateTestAddress: (type = 'p2pkh') => {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bech32Chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    
    let result = '';
    
    switch (type) {
      case 'p2pkh':
        result = '1';
        for (let i = 0; i < 25; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        break;
      case 'p2sh':
        result = '3';
        for (let i = 0; i < 25; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        break;
      case 'bech32':
        result = 'bc1q';
        for (let i = 0; i < 32; i++) {
          result += bech32Chars.charAt(Math.floor(Math.random() * bech32Chars.length));
        }
        break;
      case 'taproot':
        result = 'bc1p';
        for (let i = 0; i < 51; i++) {
          result += bech32Chars.charAt(Math.floor(Math.random() * bech32Chars.length));
        }
        break;
      default:
        throw new Error(`Unknown address type: ${type}`);
    }
    
    return result;
  }
};

// Setup cleanup for tests
afterEach(() => {
  // Clear all mocks between tests
  jest.clearAllMocks();
});

// Global error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests
});