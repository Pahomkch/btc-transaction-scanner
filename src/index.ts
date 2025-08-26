#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { BlockMonitor } from './services/block-monitor';
import { Config } from './types/bitcoin';

/**
 * Главный файл Bitcoin Transaction Scanner
 *
 * Этот бот мониторит Bitcoin блоки в real-time и отправляет уведомления
 * о транзакциях с отслеживаемыми адресами в stdout в JSON формате
 */

class BitcoinTransactionScanner {
  private monitor: BlockMonitor;
  private config: Config;

  constructor() {
    // Загружаем конфигурацию при инициализации
    this.config = this.loadConfiguration();
    this.monitor = new BlockMonitor(this.config);

    // Настраиваем обработчики системных сигналов для graceful shutdown
    this.setupSignalHandlers();
  }

  /**
   * Загружает конфигурацию из файла или переменных окружения
   */
  private loadConfiguration(): Config {
    let config: Config;

    try {
      // Пытаемся загрузить из файла конфигурации
      const configPath = process.env.CONFIG_PATH ||
        path.join(__dirname, '../src/config/config.json');

      if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configFile);
        console.log(`Configuration loaded from: ${configPath}`);
      } else {
        throw new Error('Config file not found');
      }

    } catch (error) {
      console.warn('Failed to load config file, using environment variables');

      // Fallback на переменные окружения
      config = {
        rpcUrl: process.env.BTC_RPC_URL || 'http://localhost:8332',
        addresses: this.parseAddressesFromEnv(),
        pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
        maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB || '512'),
        usdPriceEnabled: process.env.USD_PRICE_ENABLED === 'true',
        logLevel: (process.env.LOG_LEVEL as any) || 'info'
      };
    }

    // Валидируем конфигурацию
    this.validateConfiguration(config);

    return config;
  }

  /**
   * Парсит адреса из переменных окружения
   */
  private parseAddressesFromEnv(): Config['addresses'] {
    const addressesEnv = process.env.WATCHED_ADDRESSES;
    if (!addressesEnv) {
      throw new Error('No addresses configured. Set WATCHED_ADDRESSES environment variable');
    }

    try {
      return JSON.parse(addressesEnv);
    } catch (error) {
      // Если не JSON, попробуем парсить как простой список адресов
      const addresses = addressesEnv.split(',').map(addr => addr.trim());
      return addresses.map(address => ({
        address,
        name: address,
        type: 'legacy' as const // По умолчанию считаем legacy
      }));
    }
  }

  /**
   * Валидирует конфигурацию перед стартом
   */
  private validateConfiguration(config: Config): void {
    if (!config.rpcUrl) {
      throw new Error('RPC URL is required');
    }

    if (!config.addresses || config.addresses.length === 0) {
      throw new Error('At least one address must be configured');
    }

    if (config.addresses.length > 1000) {
      console.warn(`Warning: ${config.addresses.length} addresses configured. Performance may be impacted.`);
    }

    if (config.pollingIntervalMs < 1000) {
      console.warn('Warning: Very short polling interval may cause rate limiting');
    }

    if (config.maxMemoryMB < 128) {
      console.warn('Warning: Memory limit is very low, may cause performance issues');
    }

    console.log('Configuration validated successfully');
    console.log(`- RPC URL: ${config.rpcUrl}`);
    console.log(`- Watched addresses: ${config.addresses.length}`);
    console.log(`- Polling interval: ${config.pollingIntervalMs}ms`);
    console.log(`- Memory limit: ${config.maxMemoryMB}MB`);
    console.log(`- USD conversion: ${config.usdPriceEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Настраивает обработчики системных сигналов для graceful shutdown
   */
  private setupSignalHandlers(): void {
    // Обработка Ctrl+C
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await this.shutdown();
    });

    // Обработка TERM сигнала
    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await this.shutdown();
    });

    // Обработка необработанных исключений
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Обработка необработанных отклоненных промисов
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  /**
   * Запускает мониторинг Bitcoin блоков
   * Async функция для неблокирующего старта
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Bitcoin Transaction Scanner...');
      console.log('📡 Connecting to Bitcoin network...');

      // Запускаем мониторинг блоков
      // Async start позволяет обрабатывать другие события пока идет подключение
      await this.monitor.start();

      console.log('✅ Bitcoin Transaction Scanner is running');
      console.log('📊 Watching for transactions on configured addresses...');
      console.log('📄 Transaction notifications will be logged to stdout as JSON');
      console.log('🔄 Press Ctrl+C to stop');

      // Выводим статус каждые 30 секунд
      this.startStatusReporting();

    } catch (error) {
      console.error('❌ Failed to start Bitcoin Transaction Scanner:', error);
      process.exit(1);
    }
  }

  /**
   * Периодически выводит статус работы сканера
   */
  private startStatusReporting(): void {
    setInterval(() => {
      const status = this.monitor.getStatus();
      console.log(`📈 Status: Block ${status.lastProcessedBlock}, ` +
                 `${status.watchedAddresses} addresses, ` +
                 `${status.memoryUsage.toFixed(1)}MB memory`);
    }, 30000); // Каждые 30 секунд
  }

  /**
   * Graceful shutdown сканера
   */
  private async shutdown(): Promise<void> {
    try {
      console.log('🛑 Stopping Bitcoin Transaction Scanner...');

      // Останавливаем мониторинг
      await this.monitor.stop();

      console.log('✅ Bitcoin Transaction Scanner stopped successfully');
      process.exit(0);

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

/**
 * Точка входа в приложение
 */
async function main(): Promise<void> {
  // Показываем banner при запуске
  console.log('');
  console.log('██████╗ ████████╗ ██████╗    ███████╗ ██████╗ █████╗ ███╗   ██╗███╗   ██╗███████╗██████╗ ');
  console.log('██╔══██╗╚══██╔══╝██╔════╝    ██╔════╝██╔════╝██╔══██╗████╗  ██║████╗  ██║██╔════╝██╔══██╗');
  console.log('██████╔╝   ██║   ██║         ███████╗██║     ███████║██╔██╗ ██║██╔██╗ ██║█████╗  ██████╔╝');
  console.log('██╔══██╗   ██║   ██║         ╚════██║██║     ██╔══██║██║╚██╗██║██║╚██╗██║██╔══╝  ██╔══██╗');
  console.log('██████╔╝   ██║   ╚██████╗    ███████║╚██████╗██║  ██║██║ ╚████║██║ ╚████║███████╗██║  ██║');
  console.log('╚═════╝    ╚═╝    ╚═════╝    ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝');
  console.log('');
  console.log('🔍 Bitcoin Transaction Scanner v1.0.0');
  console.log('📝 Real-time monitoring of Bitcoin addresses with JSON notifications');
  console.log('⚡ Built with TypeScript for performance and reliability');
  console.log('');

  // Создаем и запускаем сканер
  const scanner = new BitcoinTransactionScanner();
  await scanner.start();
}

// Запускаем приложение только если этот файл запущен напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { BitcoinTransactionScanner };
