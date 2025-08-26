import axios, { AxiosInstance } from 'axios';
import { RPCResponse, RPCError, RawBlock } from '../types/bitcoin';

export class BitcoinRPCClient {
  private client: AxiosInstance;
  private requestId = 0;

  constructor(
    private rpcUrl: string,
    private username?: string,
    private password?: string
  ) {
    // Создаем HTTP клиент для RPC вызовов
    // Используем axios для удобной работы с HTTP запросами
    this.client = axios.create({
      baseURL: this.rpcUrl,
      timeout: 30000, // 30 секунд таймаут для RPC вызовов
      headers: {
        'Content-Type': 'application/json',
      },
      // Базовая авторизация если предоставлены credentials
      auth: this.username ? {
        username: this.username,
        password: this.password || ''
      } : undefined
    });
  }

  /**
   * Выполняет RPC вызов с автоматическими повторами для надежности
   * Async используется потому что RPC вызовы по сети могут занимать время
   * и мы не хотим блокировать event loop пока ждем ответ
   */
  private async callRPC<T>(
    method: string,
    params: any[] = [],
    retries = 3
  ): Promise<T> {
    const requestId = (++this.requestId).toString();
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params
    };

    // Повторяем запрос при ошибках сети/RPC для надежности
    // Особенно важно для бесплатных RPC провайдеров с лимитами
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Async вызов HTTP запроса - освобождает event loop
        // пока ждем ответ от Bitcoin RPC ноды
        const response = await this.client.post<RPCResponse<T>>('', payload);
        
        if (response.data.error) {
          throw new Error(`RPC Error: ${response.data.error.message}`);
        }

        return response.data.result;
      } catch (error) {
        const isLastAttempt = attempt === retries;
        
        if (isLastAttempt) {
          throw error;
        }

        // Exponential backoff для повторных попыток
        // Помогает избежать rate limiting на бесплатных планах
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        console.warn(`RPC call failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`, error);
        
        // Async задержка без блокировки event loop
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('All RPC retry attempts failed');
  }

  /**
   * Получает информацию о текущем состоянии блокчейна
   * Возвращает номер последнего блока, количество подключений и другую мета-информацию
   */
  async getBlockchainInfo(): Promise<{
    blocks: number;
    headers: number;
    bestblockhash: string;
    difficulty: number;
    mediantime: number;
    verificationprogress: number;
    chainwork: string;
    size_on_disk: number;
    warnings: string;
  }> {
    return this.callRPC('getblockchaininfo');
  }

  /**
   * Получает хеш блока по его номеру (высоте)
   * Необходимо для получения последних блоков по номеру
   */
  async getBlockHash(height: number): Promise<string> {
    return this.callRPC('getblockhash', [height]);
  }

  /**
   * Получает данные блока по его хешу
   * verbosity=2 возвращает полную информацию о блоке включая транзакции
   * Это основной метод для получения данных о транзакциях
   */
  async getBlock(blockHash: string): Promise<RawBlock> {
    // verbosity=2 возвращает блок с полными объектами транзакций
    // verbosity=1 возвращает только txid, verbosity=0 - raw hex
    return this.callRPC('getblock', [blockHash, 2]);
  }

  /**
   * Получает информацию о конкретной транзакции по txid
   * Может потребоваться для дополнительной информации о транзакции
   */
  async getRawTransaction(txid: string): Promise<any> {
    // verbose=true возвращает декодированную транзакцию
    return this.callRPC('getrawtransaction', [txid, true]);
  }

  /**
   * Проверяет соединение с RPC нодой
   * Полезно для диагностики подключения
   */
  async ping(): Promise<void> {
    await this.callRPC('ping');
  }

  /**
   * Получает количество подключений к сети
   * Помогает определить здоровье соединения с Bitcoin сетью
   */
  async getConnectionCount(): Promise<number> {
    return this.callRPC('getconnectioncount');
  }
}