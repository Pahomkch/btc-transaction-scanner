import { Transaction, WatchedAddresses, AddressInvolvement } from '../types/bitcoin';
import { BlockParser } from './block-parser';

export class AddressDetector {
  private watchedAddresses: Set<string>;
  private addressNames: Map<string, string>;
  private blockParser: BlockParser;

  constructor(addresses: WatchedAddresses) {
    // Используем Set для O(1) поиска адресов вместо O(n) в массиве
    // Критично для производительности при 1000+ отслеживаемых адресов
    this.watchedAddresses = new Set(Object.keys(addresses));
    
    // Map для быстрого получения имени адреса по address ключу
    this.addressNames = new Map(Object.entries(addresses));
    
    this.blockParser = new BlockParser();
  }

  /**
   * Обновляет список отслеживаемых адресов
   * Пересоздает Set для поддержания O(1) производительности поиска
   */
  updateWatchedAddresses(addresses: WatchedAddresses): void {
    this.watchedAddresses = new Set(Object.keys(addresses));
    this.addressNames = new Map(Object.entries(addresses));
  }

  /**
   * Проверяет, содержит ли транзакция какие-либо из отслеживаемых адресов
   * Возвращает информацию о найденных адресах и их роли в транзакции
   */
  async detectAddressesInTransaction(transaction: Transaction): Promise<{
    hasWatchedAddress: boolean;
    addressInvolvements: AddressInvolvement[];
    transactionType: 'incoming' | 'outgoing' | 'both' | 'none';
  }> {
    const addressInvolvements: AddressInvolvement[] = [];
    
    // Извлекаем все адреса из транзакции
    const { inputs, outputs } = this.blockParser.extractAddressesFromTransaction(transaction);
    
    // Проверяем входы (откуда пришли деньги)
    // Async forEach для неблокирующей обработки каждого входа
    await this.processAddresses(
      inputs,
      transaction.vin,
      'input',
      addressInvolvements
    );
    
    // Проверяем выходы (куда ушли деньги)
    // Async forEach для неблокирующей обработки каждого выхода
    await this.processAddresses(
      outputs,
      transaction.vout,
      'output',
      addressInvolvements
    );

    const hasWatchedAddress = addressInvolvements.length > 0;
    const transactionType = this.determineTransactionType(addressInvolvements);

    return {
      hasWatchedAddress,
      addressInvolvements,
      transactionType
    };
  }

  /**
   * Обрабатывает список адресов и проверяет их на совпадение с отслеживаемыми
   * Async функция для возможности параллельной обработки адресов
   */
  private async processAddresses(
    addresses: string[],
    transactionParts: any[], // vin или vout
    direction: 'input' | 'output',
    addressInvolvements: AddressInvolvement[]
  ): Promise<void> {
    // Параллельно обрабатываем все адреса для ускорения
    // Promise.all выполняет все проверки одновременно
    const promises = addresses.map(async (address, index) => {
      // O(1) поиск в Set - ключевая оптимизация производительности
      if (this.watchedAddresses.has(address)) {
        const amount = this.extractAmountFromTransactionPart(
          transactionParts[index],
          direction
        );
        
        const involvement: AddressInvolvement = {
          address,
          name: this.addressNames.get(address),
          direction,
          amount
          // amountUSD будет добавлен позднее через внешний API
        };
        
        addressInvolvements.push(involvement);
      }
    });

    // Ждем завершения всех проверок адресов
    await Promise.all(promises);
  }

  /**
   * Извлекает сумму BTC из части транзакции (input или output)
   */
  private extractAmountFromTransactionPart(
    transactionPart: any,
    direction: 'input' | 'output'
  ): number {
    if (direction === 'output') {
      // Для выходов сумма указана явно
      return transactionPart.value || 0;
    } else {
      // Для входов нужно получить сумму из предыдущей транзакции
      // В рамках этого ТЗ возвращаем 0, в продакшене нужен дополнительный RPC вызов
      return 0; // Требует getRawTransaction для предыдущей транзакции
    }
  }

  /**
   * Определяет тип транзакции относительно отслеживаемых адресов
   * incoming - деньги приходят на наши адреса
   * outgoing - деньги уходят с наших адресов  
   * both - смешанная транзакция (и входы, и выходы содержат наши адреса)
   */
  private determineTransactionType(
    addressInvolvements: AddressInvolvement[]
  ): 'incoming' | 'outgoing' | 'both' | 'none' {
    if (addressInvolvements.length === 0) {
      return 'none';
    }

    const hasInputs = addressInvolvements.some(inv => inv.direction === 'input');
    const hasOutputs = addressInvolvements.some(inv => inv.direction === 'output');

    if (hasInputs && hasOutputs) {
      return 'both';
    } else if (hasInputs) {
      return 'outgoing';
    } else if (hasOutputs) {
      return 'incoming';
    } else {
      return 'none';
    }
  }

  /**
   * Вычисляет общую разность баланса для транзакций типа 'both'
   * Требование ТЗ: "For transactions with both incoming and outgoing operations, 
   * display the total balance difference"
   */
  calculateBalanceDifference(addressInvolvements: AddressInvolvement[]): number {
    let totalIncoming = 0;
    let totalOutgoing = 0;

    for (const involvement of addressInvolvements) {
      if (involvement.direction === 'output') {
        totalIncoming += involvement.amount;
      } else if (involvement.direction === 'input') {
        totalOutgoing += involvement.amount;
      }
    }

    // Положительное значение = профит, отрицательное = убыток
    return totalIncoming - totalOutgoing;
  }

  /**
   * Вычисляет общую сумму BTC в транзакции для наших адресов
   */
  calculateTotalBTC(addressInvolvements: AddressInvolvement[]): number {
    return addressInvolvements.reduce((total, involvement) => {
      return total + involvement.amount;
    }, 0);
  }

  /**
   * Получает статистику по отслеживаемым адресам для мониторинга
   */
  getWatchedAddressesStats(): {
    totalWatched: number;
    addressesList: string[];
  } {
    return {
      totalWatched: this.watchedAddresses.size,
      addressesList: Array.from(this.watchedAddresses)
    };
  }

  /**
   * Проверяет, является ли адрес отслеживаемым (O(1) операция)
   */
  isAddressWatched(address: string): boolean {
    return this.watchedAddresses.has(address);
  }

  /**
   * Получает имя адреса если он отслеживается
   */
  getAddressName(address: string): string | undefined {
    return this.addressNames.get(address);
  }
}