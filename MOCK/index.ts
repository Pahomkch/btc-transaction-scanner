// Константы
const NODE_URL =
  "https://neat-tame-pond.btc.quiknode.pro/91ba64a3b7d2ced2d16fff2eb260106323aba0c0";
const TYPES = ["P2PKH", "P2SH", "P2SH-P2WPKH", "P2WPKH", "P2TR"] as const;
type AddressType = (typeof TYPES)[number];

// Результат: для каждого типа храним incoming, outgoing, both
interface ResultEntry {
  incoming?: string;
  outgoing?: string;
  both?: string;
}

const result: Record<AddressType, ResultEntry> = {
  P2PKH: {},
  P2SH: {},
  "P2SH-P2WPKH": {},
  P2WPKH: {},
  P2TR: {},
};

// Интерфейсы
interface RpcResponse<T> {
  result: T;
  error: any;
  id: string;
}

interface Vin {
  coinbase?: string;
  txid?: string;
  scriptSig?: {
    asm: string;
    hex: string;
  };
  addresses?: string[];
  txinwitness?: string[];
}

interface Vout {
  scriptPubKey: {
    address?: string;
    addresses?: string[];
    type: string;
    hex: string;
  };
}

interface Tx {
  txid: string;
  vin: Vin[];
  vout: Vout[];
}

interface Block {
  hash: string;
  height: number;
  tx: Tx[];
}

