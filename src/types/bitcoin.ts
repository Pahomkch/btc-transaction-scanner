// Bitcoin protocol types and interfaces

export interface BitcoinAddress {
  address: string;
  name?: string;
}

export interface WatchedAddresses {
  [address: string]: string;
}

export interface Config {
  rpcUrl: string;
  rpcUser?: string;
  rpcPassword?: string;
  addresses: BitcoinAddress[];
  pollingIntervalMs: number;
  maxMemoryMB: number;
  usdPriceEnabled: boolean;
  logLevel: 'info' | 'debug' | 'warn' | 'error';
}

export interface RPCResponse<T> {
  result: T;
  error: RPCError | null;
  id: string;
}

export interface RPCError {
  code: number;
  message: string;
}

// Bitcoin block structures
export interface BlockHeader {
  version: number;
  previousblockhash: string;
  merkleroot: string;
  time: number;
  bits: string;
  nonce: number;
  hash: string;
}

export interface RawBlock {
  hash: string;
  confirmations: number;
  size: number;
  strippedsize: number;
  weight: number;
  height: number;
  version: number;
  versionHex: string;
  merkleroot: string;
  time: number;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  chainwork: string;
  nTx: number;
  previousblockhash: string;
  nextblockhash?: string;
  tx: Transaction[]; // Array of transaction objects
}

// Bitcoin transaction structures
export interface Transaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: TransactionInput[];
  vout: TransactionOutput[];
  hex?: string; // Raw transaction hex
}

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig: {
    asm: string;
    hex: string;
  };
  sequence: number;
  witness?: string[]; // SegWit witness data
}

export interface TransactionOutput {
  value: number; // BTC amount
  n: number; // Output index
  scriptPubKey: {
    asm: string;
    hex: string;
    reqSigs?: number;
    type: string;
    addresses?: string[];
    desc?: string; // Address descriptor (QuickNode format)
  };
}

// Our transaction notification types
export interface TransactionNotification {
  timestamp: number;
  blockHeight: number;
  blockHash: string;
  txHash: string;
  type: 'incoming' | 'outgoing' | 'both' | 'none';
  addresses: AddressInvolvement[];
  totalBTC: number;
  totalUSD?: number;
  balanceDifference?: number; // For transactions with both incoming/outgoing
  opReturnData?: OpReturnData;
  senderAddresses?: string[]; // Addresses that sent funds (for incoming/both)
  receiverAddresses?: string[]; // Addresses that received funds (for outgoing/both)
}

export interface OpReturnData {
  hex: string;
  decoded?: string;
  decodingSuccess: boolean;
}

export interface AddressInvolvement {
  address: string;
  name?: string;
  direction: 'input' | 'output';
  amount: number; // BTC amount
  amountUSD?: number;
  addressType?: AddressType;
}

export type AddressType = 'Legacy P2PKH' | 'Legacy P2SH' | 'SegWit Bech32' | 'Taproot P2TR' | 'Unknown';

// Performance monitoring
export interface MemoryUsage {
  rss: number;     // Resident Set Size
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface PerformanceMetrics {
  memory: MemoryUsage;
  blockProcessingTimeMs: number;
  transactionCount: number;
  addressesMatched: number;
  notificationLatencyMs: number;
}
