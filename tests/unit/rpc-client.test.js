const axios = require('axios');
const { BitcoinRPCClient } = require('../../dist/services/rpc-client');

jest.mock('axios');
const mockedAxios = axios;

// Mock the axios instance
const mockAxiosInstance = {
  post: jest.fn()
};

describe('BitcoinRPCClient', () => {
  let client;
  const rpcUrl = 'https://test-node.example.com';

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    client = new BitcoinRPCClient(rpcUrl);
  });

  describe('Constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(client).toBeDefined();
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: rpcUrl,
        timeout: 30000,
        headers: { "Content-Type": "application/json" }
      });
    });
  });

  describe('RPC Calls', () => {
    test('should make successful getBlockchainInfo call', async () => {
      const mockResponse = {
        data: {
          result: {
            blocks: 720000,
            headers: 720000,
            bestblockhash: 'mock-hash',
            difficulty: 25000000000,
            mediantime: 1640000000,
            verificationprogress: 0.999,
            chainwork: 'mock-chainwork',
            size_on_disk: 400000000000,
            warnings: ''
          },
          error: null,
          id: '1'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.getBlockchainInfo();

      expect(result).toEqual(mockResponse.data.result);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', expect.objectContaining({
        jsonrpc: '2.0',
        method: 'getblockchaininfo',
        params: []
      }));
    });

    test('should make successful getBlockHash call', async () => {
      const blockHeight = 720000;
      const mockHash = 'mock-block-hash';
      
      const mockResponse = {
        data: {
          result: mockHash,
          error: null,
          id: '2'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.getBlockHash(blockHeight);

      expect(result).toBe(mockHash);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', expect.objectContaining({
        jsonrpc: '2.0',
        method: 'getblockhash',
        params: [blockHeight]
      }));
    });

    test('should make successful getBlock call', async () => {
      const blockHash = 'mock-block-hash';
      const mockBlock = {
        hash: blockHash,
        height: 720000,
        tx: [
          { txid: 'tx1', vin: [], vout: [] },
          { txid: 'tx2', vin: [], vout: [] }
        ]
      };

      const mockResponse = {
        data: {
          result: mockBlock,
          error: null,
          id: '1'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.getBlock(blockHash);

      expect(result).toEqual(mockBlock);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', expect.objectContaining({
        jsonrpc: '2.0',
        method: 'getblock',
        params: [blockHash, 2]
      }));
    });

    test('should make successful getRawTransaction call', async () => {
      const txid = 'mock-tx-id';
      const mockTransaction = {
        txid: txid,
        vin: [{ txid: 'prev-tx', vout: 0 }],
        vout: [{ value: 1.5, scriptPubKey: {} }]
      };

      const mockResponse = {
        data: {
          result: mockTransaction,
          error: null,
          id: '1'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.getRawTransaction(txid);

      expect(result).toEqual(mockTransaction);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', expect.objectContaining({
        jsonrpc: '2.0',
        method: 'getrawtransaction',
        params: [txid, true]
      }));
    });

    test('should handle ping call', async () => {
      const mockResponse = {
        data: {
          result: null,
          error: null,
          id: '1'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await client.ping();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', expect.objectContaining({
        jsonrpc: '2.0',
        method: 'ping',
        params: []
      }));
    });
  });

  describe('Error Handling', () => {
    test('should handle RPC error responses', async () => {
      const mockErrorResponse = {
        data: {
          result: null,
          error: {
            code: -1,
            message: 'Block not found'
          },
          id: '1'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockErrorResponse);

      await expect(client.getBlockHash(999999)).rejects.toThrow('RPC Error: Block not found');
    });

    test('should retry on network errors', async () => {
      const networkError = new Error('Network Error');
      const successResponse = {
        data: {
          result: 'success-after-retry',
          error: null,
          id: '1'
        }
      };

      // First call fails, second succeeds
      mockAxiosInstance.post
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const result = await client.getBlockchainInfo();

      expect(result).toBe('success-after-retry');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    test('should fail after max retries', async () => {
      const networkError = new Error('Persistent Network Error');
      
      mockAxiosInstance.post.mockRejectedValue(networkError);

      await expect(client.getBlockchainInfo()).rejects.toThrow('Persistent Network Error');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3); // 3 retries
    });
  });

  describe('Request ID Management', () => {
    test('should increment request IDs', async () => {
      const mockResponse = {
        data: {
          result: 'test',
          error: null,
          id: '1'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await client.ping();
      await client.ping();
      await client.ping();

      // Check that request IDs are incremented
      const calls = mockAxiosInstance.post.mock.calls;
      expect(calls[0][1].id).toBe('1');
      expect(calls[1][1].id).toBe('2'); 
      expect(calls[2][1].id).toBe('3');
    });
  });
});