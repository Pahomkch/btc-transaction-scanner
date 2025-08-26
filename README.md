# Bitcoin Transaction Scanner

A high-performance TypeScript bot that monitors Bitcoin network transactions for configured addresses and reports findings via structured JSON logs to stdout.

## 🎯 Features

- **Real-time Monitoring**: Tracks new Bitcoin blocks with ~5 second latency
- **Memory Efficient**: Streaming block processing to stay under 512MB RAM limit
- **High Performance**: Supports monitoring 1000+ addresses with O(1) lookup efficiency
- **Multi-format Support**: Handles Legacy (P2PKH), P2SH, and SegWit (Bech32) addresses
- **Custom Script Interpretation**: Parses different transaction types including OP_RETURN data
- **USD Conversion**: Optional real-time BTC to USD conversion
- **JSON Logging**: Structured transaction notifications to stdout
- **Performance Metrics**: Built-in monitoring of latency, memory usage, and throughput

## 🏗 Architecture

```
├── src/
│   ├── types/bitcoin.ts          # TypeScript interfaces and types
│   ├── services/
│   │   ├── rpc-client.ts         # Bitcoin RPC client with retry logic
│   │   ├── block-parser.ts       # Streaming block parser
│   │   ├── address-detector.ts   # O(1) address lookup service
│   │   ├── notification-service.ts # JSON notification system
│   │   └── block-monitor.ts      # Main monitoring orchestrator
│   ├── config/config.json        # Configuration file
│   └── index.ts                  # Application entry point
```

## 📋 Technical Requirements Compliance

| Requirement | Implementation | Status |
|-------------|---------------|---------|
| Max 512MB RAM | Streaming block processing, no caching | ✅ |
| ≤5s latency | Real-time block polling every 5 seconds | ✅ |
| 1000+ addresses | Set-based O(1) address lookup | ✅ |
| 7 TPS throughput | Async processing, parallel address checks | ✅ |
| Direct RPC only | No blockchain explorer APIs used | ✅ |
| JSON stdout logs | Winston structured logging | ✅ |
| Raw block parsing | Custom Bitcoin block/transaction parser | ✅ |
| Script interpretation | Support for P2PKH, P2SH, SegWit, OP_RETURN | ✅ |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- TypeScript 5.3+
- Access to Bitcoin RPC node (QuickNode, Infura, Alchemy free tier)

### Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd bitcoin-transaction-scanner
npm install

# Build the project
npm run build
```

### Configuration

1. **Config File Method** (Recommended):
   Edit `src/config/config.json`:

```json
{
  "rpcUrl": "https://your-quicknode-endpoint.com",
  "addresses": [
    {
      "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "name": "Genesis Block Address",
      "type": "legacy"
    },
    {
      "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      "name": "SegWit Address",
      "type": "bech32"
    }
  ],
  "pollingIntervalMs": 5000,
  "maxMemoryMB": 512,
  "usdPriceEnabled": true,
  "logLevel": "info"
}
```

2. **Environment Variables Method**:

```bash
export BTC_RPC_URL="https://your-rpc-endpoint.com"
export WATCHED_ADDRESSES='[{"address":"1A1z...","name":"Test","type":"legacy"}]'
export USD_PRICE_ENABLED=true
export MAX_MEMORY_MB=512
export POLLING_INTERVAL_MS=5000
```

### Running

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start

# With custom config
CONFIG_PATH=/path/to/config.json npm start
```

## 📊 Output Format

The scanner outputs structured JSON logs to stdout for each detected transaction:

```json
{
  "level": "info",
  "message": "transaction_detected",
  "timestamp": "2024-01-20T15:30:45.123Z",
  "event_type": "bitcoin_transaction",
  "block": {
    "height": 825000,
    "hash": "0000000000000000000123abc..."
  },
  "transaction": {
    "hash": "abc123def456...",
    "type": "incoming",
    "total_btc": 0.001,
    "total_usd": 42.50,
    "balance_difference": 0.001
  },
  "addresses": [
    {
      "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "name": "Genesis Block Address",
      "direction": "output",
      "amount_btc": 0.001,
      "amount_usd": 42.50
    }
  ],
  "op_return_data": "48656c6c6f20576f726c64",
  "processing_info": {
    "notification_time": 1705756245123,
    "latency_ms": 3500
  }
}
```

