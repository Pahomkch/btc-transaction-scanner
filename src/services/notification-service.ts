import { TransactionNotification, AddressInvolvement } from '../types/bitcoin';
import { createLogger, format, transports, Logger } from 'winston';
import axios from 'axios';

export class NotificationService {
  private logger: Logger;
  private usdPriceEnabled: boolean;
  private btcPriceUSD: number = 0;
  private lastPriceUpdate: number = 0;
  private readonly PRICE_CACHE_MS = 60000; // Кешируем цену на 1 минуту

  constructor(usdPriceEnabled: boolean = false) {
    this.usdPriceEnabled = usdPriceEnabled;
    
    // Настраиваем структурированное JSON логирование как требует ТЗ
    // "The bot must send notification to a stdout as json log"
    this.logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json() // Обязательно JSON формат для уведомлений
      ),
      transports: [
        new transports.Console() // Вывод в stdout как требует ТЗ
      ]
    });

    // Инициализируем цену BTC при старте если включена поддержка USD
    if (this.usdPriceEnabled) {
      this.updateBTCPrice().catch(error => {
        console.warn('Failed to initialize BTC price:', error.message);
      });
    }
  }

  /**
   * Отправляет уведомление о транзакции в stdout в формате JSON
   * Async функция для неблокирующей отправки уведомлений
   * позволяет продолжить обработку других транзакций пока отправляется уведомление
   */
  async sendTransactionNotification(
    notification: TransactionNotification
  ): Promise<void> {
    try {
      // Добавляем USD эквиваленты если включено в конфигурации
      // "Any amount of tokens also must have info about equity in USD (optional)"
      if (this.usdPriceEnabled) {
        await this.enrichWithUSDAmounts(notification);
      }

      // Структурированный JSON лог в stdout как требует ТЗ
      this.logger.info('transaction_detected', {
        event_type: 'bitcoin_transaction',
        timestamp: notification.timestamp,
        block: {
          height: notification.blockHeight,
          hash: notification.blockHash
        },
        transaction: {
          hash: notification.txHash,
          type: notification.type,
          total_btc: notification.totalBTC,
          total_usd: notification.totalUSD,
          balance_difference: notification.balanceDifference
        },
        addresses: notification.addresses.map(addr => ({
          address: addr.address,
          name: addr.name,
          direction: addr.direction,
          amount_btc: addr.amount,
          amount_usd: addr.amountUSD
        })),
        op_return_data: notification.opReturnData,
        processing_info: {
          notification_time: Date.now(),
          latency_ms: Date.now() - notification.timestamp
        }
      });

      // Async операция для возможного расширения функционала
      // (например, отправка в внешние системы мониторинга)
      await this.postProcessNotification(notification);

    } catch (error) {
      // Логируем ошибки отправки уведомлений без прерывания работы
      this.logger.error('notification_send_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transaction_hash: notification.txHash,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Добавляет USD эквиваленты к суммам в уведомлении
   * Async функция для получения актуального курса BTC/USD
   */
  private async enrichWithUSDAmounts(notification: TransactionNotification): Promise<void> {
    try {
      // Обновляем курс BTC если кеш устарел
      await this.updateBTCPriceIfNeeded();

      if (this.btcPriceUSD > 0) {
        // Добавляем USD эквивалент к общей сумме
        notification.totalUSD = notification.totalBTC * this.btcPriceUSD;

        // Добавляем USD эквиваленты к каждому адресу
        // Promise.all для параллельного обогащения всех адресов
        await Promise.all(
          notification.addresses.map(async (address) => {
            address.amountUSD = address.amount * this.btcPriceUSD;
          })
        );
      }
    } catch (error) {
      // Не прерываем отправку уведомления из-за проблем с получением курса
      console.warn('Failed to enrich with USD amounts:', error);
    }
  }

  /**
   * Обновляет кешированный курс BTC/USD если необходимо
   * Async функция для неблокирующего HTTP запроса к API
   */
  private async updateBTCPriceIfNeeded(): Promise<void> {
    const now = Date.now();
    const cacheAge = now - this.lastPriceUpdate;

    // Обновляем курс если кеш устарел или еще не инициализирован
    if (cacheAge > this.PRICE_CACHE_MS || this.btcPriceUSD === 0) {
      await this.updateBTCPrice();
    }
  }

  /**
   * Получает текущий курс BTC/USD с публичного API
   * Async HTTP запрос - не блокирует event loop пока ждем ответ
   */
  private async updateBTCPrice(): Promise<void> {
    try {
      // Используем бесплатный API CoinGecko для получения курса BTC
      // Timeout 5 секунд чтобы не блокировать обработку блоков
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        { timeout: 5000 }
      );

      if (response.data?.bitcoin?.usd) {
        this.btcPriceUSD = response.data.bitcoin.usd;
        this.lastPriceUpdate = Date.now();
        
        console.debug(`BTC price updated: $${this.btcPriceUSD}`);
      }
    } catch (error) {
      // Логируем ошибки получения курса без прерывания работы
      console.warn('Failed to update BTC price:', error);
    }
  }

  /**
   * Дополнительная обработка уведомления после отправки
   * Async функция для возможных расширений (метрики, архивирование и т.д.)
   */
  private async postProcessNotification(notification: TransactionNotification): Promise<void> {
    // Здесь можно добавить:
    // - Отправку метрик в систему мониторинга
    // - Сохранение уведомлений в базу данных
    // - Интеграцию с внешними системами алертов
    
    // Для демо просто логируем факт обработки
    console.debug(`Notification processed for tx: ${notification.txHash}`);
  }

  /**
   * Отправляет уведомление о системных событиях (ошибки, статус)
   */
  async sendSystemNotification(
    level: 'info' | 'warn' | 'error',
    message: string,
    metadata?: any
  ): Promise<void> {
    this.logger.log(level, 'system_event', {
      event_type: 'system_notification',
      message,
      timestamp: Date.now(),
      metadata
    });
  }

  /**
   * Отправляет метрики производительности
   * Важно для мониторинга соответствия требованиям ТЗ
   */
  async sendPerformanceMetrics(metrics: {
    memory_usage_mb: number;
    block_processing_time_ms: number;
    transaction_count: number;
    addresses_matched: number;
    notification_latency_ms: number;
  }): Promise<void> {
    this.logger.info('performance_metrics', {
      event_type: 'performance_data',
      timestamp: Date.now(),
      metrics
    });
  }

  /**
   * Получает текущий кешированный курс BTC/USD
   */
  getCurrentBTCPrice(): number {
    return this.btcPriceUSD;
  }

  /**
   * Проверяет, включена ли поддержка USD конвертации
   */
  isUSDEnabled(): boolean {
    return this.usdPriceEnabled;
  }

  /**
   * Включает/выключает поддержку USD конвертации
   */
  setUSDEnabled(enabled: boolean): void {
    this.usdPriceEnabled = enabled;
    
    if (enabled && this.btcPriceUSD === 0) {
      // Инициализируем цену если включили USD поддержку
      this.updateBTCPrice().catch(error => {
        console.warn('Failed to initialize BTC price:', error.message);
      });
    }
  }
}