# Bitcoin Transaction Scanner - Data Flow Diagram

```mermaid
flowchart TD
    %% Initial Setup Phase
    A[👤 User runs npm start] --> B[🚀 BitcoinTransactionScanner.constructor]
    B --> C[📄 Load Config from file/env]
    C --> D[✅ Validate Config addresses, RPC, limits]
    D --> E[🔧 Create BlockMonitor + all services]
    E --> F[📡 scanner.start]
    
    %% Services Initialization
    F --> G[🔌 RPC Client connects to QuickNode]
    G --> H[📊 Get current blockchain height]
    H --> I[🏃 Start polling timer every 5 seconds]
    
    %% Main Timer Loop
    I --> J{⏰ Timer triggers every 5s}
    J --> K[🔍 BlockMonitor.pollForNewBlocks]
    
    %% Block Discovery
    K --> L[📈 RPC: getBlockchainInfo]
    L --> M{🆕 New blocks found?}
    M -->|No| N[😴 Wait for next timer cycle]
    M -->|Yes| O[📦 Process each new block]
    
    %% Block Processing
    O --> P[🔗 RPC: getBlockHash by height]
    P --> Q[📋 RPC: getBlock with full transactions]
    Q --> R[🔄 BlockParser: Stream transactions one by one]
    
    %% Transaction Analysis
    R --> S[🔍 For each transaction]
    S --> T[🏷️ AddressDetector: Extract all addresses from tx]
    T --> U{🎯 Contains watched addresses?}
    U -->|No| V[➡️ Next transaction]
    U -->|Yes| W[💰 Calculate amounts, balance diff]
    
    %% Notification Generation
    W --> X[📝 Create TransactionNotification object]
    X --> Y[💱 USD conversion if enabled]
    Y --> Z[📤 NotificationService: Send JSON to stdout]
    Z --> AA[📊 Performance metrics logging]
    
    %% Memory Management
    AA --> BB{💾 Memory usage check}
    BB -->|OK| CC[🔄 Continue to next tx]
    BB -->|High| DD[🗑️ Force garbage collection]
    DD --> CC
    
    %% Loop Continuation
    CC --> S
    V --> S
    N --> J
    
    %% External Components
    EE[🌐 Bitcoin Network] -.->|New blocks every ~10min| G
    FF[🏦 QuickNode RPC Provider] <-.->|getBlock, getBlockHash| G
    GG[💲 CoinGecko API] -.->|BTC price| Y
    HH[📟 stdout JSON logs] <-- Z
    
    %% Error Handling
    II[❌ RPC Error] --> JJ[🔄 Exponential backoff retry]
    JJ --> K
    
    KK[💥 Memory limit exceeded] --> LL[⚠️ Warning notification]
    LL --> DD
    
    %% Graceful Shutdown
    MM[🛑 SIGINT/SIGTERM] --> NN[🏁 Graceful shutdown]
    NN --> OO[📊 Final metrics]
    OO --> PP[✅ Process exit]

    %% Styling
    classDef userAction fill:#e1f5fe
    classDef systemService fill:#f3e5f5
    classDef rpcCall fill:#fff3e0
    classDef processing fill:#e8f5e8
    classDef output fill:#fce4ec
    classDef timer fill:#f1f8e9
    
    class A,MM userAction
    class B,E,I,K systemService
    class G,L,P,Q rpcCall
    class R,S,T,W,X,Y processing
    class Z,HH,AA output
    class J,N timer
```

## 📋 Detailed Component Flow

### 🚀 **Startup Phase (Once)**
1. **User Input** → `npm start` запускает main()
2. **Constructor** → Создает все сервисы и загружает конфиг
3. **Config Loading** → Читает JSON файл или env переменные  
4. **Service Init** → Создает RPC client, parsers, detectors
5. **Connection** → Подключается к QuickNode Bitcoin RPC
6. **Baseline** → Получает текущую высоту блокчейна

### ⏰ **Timer Loop (Every 5 seconds)**
```
Timer → BlockMonitor → RPC Call → Block Processing → Notifications
```

### 🔄 **Block Processing Pipeline**
```
Raw Block Data → Stream Parser → Address Detection → Notification → stdout
```

### 📊 **Memory Management**
- Каждые 100 транзакций: проверка памяти
- При превышении 80% лимита: garbage collection  
- При превышении лимита: warning уведомление

### 🎯 **Key Service Interactions**

| Service | Responsibility | Input | Output |
|---------|---------------|-------|---------|
| **RPC Client** | Bitcoin network communication | Block height, hash | Raw block data |
| **Block Parser** | Raw data processing | Bitcoin block | Transaction stream |
| **Address Detector** | Pattern matching | Transaction + watched addresses | Match results |
| **Notification Service** | Output formatting | Transaction matches | JSON stdout |

### 💡 **Critical Async Points**
1. **RPC calls** - Network latency, retry logic
2. **Block streaming** - Memory-efficient processing
3. **Address lookup** - O(1) Set operations
4. **USD conversion** - External API calls
5. **JSON logging** - Non-blocking stdout

### 🔥 **Performance Optimizations**
- **Streaming**: No full block caching (512MB limit)
- **Set lookup**: O(1) address detection (1000+ addresses)
- **Async processing**: Parallel transaction analysis
- **Memory monitoring**: Proactive garbage collection
- **Retry logic**: Handles free-tier RPC limits
