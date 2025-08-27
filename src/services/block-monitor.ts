import { BitcoinRPCClient } from "./rpc-client";
import { BlockParser } from "./block-parser";
import { AddressDetector } from "./address-detector";
import { NotificationService } from "./notification-service";
import {
  Config,
  RawBlock,
  Transaction,
  TransactionNotification,
  WatchedAddresses,
} from "../types/bitcoin";

export class BlockMonitor {
  private rpcClient: BitcoinRPCClient;
  private blockParser: BlockParser;
  private addressDetector: AddressDetector;
  private notificationService: NotificationService;
  private config: Config;
  private isRunning: boolean = false;
  private lastProcessedBlock: number = 0;
  private pollingTimer?: NodeJS.Timeout;

  constructor(config: Config) {
    this.config = config;

    this.rpcClient = new BitcoinRPCClient(config.rpcUrl);

    this.blockParser = new BlockParser();

    const watchedAddresses: WatchedAddresses = {};

    config.addresses.forEach((addr) => {
      watchedAddresses[addr.address] = addr.name || addr.address;
    });

    this.addressDetector = new AddressDetector(watchedAddresses, this.rpcClient);
    this.notificationService = new NotificationService(config.usdPriceEnabled);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("Block monitor is already running");
      return;
    }

    try {
      await this.rpcClient.ping();
      console.log("Connected to Bitcoin RPC node successfully");
      const blockchainInfo = await this.rpcClient.getBlockchainInfo();
      this.lastProcessedBlock = blockchainInfo.blocks - 1;

      console.log(`Starting monitor from block ${this.lastProcessedBlock}`);

      await this.notificationService.sendSystemNotification(
        "info",
        "Bitcoin Transaction Scanner started",
        {
          current_block: this.lastProcessedBlock,
          watched_addresses: this.config.addresses.length,
          polling_interval_ms: this.config.pollingIntervalMs,
        }
      );

      this.isRunning = true;
      this.scheduleNextPoll();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to start block monitor:", errorMessage);

      await this.notificationService.sendSystemNotification(
        "error",
        "Failed to start Bitcoin Transaction Scanner",
        { error: errorMessage }
      );

      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }

    await this.notificationService.sendSystemNotification(
      "info",
      "Bitcoin Transaction Scanner stopped",
      { last_processed_block: this.lastProcessedBlock }
    );

    console.log("Block monitor stopped");
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollingTimer = setTimeout(async () => {
      try {
        await this.pollForNewBlocks();
      } catch (error) {
        console.error("Error during block polling:", error);

        await this.notificationService.sendSystemNotification(
          "error",
          "Block polling error",
          { error: error instanceof Error ? error.message : "Unknown error" }
        );
      }

      this.scheduleNextPoll();
    }, this.config.pollingIntervalMs);
  }

  private async pollForNewBlocks(): Promise<void> {
    const startTime = Date.now();

    try {
      const blockchainInfo = await this.rpcClient.getBlockchainInfo();
      const currentBlock = blockchainInfo.blocks;

      if (currentBlock > this.lastProcessedBlock) {
        console.log(`New blocks detected: ${currentBlock}`);

        // Обрабатываем все пропущенные блоки последовательно для экономии RAM
        for (
          let blockHeight = this.lastProcessedBlock + 1;
          blockHeight <= currentBlock;
          blockHeight++
        ) {
          await this.processBlock(blockHeight, startTime);
          this.lastProcessedBlock = blockHeight;

          const memoryCheck = this.blockParser.checkMemoryLimit(
            this.config.maxMemoryMB
          );

          if (memoryCheck.isOverLimit) {
            await this.notificationService.sendSystemNotification(
              "error",
              "Memory limit exceeded",
              {
                usage_mb: memoryCheck.usage,
                limit_mb: this.config.maxMemoryMB,
                block_height: blockHeight,
              }
            );

            if (global.gc) {
              global.gc();
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to poll for new blocks:", error);
      throw error;
    }
  }

  private async processBlock(
    blockHeight: number,
    monitoringStartTime: number
  ): Promise<void> {
    const blockStartTime = Date.now();

    try {
      const blockHash = await this.rpcClient.getBlockHash(blockHeight);
      const block = await this.rpcClient.getBlock(blockHash);

      let transactionCount = 0;
      let addressesMatched = 0;

      for await (const transaction of this.blockParser.parseBlockTransactions(
        block
      )) {
        transactionCount++;

        const detectionResult =
          await this.addressDetector.detectAddressesInTransaction(transaction);

        if (detectionResult.hasWatchedAddress) {
          addressesMatched++;

          const notification = await this.createTransactionNotification(
            transaction,
            block,
            detectionResult
          );

          await this.notificationService.sendTransactionNotification(
            notification
          );
        }

        // Периодически проверяем использование памяти
        if (transactionCount % 100 === 0) {
          const memoryCheck = this.blockParser.checkMemoryLimit(
            this.config.maxMemoryMB
          );
          if (memoryCheck.usage > this.config.maxMemoryMB * 0.9) {
            if (global.gc) {
              global.gc();
            }
          }
        }
      }

      const metrics = this.blockParser.calculatePerformanceMetrics(
        blockStartTime,
        transactionCount,
        addressesMatched
      );

      await this.notificationService.sendPerformanceMetrics({
        memory_usage_mb: metrics.memory.heapUsed / (1024 * 1024),
        block_processing_time_ms: metrics.blockProcessingTimeMs,
        transaction_count: metrics.transactionCount,
        addresses_matched: metrics.addressesMatched,
        notification_latency_ms: Date.now() - monitoringStartTime,
      });

      if (addressesMatched > 0) {
        console.log(`✅ Block ${blockHeight}: Found ${addressesMatched} matched transactions from ${transactionCount} total`);
      }
    } catch (error) {
      console.error(`Failed to process block ${blockHeight}:`, error);

      await this.notificationService.sendSystemNotification(
        "error",
        `Failed to process block ${blockHeight}`,
        { error: error instanceof Error ? error.message : "Unknown error" }
      );

      throw error;
    }
  }

  private async createTransactionNotification(
    transaction: Transaction,
    block: RawBlock,
    detectionResult: Awaited<
      ReturnType<AddressDetector["detectAddressesInTransaction"]>
    >
  ): Promise<TransactionNotification> {
    const totalBTC = this.addressDetector.calculateTotalBTC(
      detectionResult.addressInvolvements
    );

    const balanceDifference =
      detectionResult.transactionType === "both"
        ? this.addressDetector.calculateBalanceDifference(
            detectionResult.addressInvolvements
          )
        : undefined;

    const opReturnData = this.blockParser.extractOpReturnData(transaction);

    return {
      timestamp: Date.now(),
      blockHeight: block.height,
      blockHash: block.hash,
      txHash: transaction.txid,
      type: detectionResult.transactionType,
      addresses: detectionResult.addressInvolvements,
      totalBTC,
      balanceDifference,
      opReturnData: opReturnData || undefined,
    };
  }

  updateWatchedAddresses(addresses: WatchedAddresses): void {
    this.addressDetector.updateWatchedAddresses(addresses);
    console.log(
      `Updated watched addresses: ${Object.keys(addresses).length} addresses`
    );
  }

  getStatus(): {
    isRunning: boolean;
    lastProcessedBlock: number;
    watchedAddresses: number;
    memoryUsage: number;
  } {
    const memoryUsage = process.memoryUsage().heapUsed / (1024 * 1024);

    return {
      isRunning: this.isRunning,
      lastProcessedBlock: this.lastProcessedBlock,
      watchedAddresses: this.config.addresses.length,
      memoryUsage,
    };
  }
}
