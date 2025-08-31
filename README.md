# Bitcoin Transaction Scanner

A high-performance TypeScript application that monitors Bitcoin network transactions for configured addresses and reports findings via structured JSON logs. Built for production use with comprehensive performance validation and monitoring capabilities.

## 🎯 Overview

Bitcoin Transaction Scanner is designed to provide real-time monitoring of Bitcoin addresses with enterprise-grade performance requirements. It connects directly to Bitcoin RPC nodes, processes raw blockchain data, and delivers instant notifications when watched addresses are involved in transactions.

### Key Capabilities
- **Real-time Monitoring**: Continuous scanning of new Bitcoin blocks
- **Multi-Address Support**: Monitor 1000+ addresses simultaneously
- **All Address Types**: Support for Legacy P2PKH, P2SH, SegWit, and Taproot addresses
- **Transaction Analysis**: Detailed transaction breakdown with direction detection
- **Performance Optimized**: Memory-efficient with sub-5-second latency guarantees
- **USD Integration**: Optional real-time BTC to USD conversion
- **OP_RETURN Support**: Extraction and decoding of embedded data
- **Production Ready**: Comprehensive testing suite and monitoring

## 🚀 Quick Start

- Past your QuickNode node url to BTC_RPC_URL env

### Prerequisites
- Node.js >= 18.0.0
- Bitcoin RPC endpoint (QuickNode, local node, etc.)
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd btc_scanner

# Install dependencies
npm install

# Build the project
npm run build

# Configure your settings (see Configuration section)
# Edit src/config/config.json with your RPC URL and addresses

# Start monitoring
npm start
```
## 🧪 Testing

### Running Tests

**Important**: Performance tests require the project to be built first:

```bash
# Build the project before running performance tests
npm run build

# Run complete test suite
npm run test:all
```

### Test Categories

```bash
# Unit and Integration Tests
npm test

# Performance Tests (requires build)
npm run test:performance   # All performance tests
npm run test:memory        # Memory limit validation (512MB)
npm run test:latency       # Notification latency (≤5s)
npm run test:scale         # Address scale test (1000+ addresses)
npm run test:throughput    # Throughput validation (7+ TPS)

# Individual Components
npm run typecheck          # TypeScript validation
npm run lint              # Code style checks
```

### Test Results

Test results are saved in `tests/results/` directory:
- `test-suite-summary.json`: Overall test summary
- `memory-test-results.json`: Memory usage analysis
- `latency-test-results.json`: Response time metrics
- `throughput-test-results.json`: Transaction processing rates
- `address-scale-test-results.json`: Large-scale address handling

## 📊 Features

### Address Type Detection
| Type | Format | Description |
|------|--------|-------------|
| **Legacy P2PKH** | `1...` | Pay-to-Public-Key-Hash (original Bitcoin addresses) |
| **Legacy P2SH** | `3...` | Pay-to-Script-Hash (multisig, timelock) |
| **SegWit Bech32** | `bc1q...` | Native SegWit v0 (lower fees, witness data) |
| **Taproot P2TR** | `bc1p...` | Pay-to-Taproot (privacy, smart contracts) |

### Transaction Analysis
- **Incoming**: Address receives Bitcoin from external sources
- **Outgoing**: Address sends Bitcoin to external destinations
- **Both**: Address appears in inputs and outputs (internal transfers)
- **Balance Tracking**: Net balance changes for complex transactions
- **OP_RETURN**: Extraction of embedded data with UTF-8 decoding

### Performance Features
- **Memory Efficient**: Streaming block processing prevents memory bloat
- **Fast Lookups**: O(1) address matching using Set data structures
- **Auto-Recovery**: RPC retry logic with exponential backoff
- **Garbage Collection**: Proactive memory management and monitoring
- **Rate Limiting**: Intelligent request throttling for RPC endpoints

## ⚙️ Configuration

### Configuration File

Edit `src/config/config.json`:

```json
{
  "addresses": [
    {
      "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "name": "Genesis Block Address",
      "note": "First Bitcoin address ever used"
    },
    {
      "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      "name": "Modern SegWit Address",
      "note": "Example native SegWit address"
    }
  ],
  "pollingIntervalMs": 5000,
  "maxMemoryMB": 512,
  "usdPriceEnabled": true,
  "logLevel": "info"
}
```

### Environment Variables

Optional environment variable overrides:

```bash
# RPC Configuration
BTC_RPC_URL="https://your-node.com/api"

# Performance Tuning
MAX_MEMORY_MB=512
POLLING_INTERVAL_MS=5000

# Features
USD_PRICE_ENABLED=true
LOG_LEVEL=info

# Custom Config Path
CONFIG_PATH=/path/to/custom/config.json
```

### Output Format

Transaction notifications are logged as structured JSON:

```json
{
  "event_type": "bitcoin_transaction",
  "timestamp": 1756314559281,
  "level": "info",
  "message": "transaction_detected",
  "block": {
    "height": 911963,
    "hash": "0000000000000000000200a39193d6c453b7e2c9a82172f4a501f97a23fdd5c5"
  },
  "transaction": {
    "hash": "4c70a848552291cbd64278f9b293a6bcf5f8ef9761fb3e8a18c9d4fc7375a43f",
    "type": "incoming",
    "total_btc": 0.00055364,
    "total_usd": 62.03
  },
  "addresses": [
    {
      "address": "35C2L1pCgwzBHNcDcVL1a5RuoefeWqyjAR",
      "name": "P2SH Incoming Address",
      "direction": "output",
      "amount_btc": 0.00055364,
      "amount_usd": 62.03
    }
  ],
  "sender_addresses": ["33YGi6YFaubneh1BfG4KvcTWBH6a66KAmW"],
  "receiver_addresses": ["35C2L1pCgwzBHNcDcVL1a5RuoefeWqyjAR"],
  "readable_message": "Address P2SH Incoming Address receives 0.00055364 BTC ($62.03) from 33YGi6YFaubneh1BfG4KvcTWBH6a66KAmW | Legacy P2SH | TX: 4c70a848552291cbd64278f9b293a6bcf5f8ef9761fb3e8a18c9d4fc7375a43f"
}
```
