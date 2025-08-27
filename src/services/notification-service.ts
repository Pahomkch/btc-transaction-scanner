import { TransactionNotification, AddressInvolvement } from "../types/bitcoin";
import { createLogger, format, transports, Logger } from "winston";
import axios from "axios";

export class NotificationService {
  private logger: Logger;
  private usdPriceEnabled: boolean;
  private btcPriceUSD: number = 0;
  private lastPriceUpdate: number = 0;
  private readonly PRICE_CACHE_MS = 60000; // Кешируем цену на 1 минуту

  constructor(usdPriceEnabled: boolean = false) {
    this.usdPriceEnabled = usdPriceEnabled;

    this.logger = createLogger({
      level: "info",
      format: format.combine(format.timestamp(), format.json()),
      transports: [new transports.Console()],
    });

    if (this.usdPriceEnabled) {
      this.updateBTCPrice().catch((error) => {
        console.warn("Failed to initialize BTC price:", error.message);
      });
    }
  }

  async sendTransactionNotification(
    notification: TransactionNotification
  ): Promise<void> {
    try {
      if (this.usdPriceEnabled) {
        await this.enrichWithUSDAmounts(notification);
      }

      const readableMessage = this.createReadableMessage(notification);

      this.logger.info("transaction_detected", {
        comment: readableMessage,
        event_type: "bitcoin_transaction",
        timestamp: notification.timestamp,
        block: {
          height: notification.blockHeight,
          hash: notification.blockHash,
        },
        transaction: {
          hash: notification.txHash,
          type: notification.type,
          total_btc: notification.totalBTC,
          total_usd: notification.totalUSD,
          balance_difference: notification.balanceDifference,
        },
        addresses: notification.addresses.map((addr) => ({
          address: addr.address,
          name: addr.name,
          direction: addr.direction,
          amount_btc: addr.amount,
          amount_usd: addr.amountUSD,
        })),
        sender_addresses: notification.senderAddresses,
        receiver_addresses: notification.receiverAddresses,
        op_return_data: notification.opReturnData,
        processing_info: {
          notification_time: Date.now(),
          latency_ms: Date.now() - notification.timestamp,
        },
        readable_message: readableMessage,
      });

      await this.postProcessNotification(notification);
    } catch (error) {
      this.logger.error("notification_send_failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        transaction_hash: notification.txHash,
        timestamp: Date.now(),
      });
    }
  }

  private async enrichWithUSDAmounts(
    notification: TransactionNotification
  ): Promise<void> {
    try {
      await this.updateBTCPriceIfNeeded();

      if (this.btcPriceUSD > 0) {
        notification.totalUSD = notification.totalBTC * this.btcPriceUSD;

        await Promise.all(
          notification.addresses.map(async (address) => {
            address.amountUSD = address.amount * this.btcPriceUSD;
          })
        );
      }
    } catch (error) {
      console.warn("Failed to enrich with USD amounts:", error);
    }
  }

  private async updateBTCPriceIfNeeded(): Promise<void> {
    const now = Date.now();
    const cacheAge = now - this.lastPriceUpdate;

    if (cacheAge > this.PRICE_CACHE_MS || this.btcPriceUSD === 0) {
      await this.updateBTCPrice();
    }
  }

  private async updateBTCPrice(): Promise<void> {
    try {
      const response = await axios.get(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        { timeout: 5000 }
      );

      if (response.data?.bitcoin?.usd) {
        this.btcPriceUSD = response.data.bitcoin.usd;
        this.lastPriceUpdate = Date.now();

        console.debug(`BTC price updated: $${this.btcPriceUSD}`);
      }
    } catch (error) {
      console.warn("Failed to update BTC price:", error);
    }
  }
  private async postProcessNotification(
    notification: TransactionNotification
  ): Promise<void> {
    // Здесь можно добавить:
    // - Отправку метрик в систему мониторинга
    // - Сохранение уведомлений в базу данных
    // - Интеграцию с внешними системами алертов
  }

  async sendSystemNotification(
    level: "info" | "warn" | "error",
    message: string,
    metadata?: any
  ): Promise<void> {
    this.logger.log(level, "system_event", {
      event_type: "system_notification",
      message,
      timestamp: Date.now(),
      metadata,
    });
  }

  async sendPerformanceMetrics(metrics: {
    memory_usage_mb: number;
    block_processing_time_ms: number;
    transaction_count: number;
    addresses_matched: number;
    notification_latency_ms: number;
  }): Promise<void> {
    this.logger.info("performance_metrics", {
      event_type: "performance_data",
      timestamp: Date.now(),
      metrics,
    });
  }

  private createReadableMessage(notification: TransactionNotification): string {
    const {
      type,
      addresses,
      totalBTC,
      totalUSD,
      balanceDifference,
      senderAddresses,
      receiverAddresses,
    } = notification;

    const formatBTC = (amount: number) => `${amount.toFixed(8)} BTC`;
    const formatUSD = (amount: number | undefined) =>
      amount ? ` ($${amount.toFixed(2)})` : "";
    const formatAddressList = (addrs: string[] = [], limit: number = 2) => {
      if (addrs.length === 0) return "Unknown";
      if (addrs.length === 1) return addrs[0];
      if (addrs.length <= limit) return addrs.join(", ");
      return `${addrs.slice(0, limit).join(", ")} + ${
        addrs.length - limit
      } more`;
    };

    // Определяем типы адресов
    const incomingAddresses = addresses.filter(
      (addr) => addr.direction === "output"
    );
    const outgoingAddresses = addresses.filter(
      (addr) => addr.direction === "input"
    );

    if (type === "incoming") {
      const address = incomingAddresses[0];
      const fromAddresses = formatAddressList(senderAddresses, 1);
      return `Address ${address.name} receives ${formatBTC(
        address.amount
      )}${formatUSD(address.amountUSD)} from ${fromAddresses} | ${
        address.addressType || "Unknown"
      } | TX: ${notification.txHash}`;
    }

    if (type === "outgoing") {
      const address = outgoingAddresses[0];
      const toAddresses = formatAddressList(receiverAddresses, 1);
      return `Address ${address.name} sends ${formatBTC(
        address.amount
      )}${formatUSD(address.amountUSD)} to ${toAddresses} | ${
        address.addressType || "Unknown"
      } | TX: ${notification.txHash}`;
    }

    if (type === "both") {
      const totalIncoming = incomingAddresses.reduce(
        (sum, addr) => sum + addr.amount,
        0
      );
      const totalOutgoing = outgoingAddresses.reduce(
        (sum, addr) => sum + addr.amount,
        0
      );
      const netBalance = totalIncoming - totalOutgoing;

      const addressName = addresses[0].name;
      const addressType = addresses[0].addressType || "Unknown";

      const fromAddresses = formatAddressList(senderAddresses, 2);
      const toAddresses = formatAddressList(receiverAddresses, 2);

      const balanceText =
        netBalance >= 0
          ? `net balance +${formatBTC(netBalance)}${formatUSD(
              (totalUSD || 0) * (netBalance / totalBTC)
            )}`
          : `net balance ${formatBTC(netBalance)}${formatUSD(
              (totalUSD || 0) * (netBalance / totalBTC)
            )}`;

      return `Address ${addressName} (${addressType}) received ${formatBTC(
        totalIncoming
      )} from ${fromAddresses}, sent ${formatBTC(
        totalOutgoing
      )} to ${toAddresses} - ${balanceText} | TX: ${notification.txHash}`;
    }

    return `Transaction detected for ${addresses.length} addresses: ${formatBTC(
      totalBTC
    )}${formatUSD(totalUSD)} | TX: ${notification.txHash}`;
  }
}