### Transaction Types

- **incoming**: Funds received by watched addresses
- **outgoing**: Funds sent from watched addresses  
- **both**: Mixed transaction (watched addresses in both inputs and outputs)

## 🔧 Address Format Support

| Format | Example | Type Field | Description |
|--------|---------|------------|-------------|
| Legacy P2PKH | `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` | `legacy` | Traditional Bitcoin addresses |
| P2SH | `3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy` | `segwit` | Script hash addresses |
| Bech32 | `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh` | `bech32` | Native SegWit addresses |

## 🔍 Performance Monitoring

The scanner provides built-in performance metrics:

```json
{
  "level": "info",
  "message": "performance_metrics",
  "timestamp": "2024-01-20T15:30:45.123Z",
  "event_type": "performance_data",
  "metrics": {
    "memory_usage_mb": 256.7,
    "block_processing_time_ms": 1250,
    "transaction_count": 2847,
    "addresses_matched": 3,
    "notification_latency_ms": 3200
  }
}
```

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Performance Testing

The scanner includes built-in performance monitoring. To verify compliance:

1. **Memory Usage**: Monitor `memory_usage_mb` in performance logs (should stay under 512MB)
2. **Latency**: Check `notification_latency_ms` (should be ≤5000ms)
3. **Throughput**: Verify processing of sustained 7+ TPS during busy periods

### Load Testing

```bash
# Monitor 1000 addresses for 1 hour
node dist/index.js | tee performance.log

# Analyze performance metrics
grep "performance_metrics" performance.log | jq '.metrics'
```

## 🚨 Error Handling

The scanner includes comprehensive error handling:

- **RPC Connection**: Automatic retry with exponential backoff
- **Memory Limits**: Monitoring and garbage collection triggers
- **Network Issues**: Graceful degradation and recovery
- **Invalid Blocks**: Logging and continuation of monitoring

## 🔒 Security Considerations

- RPC credentials are loaded from config files or environment variables
- No sensitive data is logged in output
- Input validation for all configuration parameters
- Graceful handling of malformed blockchain data

## 🛠 Development

### Project Structure

- **Types**: All Bitcoin-related interfaces in `types/bitcoin.ts`
- **Services**: Modular services with single responsibilities
- **Async/Await**: Extensively used with detailed comments explaining concurrency
- **Memory Management**: Streaming processing with explicit garbage collection
- **Error Handling**: Comprehensive try-catch blocks with structured logging

### Key Design Decisions

1. **TypeScript**: Chosen for strong typing and excellent async support
2. **Streaming**: Prevents memory accumulation when processing large blocks
3. **Set-based Lookup**: O(1) address detection for 1000+ addresses
4. **Retry Logic**: Handles free-tier RPC provider limitations
5. **JSON Logging**: Structured output for easy integration with monitoring tools

## 📈 Scalability

The scanner is designed to handle:
- **1000+ addresses**: O(1) lookup performance
- **Large blocks**: Streaming processing up to 4MB blocks
- **High throughput**: 7+ TPS sustained processing
- **Limited memory**: Operates within 512MB constraint
- **Network variance**: Adapts to RPC provider limitations

## 🤝 Contributing

1. Follow the existing TypeScript style
2. Add comprehensive async/await comments
3. Include performance impact analysis for changes
4. Test memory usage with large address sets
5. Verify JSON output format compliance

## 📄 License

MIT License - see LICENSE file for details.

---

**🔍 Bitcoin Transaction Scanner v1.0.0**  
*Real-time Bitcoin address monitoring with enterprise-grade performance*