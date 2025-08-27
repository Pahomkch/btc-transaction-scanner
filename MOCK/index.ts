// Константы
const NODE_URL = 'https://neat-tame-pond.btc.quiknode.pro/91ba64a3b7d2ced2d16fff2eb260106323aba0c0';
const TYPES = ['P2PKH', 'P2SH', 'P2SH-P2WPKH', 'P2WPKH'] as const;
type AddressType = typeof TYPES[number];

// Результат: для каждого типа храним incoming, outgoing, both
interface ResultEntry {
  incoming?: string;
  outgoing?: string;
  both?: string;
}

const result: Record<AddressType, ResultEntry> = {
  P2PKH: {},
  P2SH: {},
  'P2SH-P2WPKH': {},
  P2WPKH: {},
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
      jsonrpc: '2.0',
      method,
      params,
      id: '1',
    });

    const url = new URL(NODE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = (url.protocol === 'https:' ? require('https') : require('http')).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as RpcResponse<T>;
          if (json.error) {
            reject(new Error(`RPC Error: ${json.error.message || json.error}`));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e instanceof Error ? e.message : e}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Определяем тип адреса
function classifyAddress(addr: string, vout?: Vout): AddressType | null {
  if (addr.startsWith('1') && /^[1-9a-km-zA-HJ-NP-Z]{25,34}$/.test(addr)) {
    return 'P2PKH';
  }
  if (addr.startsWith('3') && /^[1-9a-km-zA-HJ-NP-Z]{25,34}$/.test(addr)) {
    // Проверим, не P2SH-P2WPKH ли это
    if (vout?.scriptPubKey.hex?.toLowerCase().startsWith('a914') && vout.scriptPubKey.hex.length === 44) {
      const redeemHex = vout.scriptPubKey.hex.slice(4, -2); // извлекаем содержимое
      if (redeemHex.startsWith('0014') && redeemHex.length === 44) {
        return 'P2SH-P2WPKH';
      }
    }
    return 'P2SH';
  }
  if (addr.startsWith('bc1q') && (addr.length === 42 || addr.length === 62)) {
    return 'P2WPKH';
  }
  return null;
}

// Основная функция
async function main() {
  try {
    console.log('Получаем высоту последнего блока...');
    const blockCount = await rpcCall<number>('getblockcount');
    console.log(`Последний блок: ${blockCount}`);

    const blockHash = await rpcCall<string>('getblockhash', [blockCount]);
    console.log(`Хэш блока: ${blockHash}`);

    const block = await rpcCall<Block>('getblock', [blockHash, 2]);
    console.log(`\n✅ Блок ${block.height} загружен.`);
    console.log(`📊 Всего транзакций в блоке: ${block.tx.length}`);

    // Множества: кто что делал
    const incomingSet = new Set<string>();
    const outgoingSet = new Set<string>();

    // Собираем входящие (в vout)
    for (const tx of block.tx) {
      if (tx.vin.length === 1 && tx.vin[0].coinbase) continue;

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

      // Исходящие (в vin.addresses)
      for (const vin of tx.vin) {
        if (vin.addresses) {
          for (const addr of vin.addresses) {
            outgoingSet.add(addr);
          }
        }
      }
    }

    // Теперь классифицируем
    for (const addr of incomingSet) {
      const type = classifyAddress(addr);
      if (!type) continue;

      if (result[type].incoming) continue; // уже есть

      // Проверим, был ли этот адрес и в outgoing
      const isBoth = outgoingSet.has(addr);

      if (isBoth) {
        result[type].both = addr;
      } else {
        result[type].incoming = addr;
      }
    }

    // Дополняем outgoing, если ещё нет
    for (const addr of outgoingSet) {
      const type = classifyAddress(addr);
      if (!type) continue;

      // Если уже есть both или incoming — пропускаем
      if (result[type].both || result[type].incoming || result[type].outgoing) continue;

      // Если этот адрес НЕ в incoming — это чистый outgoing
      if (!incomingSet.has(addr)) {
        result[type].outgoing = addr;
      }
    }

    // Форматируем вывод в виде JSON-объектов для копирования
    console.log('\n📬 Результат (копируй в JSON):');

    for (const type of TYPES) {
      const entry = result[type];

      if (entry.both) {
        console.log(`
{
  "address": "${entry.both}",
  "name": "${entry.both}",
  "note": "${type} (both incoming and outgoing)"
},`);
      } else {
        if (entry.incoming) {
          console.log(`
{
  "address": "${entry.incoming}",
  "name": "${entry.incoming}",
  "note": "${type} (incoming)"
},`);
        }
        if (entry.outgoing) {
          console.log(`
{
  "address": "${entry.outgoing}",
  "name": "${entry.outgoing}",
  "note": "${type} (outgoing)"
},`);
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message || error);
  }
}

main();