// HTTPS POST-запрос
function rpcCall<T>(method: string, params: any[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: "1",
    });

    const url = new URL(NODE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = (
      url.protocol === "https:" ? require("https") : require("http")
    ).request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data) as RpcResponse<T>;
          if (json.error) {
            reject(new Error(`RPC Error: ${json.error.message || json.error}`));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(
            new Error(`Parse error: ${e instanceof Error ? e.message : e}`)
          );
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Определяем тип адреса
function classifyAddress(addr: string, vout?: Vout): AddressType | null {
  if (addr.startsWith("1") && /^[1-9a-km-zA-HJ-NP-Z]{25,34}$/.test(addr)) {
    return "P2PKH";
  }
  if (addr.startsWith("3") && /^[1-9a-km-zA-HJ-NP-Z]{25,34}$/.test(addr)) {
    // Проверим, не P2SH-P2WPKH ли это
    if (
      vout?.scriptPubKey.hex?.toLowerCase().startsWith("a914") &&
      vout.scriptPubKey.hex.length === 44
    ) {
      const redeemHex = vout.scriptPubKey.hex.slice(4, -2); // извлекаем содержимое
      if (redeemHex.startsWith("0014") && redeemHex.length === 44) {
        return "P2SH-P2WPKH";
      }
    }
    return "P2SH";
  }
  if (addr.startsWith("bc1q") && (addr.length === 42 || addr.length === 62)) {
    return "P2WPKH";
  }
  if (addr.startsWith("bc1p") && addr.length === 62) {
    return "P2TR";
  }
  return null;
}

// Основная функция
async function main() {
  try {
    console.log("Получаем высоту последнего блока...");
    const blockCount = await rpcCall<number>("getblockcount");
    console.log(`Последний блок: ${blockCount}`);

    const blockHash = await rpcCall<string>("getblockhash", [blockCount]);
    console.log(`Хэш блока: ${blockHash}`);

    const block = await rpcCall<Block>("getblock", [blockHash, 2]);
    console.log(`\n✅ Блок ${block.height} загружен.`);
    console.log(`📊 Всего транзакций в блоке: ${block.tx.length}`);

    // Множества: кто что делал
    const incomingSet = new Set<string>();
    const outgoingSet = new Set<string>();

        // Собираем входящие (в vout) и исходящие (в vin)
    // Увеличиваем количество транзакций для поиска разнообразных адресов
    const txToProcess = block.tx.slice(0, Math.min(1000, block.tx.length));
    console.log(`🔍 Обрабатываем первые ${txToProcess.length} транзакций из ${block.tx.length}`);

    let processedTx = 0;
    let rpcCalls = 0;
    const maxRpcCalls = 200; // Увеличиваем количество RPC вызовов

    for (const tx of txToProcess) {
      if (tx.vin.length === 1 && tx.vin[0].coinbase) continue;

      // Входящие адреса (получатели) - из vout
      for (const vout of tx.vout) {
        const addr = vout.scriptPubKey.address;
        if (addr) {
          incomingSet.add(addr);
        }
        if (vout.scriptPubKey.addresses) {
          for (const a of vout.scriptPubKey.addresses) {
            incomingSet.add(a);
          }
        }
      }

      // Исходящие адреса (отправители) - получаем из предыдущих транзакций
      for (const vin of tx.vin) {
        // Сначала проверяем поле addresses (если есть)
        if (vin.addresses && Array.isArray(vin.addresses)) {
          for (const addr of vin.addresses) {
            outgoingSet.add(addr);
          }
        } else if (vin.txid && vin.vout !== undefined && rpcCalls < maxRpcCalls) {
          // Получаем адрес из предыдущей транзакции
          try {
            rpcCalls++;
            const prevTx = await rpcCall<any>("getrawtransaction", [vin.txid, true]);
            if (prevTx && prevTx.vout && prevTx.vout[vin.vout]) {
              const prevOut = prevTx.vout[vin.vout];
              const addr = prevOut.scriptPubKey.address;
              if (addr) {
                outgoingSet.add(addr);
              }
              if (prevOut.scriptPubKey.addresses) {
                for (const a of prevOut.scriptPubKey.addresses) {
                  outgoingSet.add(a);
                }
              }
            }
          } catch (error) {
            // Игнорируем ошибки получения предыдущих транзакций
            console.debug(`Не удалось получить предыдущую транзакцию ${vin.txid}`);
          }
        }
      }

      processedTx++;
      if (processedTx % 50 === 0) {
        console.log(`📈 Обработано транзакций: ${processedTx}/${txToProcess.length}, RPC вызовов: ${rpcCalls}/${maxRpcCalls}`);
      }
    }

    console.log(`📊 Найдено входящих адресов: ${incomingSet.size}`);
    console.log(`📊 Найдено исходящих адресов: ${outgoingSet.size}`);

    // Обрабатываем все адреса и заполняем результат
    const processedAddresses = new Set<string>();

    // 1. Сначала ищем BOTH адреса (есть и в incoming, и в outgoing)
    for (const addr of incomingSet) {
      if (outgoingSet.has(addr)) {
        const type = classifyAddress(addr);
        if (type && !result[type].both) {
          result[type].both = addr;
          processedAddresses.add(addr);
          console.log(`✅ ${type} BOTH: ${addr}`);
        }
      }
    }

    // 2. Затем ищем INCOMING ONLY адреса (только в incoming, не в outgoing)
    for (const addr of incomingSet) {
      if (!outgoingSet.has(addr) && !processedAddresses.has(addr)) {
        const type = classifyAddress(addr);
        if (type && !result[type].incoming) {
          result[type].incoming = addr;
          processedAddresses.add(addr);
          console.log(`📥 ${type} INCOMING: ${addr}`);
        }
      }
    }

    // 3. Наконец, ищем OUTGOING ONLY адреса (только в outgoing, не в incoming)
    for (const addr of outgoingSet) {
      if (!incomingSet.has(addr) && !processedAddresses.has(addr)) {
        const type = classifyAddress(addr);
        if (type && !result[type].outgoing) {
          result[type].outgoing = addr;
          processedAddresses.add(addr);
          console.log(`📤 ${type} OUTGOING: ${addr}`);
        }
      }
    }

    // Показываем статистику
    console.log('\n📈 Статистика найденных адресов:');
    for (const type of TYPES) {
      const entry = result[type];
      const count = (entry.incoming ? 1 : 0) + (entry.outgoing ? 1 : 0) + (entry.both ? 1 : 0);
      console.log(`${type}: ${count}/3 (${entry.incoming ? '✅' : '❌'}incoming, ${entry.outgoing ? '✅' : '❌'}outgoing, ${entry.both ? '✅' : '❌'}both)`);
    }

    // Форматируем вывод в виде JSON-объектов для копирования
    console.log("\n📬 Результат (копируй в JSON)");

    for (const type of TYPES) {
      const entry = result[type];

      if (entry.both) {
        console.log(`
          {
            "address": "${entry.both}",
            "name": "${entry.both} / ${type} /${entry.both}",
            "note": "${type} (both incoming and outgoing)"
          },`);
      } else {
        if (entry.incoming) {
          console.log(`
            {
              "address": "${entry.incoming}",
              "name": "${entry.incoming} / ${type} /${entry.incoming}",
              "note": "${type} (incoming)"
            },`);
        }
        if (entry.outgoing) {
          console.log(`
            {
              "address": "${entry.outgoing}",
              "name": "${entry.outgoing} / ${type} /${entry.outgoing}",
              "note": "${type} (outgoing)"
            }`);
        }
      }
    }
  } catch (error: any) {
    console.error("❌ Ошибка:", error.message || error);
  }
}

main();
