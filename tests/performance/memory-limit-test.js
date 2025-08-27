#!/usr/bin/env node

/**
 * Performance Test: Memory Limit (512MB)
 * Тестирует соблюдение лимита памяти 512MB при обработке блоков
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class MemoryLimitTest {
  constructor() {
    this.maxMemoryMB = 512;
    this.testDuration = 60000; // 1 минута тестирования
    this.samplingInterval = 1000; // Проверка каждую секунду
    this.memorySamples = [];
    this.peakMemory = 0;
  }

  async runTest() {
    console.log('🧪 Memory Limit Performance Test');
    console.log(`📊 Target: Maximum ${this.maxMemoryMB}MB memory usage`);
    console.log(`⏱️ Duration: ${this.testDuration / 1000} seconds`);
    console.log('');

    // Создаем специальный конфиг для тестирования с большим количеством адресов
    const testConfig = this.createTestConfig();
    const configPath = path.join(__dirname, 'test-config-memory.json');
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

    try {
      await this.startMemoryTest(configPath);
      this.analyzeResults();
    } finally {
      // Cleanup
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
  }

  createTestConfig() {
    // Генерируем 1000+ тестовых адресов для нагрузочного тестирования
    const addresses = [];

    // Реальные известные адреса для тестирования
    const realAddresses = [
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Genesis
      '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX', // Silk Road
      '1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF', // BitFinex
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', // SegWit test
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy' // P2SH test
    ];

    realAddresses.forEach((addr, index) => {
      addresses.push({
        address: addr,
        name: `Test Address ${index + 1}`
      });
    });

    // Генерируем дополнительные тестовые адреса для достижения 1000+
    for (let i = addresses.length; i < 1200; i++) {
      addresses.push({
        address: this.generateTestAddress(i),
        name: `Generated Test Address ${i}`
      });
    }

    return {
      rpcUrl: process.env.BTC_RPC_URL,
      addresses: addresses,
      pollingIntervalMs: 2000, // Более частые проверки для тестирования
      maxMemoryMB: this.maxMemoryMB,
      usdPriceEnabled: true,
      logLevel: 'info'
    };
  }

  generateTestAddress(index) {
    // Генерируем валидные Bitcoin адреса для тестирования
    const types = ['1', '3', 'bc1q'];
    const type = types[index % types.length];

    if (type === '1') {
      // Legacy P2PKH
      return '1' + this.randomString(25, '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
    } else if (type === '3') {
      // P2SH
      return '3' + this.randomString(25, '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
    } else {
      // SegWit Bech32
      return 'bc1q' + this.randomString(32, 'qpzry9x8gf2tvdw0s3jn54khce6mua7l');
    }
  }

  randomString(length, chars) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async startMemoryTest(configPath) {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting Bitcoin Transaction Scanner...');

      // Запускаем scanner как дочерний процесс
      const scannerProcess = spawn('node', ['dist/index.js'], {
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=600 --expose-gc'
        },
        stdio: ['inherit', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '../../')
      });

      let isStarted = false;
      const startTime = Date.now();

      // Мониторинг памяти
      const memoryInterval = setInterval(() => {
        if (scannerProcess.pid) {
          this.sampleMemoryUsage(scannerProcess.pid);
        }
      }, this.samplingInterval);

      // Чтение вывода для определения успешного запуска
      scannerProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Scanner:', output.trim());

        if (output.includes('Bitcoin Transaction Scanner is running') && !isStarted) {
          isStarted = true;
          console.log('✅ Scanner started successfully, monitoring memory...');
        }
      });

      scannerProcess.stderr.on('data', (data) => {
        console.error('Scanner Error:', data.toString());
      });

      scannerProcess.on('close', (code) => {
        clearInterval(memoryInterval);
        if (code === 0 || this.memorySamples.length > 0) {
          resolve();
        } else {
          reject(new Error(`Scanner exited with code ${code}`));
        }
      });

      // Завершаем тест через заданное время
      setTimeout(() => {
        console.log('⏰ Test duration reached, stopping scanner...');
        clearInterval(memoryInterval);
        scannerProcess.kill('SIGTERM');

        setTimeout(() => {
          if (scannerProcess.pid) {
            scannerProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      }, this.testDuration);
    });
  }

  sampleMemoryUsage(pid) {
    try {
      const { execSync } = require('child_process');

      // Получаем использование памяти процесса (RSS in KB)
      const memInfo = execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf8' }).trim();
      const memoryKB = parseInt(memInfo);
      const memoryMB = memoryKB / 1024;

      this.memorySamples.push({
        timestamp: Date.now(),
        memoryMB: memoryMB
      });

      if (memoryMB > this.peakMemory) {
        this.peakMemory = memoryMB;
      }

      // Real-time вывод для больших превышений
      if (memoryMB > this.maxMemoryMB * 1.1) {
        console.log(`⚠️ Memory spike detected: ${memoryMB.toFixed(2)}MB`);
      }

    } catch (error) {
      console.warn('Failed to sample memory usage:', error.message);
    }
  }

  analyzeResults() {
    console.log('');
    console.log('📈 Memory Test Results');
    console.log('=' .repeat(50));

    if (this.memorySamples.length === 0) {
      console.log('❌ No memory samples collected');
      return;
    }

    const avgMemory = this.memorySamples.reduce((sum, sample) => sum + sample.memoryMB, 0) / this.memorySamples.length;
    const violations = this.memorySamples.filter(sample => sample.memoryMB > this.maxMemoryMB);

    console.log(`📊 Samples collected: ${this.memorySamples.length}`);
    console.log(`🎯 Memory limit: ${this.maxMemoryMB}MB`);
    console.log(`📈 Peak memory usage: ${this.peakMemory.toFixed(2)}MB`);
    console.log(`📊 Average memory usage: ${avgMemory.toFixed(2)}MB`);
    console.log(`⚠️ Violations: ${violations.length} (${(violations.length / this.memorySamples.length * 100).toFixed(1)}%)`);

    // Детальная статистика
    if (violations.length > 0) {
      const maxViolation = Math.max(...violations.map(v => v.memoryMB));
      console.log(`🔴 Maximum violation: ${maxViolation.toFixed(2)}MB`);
    }

    // Результат теста
    const passThreshold = 0.05; // Максимум 5% нарушений допустимо
    const violationRate = violations.length / this.memorySamples.length;

    if (this.peakMemory <= this.maxMemoryMB && violationRate <= passThreshold) {
      console.log('');
      console.log('✅ MEMORY TEST PASSED');
      console.log(`Peak memory ${this.peakMemory.toFixed(2)}MB is within ${this.maxMemoryMB}MB limit`);
    } else {
      console.log('');
      console.log('❌ MEMORY TEST FAILED');
      if (this.peakMemory > this.maxMemoryMB) {
        console.log(`Peak memory ${this.peakMemory.toFixed(2)}MB exceeds ${this.maxMemoryMB}MB limit`);
      }
      if (violationRate > passThreshold) {
        console.log(`Violation rate ${(violationRate * 100).toFixed(1)}% exceeds ${(passThreshold * 100)}% threshold`);
      }
    }

    // Сохраняем детальные результаты
    const resultsPath = path.join(__dirname, '../results/memory-test-results.json');
    const resultsDir = path.dirname(resultsPath);

    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    fs.writeFileSync(resultsPath, JSON.stringify({
      testType: 'memory_limit',
      timestamp: new Date().toISOString(),
      config: {
        maxMemoryMB: this.maxMemoryMB,
        testDuration: this.testDuration,
        addressCount: 1200
      },
      results: {
        peakMemoryMB: this.peakMemory,
        avgMemoryMB: avgMemory,
        violations: violations.length,
        violationRate: violationRate,
        samples: this.memorySamples.length,
        passed: this.peakMemory <= this.maxMemoryMB && violationRate <= passThreshold
      },
      samples: this.memorySamples
    }, null, 2));

    console.log(`📄 Detailed results saved to: ${resultsPath}`);
  }
}

// Запуск теста
if (require.main === module) {
  const test = new MemoryLimitTest();
  test.runTest().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = MemoryLimitTest;
