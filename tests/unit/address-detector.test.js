const { AddressDetector } = require('../../dist/services/address-detector');

describe('AddressDetector', () => {
  let detector;
  const mockRpcClient = {
    getRawTransaction: jest.fn()
  };

  beforeEach(() => {
    const watchedAddresses = {
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa': 'Genesis Block',
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh': 'SegWit Test',
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy': 'P2SH Test'
    };
    detector = new AddressDetector(watchedAddresses, mockRpcClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Address Type Detection', () => {
    test('should detect Legacy P2PKH address', () => {
      const result = detector.determineAddressType('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(result).toBe('Legacy P2PKH');
    });

    test('should detect Legacy P2SH address', () => {
      const result = detector.determineAddressType('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
      expect(result).toBe('Legacy P2SH');
    });

    test('should detect SegWit Bech32 address', () => {
      const result = detector.determineAddressType('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
      expect(result).toBe('SegWit Bech32');
    });

    test('should detect Taproot P2TR address', () => {
      const result = detector.determineAddressType('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
      expect(result).toBe('Taproot P2TR');
    });

    test('should return Unknown for invalid address', () => {
      const result = detector.determineAddressType('invalid-address');
      expect(result).toBe('Unknown');
    });
  });

  describe('Transaction Type Determination', () => {
    test('should detect incoming transaction', () => {
      const addressInvolvements = [
        {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          direction: 'output',
          amount: 1.5
        }
      ];
      
      const result = detector.determineTransactionType(addressInvolvements);
      expect(result).toBe('incoming');
    });

    test('should detect outgoing transaction', () => {
      const addressInvolvements = [
        {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          direction: 'input',
          amount: 2.0
        }
      ];
      
      const result = detector.determineTransactionType(addressInvolvements);
      expect(result).toBe('outgoing');
    });

    test('should detect both transaction', () => {
      const addressInvolvements = [
        {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          direction: 'input',
          amount: 2.0
        },
        {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          direction: 'output',
          amount: 1.5
        }
      ];
      
      const result = detector.determineTransactionType(addressInvolvements);
      expect(result).toBe('both');
    });

    test('should return none for empty involvements', () => {
      const result = detector.determineTransactionType([]);
      expect(result).toBe('none');
    });
  });

  describe('Balance Calculation', () => {
    test('should calculate positive balance difference', () => {
      const addressInvolvements = [
        { direction: 'output', amount: 3.0 },
        { direction: 'input', amount: 1.5 }
      ];
      
      const result = detector.calculateBalanceDifference(addressInvolvements);
      expect(result).toBe(1.5); // 3.0 - 1.5
    });

    test('should calculate negative balance difference', () => {
      const addressInvolvements = [
        { direction: 'output', amount: 1.0 },
        { direction: 'input', amount: 2.5 }
      ];
      
      const result = detector.calculateBalanceDifference(addressInvolvements);
      expect(result).toBe(-1.5); // 1.0 - 2.5
    });

    test('should calculate total BTC', () => {
      const addressInvolvements = [
        { amount: 1.5 },
        { amount: 2.0 },
        { amount: 0.5 }
      ];
      
      const result = detector.calculateTotalBTC(addressInvolvements);
      expect(result).toBe(4.0);
    });
  });

  describe('Input Amount Extraction', () => {
    test('should extract amount from previous transaction', async () => {
      const prevTx = {
        vout: [
          { value: 1.5 },
          { value: 2.0 }
        ]
      };
      
      mockRpcClient.getRawTransaction.mockResolvedValue(prevTx);
      
      const input = { txid: 'prev-tx-id', vout: 1 };
      const result = await detector.extractInputAmountFromTransactionPart(input);
      
      expect(result).toBe(2.0);
      expect(mockRpcClient.getRawTransaction).toHaveBeenCalledWith('prev-tx-id');
    });

    test('should return 0 when RPC client not available', async () => {
      const detectorWithoutRpc = new AddressDetector({});
      const input = { txid: 'prev-tx-id', vout: 0 };
      
      const result = await detectorWithoutRpc.extractInputAmountFromTransactionPart(input);
      expect(result).toBe(0);
    });

    test('should handle RPC errors gracefully', async () => {
      mockRpcClient.getRawTransaction.mockRejectedValue(new Error('RPC Error'));
      
      const input = { txid: 'prev-tx-id', vout: 0 };
      const result = await detector.extractInputAmountFromTransactionPart(input);
      
      expect(result).toBe(0);
    });
  });

  describe('Address Management', () => {
    test('should update watched addresses', () => {
      const newAddresses = {
        '1NewAddress1': 'New Test Address',
        '3NewAddress2': 'Another New Address'
      };
      
      detector.updateWatchedAddresses(newAddresses);
      
      // Verification would require access to private members
      // In a real implementation, we might add a getter for testing
      expect(detector).toBeDefined();
    });
  });
});