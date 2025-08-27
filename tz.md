# Technical Assessment: Bitcoin Transaction Scanner

## Overview
Implement a bot that monitors and reports Bitcoin network transactions for a configured list of wallets. The implementation must process raw blockchain data and meet specific performance requirements.

## Technology Stack
Allowed languages: Python, Go, JavaScript / TypeScript, C

## Core Requirements
- Bot should parse configuration with addresses and names using any preferable structure
- Bot should post about new transactions and information about it (from/to, amount, amount in usd, tx hash etc.)
- Bot should be compliant to technical requirements

## Transaction Notifications
The bot must send notification to a stdout as json log. Log must contain information about transaction.

Any amount of tokens also must have info about equity in USD (optional)

For transactions with both incoming and outgoing operations, display the total balance difference.

## Raw Data Processing Requirements
- **Direct Block Processing**: implement custom parsing of raw Bitcoin blocks
- **Transaction Analysis**:
  a. Implement custom script interpretation for different transaction types
  b. Handle different address formats (legacy, SegWit)
  c. Process and interpret OP_RETURN data when present

## Technical Requirements
- **Performance Constraints**:
  a. Maximum memory usage: 512MB
  b. Transaction notification latency: less or equal to 5 seconds from block discovery
- **Scalability Requirements**:
  a. Support monitoring of at least 1000 concurrent addresses
  b. Handle sustained transaction throughput of 7 TPS

## Restrictions
- Usage of blockchain explorer APIs (e.g., blockstream, btcscan) is prohibited
- All data must be retrieved directly from public/private RPC nodes using free-tier services (quicknode, infura, alchemy)

## Submission Requirements
1. Source code with setup instructions
2. Performance test results demonstrating compliance with technical requirements


## All transaction types
P2PKH, P2SH, P2SH-P2WPKH, P2WPKH
