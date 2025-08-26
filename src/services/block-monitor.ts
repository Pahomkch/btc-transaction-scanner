import { BitcoinRPCClient } from './rpc-client';
import { BlockParser } from './block-parser';
import { AddressDetector } from './address-detector';
import { NotificationService } from './notification-service';
import { Config, TransactionNotification, WatchedAddresses } from '../types/bitcoin';

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
    
    // Инициализируем все сервисы
    this.rpcClient = new BitcoinRPCClient(
      config.rpcUrl,
      config.rpcUser,
      config.rpcPassword
    );
    
    this.blockParser = new BlockParser();
    
    // Создаем Map адресов для O(1) поиска
    const watchedAddresses: WatchedAddresses = {};
    config.addresses.forEach(addr => {
      watchedAddresses[addr.address] = addr.name || addr.address;
    });
    
    this.addressDetector = new AddressDetector(watchedAddresses);
    this.notificationService = new NotificationService(config.usdPriceEnabled);
  }

  /**
   * Запускает мониторинг новых блоков
   * Async функция для неблокирующего старта мониторинга
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Block monitor is already running');
      return;
    }

    try {
      // Проверяем подключение к RPC ноде
      await this.rpcClient.ping();
      console.log('Connected to Bitcoin RPC node successfully');

      // Получаем информацию о текущем состоянии блокчейна
      const blockchainInfo = await this.rpcClient.getBlockchainInfo();
      this.lastProcessedBlock = blockchainInfo.blocks;
      
      console.log(`Starting monitor from block ${this.lastProcessedBlock}`);
      
      // Отправляем системное уведомление о старте
      await this.notificationService.sendSystemNotification(
        'info',
        'Bitcoin Transaction Scanner started',
        {
          current_block: this.lastProcessedBlock,
          watched_addresses: this.config.addresses.length,
          polling_interval_ms: this.config.pollingIntervalMs
        }
      );

      this.isRunning = true;
      
      // Запускаем циклический мониторинг
      // Async функция позволяет не блокировать главный поток
      this.scheduleNextPoll();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to start block monitor:', errorMessage);
      
      await this.notificationService.sendSystemNotification(
        'error',
        'Failed to start Bitcoin Transaction Scanner',
        { error: errorMessage }
      );
      
      throw error;
    }
  }

  /**
   * Останавливает мониторинг блоков
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }

    await this.notificationService.sendSystemNotification(
      'info',
      'Bitcoin Transaction Scanner stopped',
      { last_processed_block: this.lastProcessedBlock }
    );

    console.log('Block monitor stopped');
  }

  /**
   * Планирует следующий цикл проверки блоков
   * Использует setTimeout вместо setInterval для избежания накопления задач
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    // Async setTimeout - не блокирует event loop
    // Позволяет обрабатывать другие события пока ждем следующий цикл
    this.pollingTimer = setTimeout(async () => {
      try {
        await this.pollForNewBlocks();
      } catch (error) {
        console.error('Error during block polling:', error);
        
        await this.notificationService.sendSystemNotification(
          'error',
          'Block polling error',
          { error: error instanceof Error ? error.message : 'Unknown error' }
        );
      }
      
      // Планируем следующий цикл независимо от результата
      this.scheduleNextPoll();
      
    }, this.config.pollingIntervalMs);
  }

  /**
   * Проверяет наличие новых блоков и обрабатывает их
   * Async функция для неблокирующей обработки блоков
   */
  private async pollForNewBlocks(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Получаем информацию о текущем состоянии блокчейна
      // Async вызов - не блокирует event loop пока ждем ответ RPC
      const blockchainInfo = await this.rpcClient.getBlockchainInfo();
      const currentBlock = blockchainInfo.blocks;

      // Проверяем есть ли новые блоки для обработки
      if (currentBlock > this.lastProcessedBlock) {
        console.log(`New blocks detected: ${this.lastProcessedBlock + 1} to ${currentBlock}`);
        
        // Обрабатываем все пропущенные блоки
        // Promise.all НЕ используем чтобы не превысить лимит памяти
        // Обрабатываем блоки последовательно для экономии RAM
        for (let blockHeight = this.lastProcessedBlock + 1; blockHeight <= currentBlock; blockHeight++) {
          await this.processBlock(blockHeight, startTime);
          
          // Обновляем последний обработанный блок
          this.lastProcessedBlock = blockHeight;
          
          // Проверяем лимит памяти после каждого блока
          const memoryCheck = this.blockParser.checkMemoryLimit(this.config.maxMemoryMB);
          if (memoryCheck.isOverLimit) {
            await this.notificationService.sendSystemNotification(
              'error',
              'Memory limit exceeded',
              { 
                usage_mb: memoryCheck.usage,
                limit_mb: this.config.maxMemoryMB,
                block_height: blockHeight
              }
            );
            
            // Принудительная сборка мусора при превышении лимита
            if (global.gc) {
              global.gc();
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Failed to poll for new blocks:', error);
      throw error;
    }
  }

  /**
   * Обрабатывает конкретный блок и ищет транзакции с отслеживаемыми адресами
   * Async функция для неблокирующей обработки блока
   */
  private async processBlock(blockHeight: number, monitoringStartTime: number): Promise<void> {
    const blockStartTime = Date.now();
    
    try {
      // Получаем хеш блока по его высоте
      // Async RPC вызов - освобождает event loop пока ждем ответ
      const blockHash = await this.rpcClient.getBlockHash(blockHeight);
      
      // Получаем полную информацию о блоке включая транзакции
      // Async RPC вызов - может занять 1-2 секунды для больших блоков
      const block = await this.rpcClient.getBlock(blockHash);
      
      console.log(`Processing block ${blockHeight} with ${block.tx.length} transactions`);
      
      let transactionCount = 0;
      let addressesMatched = 0;
      
      // Обрабатываем транзакции в стриминг режиме для экономии памяти
      // Async generator позволяет обрабатывать по одной транзакции
      for await (const transaction of this.blockParser.parseBlockTransactions(block)) {
        transactionCount++;
        
        // Проверяем содержит ли транзакция наши адреса
        // Async функция для возможности параллельной обработки адресов
        const detectionResult = await this.addressDetector.detectAddressesInTransaction(transaction);
        
        if (detectionResult.hasWatchedAddress) {
          addressesMatched++;
          
          // Создаем уведомление о найденной транзакции
          const notification = await this.createTransactionNotification(
            transaction,
            block,
            detectionResult,
            monitoringStartTime
          );
          
          // Отправляем уведомление в stdout в JSON формате
          // Async отправка - не блокирует обработку следующих транзакций
          await this.notificationService.sendTransactionNotification(notification);
        }
        
        // Периодически проверяем использование памяти
        if (transactionCount % 100 === 0) {
          const memoryCheck = this.blockParser.checkMemoryLimit(this.config.maxMemoryMB);
          if (memoryCheck.usage > this.config.maxMemoryMB * 0.9) {
            // Принудительная сборка мусора при приближении к лимиту
            if (global.gc) {
              global.gc();
            }
          }
        }
      }
      
      // Вычисляем и отправляем метрики производительности
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
        notification_latency_ms: Date.now() - monitoringStartTime
      });
      
      console.log(`Block ${blockHeight} processed: ${transactionCount} txs, ${addressesMatched} matched`);
      
    } catch (error) {
      console.error(`Failed to process block ${blockHeight}:`, error);
      
      await this.notificationService.sendSystemNotification(
        'error',
        `Failed to process block ${blockHeight}`,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      
      throw error;
    }
  }

  /**
   * Создает объект уведомления о транзакции
   * Async функция для возможности добавления внешних данных
   */
  private async createTransactionNotification(
    transaction: any,
    block: any,
    detectionResult: any,
    monitoringStartTime: number
  ): Promise<TransactionNotification> {
    // Вычисляем общую сумму BTC для наших адресов
    const totalBTC = this.addressDetector.calculateTotalBTC(detectionResult.addressInvolvements);
    
    // Вычисляем разность баланса для транзакций типа 'both'
    const balanceDifference = detectionResult.transactionType === 'both' 
      ? this.addressDetector.calculateBalanceDifference(detectionResult.addressInvolvements)
      : undefined;
    
    // Извлекаем OP_RETURN данные если присутствуют
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
      opReturnData: opReturnData || undefined
    };
  }

  /**
   * Обновляет список отслеживаемых адресов без перезапуска мониторинга
   */
  updateWatchedAddresses(addresses: WatchedAddresses): void {
    this.addressDetector.updateWatchedAddresses(addresses);
    console.log(`Updated watched addresses: ${Object.keys(addresses).length} addresses`);
  }

  /**
   * Получает текущий статус мониторинга
   */
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
      memoryUsage
    };
  }
}