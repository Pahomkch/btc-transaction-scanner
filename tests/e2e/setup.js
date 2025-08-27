// E2E Test Setup for Bitcoin Transaction Scanner

const fs = require('fs');
const path = require('path');

// Extended timeout for E2E tests
jest.setTimeout(60000);

// E2E specific utilities
global.e2eUtils = {
  // Create temporary test config
  createTestConfig: (overrides = {}) => {
    const config = {
      rpcUrl: process.env.BTC_RPC_URL || 'https://neat-tame-pond.btc.quiknode.pro/91ba64a3b7d2ced2d16fff2eb260106323aba0c0',
      addresses: [
        {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          name: 'Genesis Block Test'
        }
      ],
      pollingIntervalMs: 10000, // Longer intervals for E2E tests
      maxMemoryMB: 512,
      usdPriceEnabled: false,
      logLevel: 'info',
      ...overrides
    };
    
    const configPath = path.join(__dirname, `test-config-${Date.now()}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    return configPath;
  },

  // Clean up test config files
  cleanupTestConfigs: () => {
    const testDir = __dirname;
    const files = fs.readdirSync(testDir);
    
    files.forEach(file => {
      if (file.startsWith('test-config-') && file.endsWith('.json')) {
        const filePath = path.join(testDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // File might already be deleted
        }
      }
    });
  },

  // Wait for scanner startup
  waitForStartup: (scannerProcess, timeout = 30000) => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Scanner startup timeout'));
      }, timeout);

      scannerProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Bitcoin Transaction Scanner is running')) {
          clearTimeout(timeoutId);
          resolve();
        }
      });

      scannerProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('Failed to start')) {
          clearTimeout(timeoutId);
          reject(new Error(`Scanner startup failed: ${error}`));
        }
      });
    });
  },

  // Monitor process output for specific patterns
  monitorOutput: (scannerProcess, patterns = [], timeout = 30000) => {
    return new Promise((resolve, reject) => {
      const results = {};
      const timeoutId = setTimeout(() => {
        reject(new Error(`Output monitoring timeout. Found: ${JSON.stringify(results)}`));
      }, timeout);

      scannerProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        patterns.forEach(pattern => {
          if (typeof pattern === 'string') {
            if (output.includes(pattern)) {
              results[pattern] = true;
            }
          } else if (pattern instanceof RegExp) {
            const match = output.match(pattern);
            if (match) {
              results[pattern.source] = match;
            }
          }
        });

        // Check if all patterns found
        const allFound = patterns.every(pattern => {
          const key = typeof pattern === 'string' ? pattern : pattern.source;
          return results[key] !== undefined;
        });

        if (allFound) {
          clearTimeout(timeoutId);
          resolve(results);
        }
      });
    });
  },

  // Kill scanner process gracefully
  killScanner: (scannerProcess, timeout = 5000) => {
    return new Promise((resolve) => {
      if (!scannerProcess || !scannerProcess.pid) {
        resolve();
        return;
      }

      scannerProcess.kill('SIGTERM');
      
      const timeoutId = setTimeout(() => {
        if (scannerProcess.pid) {
          scannerProcess.kill('SIGKILL');
        }
        resolve();
      }, timeout);

      scannerProcess.on('close', () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }
};

// Clean up before each test
beforeEach(() => {
  global.e2eUtils.cleanupTestConfigs();
});

// Clean up after each test
afterEach(() => {
  global.e2eUtils.cleanupTestConfigs();
});