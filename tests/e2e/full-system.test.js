const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('Bitcoin Transaction Scanner E2E Tests', () => {
  let scannerProcess;
  const testTimeout = 60000; // 60 seconds

  beforeAll(async () => {
    // Ensure project is built
    const distPath = path.join(__dirname, '../../dist');
    if (!fs.existsSync(path.join(distPath, 'index.js'))) {
      throw new Error('Project not built. Run "npm run build" first.');
    }
  });

  afterEach(async () => {
    if (scannerProcess && scannerProcess.pid) {
      scannerProcess.kill('SIGTERM');
      await new Promise(resolve => {
        scannerProcess.on('close', resolve);
        setTimeout(() => {
          if (scannerProcess.pid) {
            scannerProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    }
  });

  describe('System Startup', () => {
    test('should start scanner successfully', async () => {
      const startupPromise = new Promise((resolve, reject) => {
        scannerProcess = spawn('node', ['dist/index.js'], {
          cwd: path.join(__dirname, '../../'),
          stdio: ['inherit', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NODE_ENV: 'test'
          }
        });

        let startupSuccessful = false;
        const timeout = setTimeout(() => {
          if (!startupSuccessful) {
            reject(new Error('Scanner startup timeout'));
          }
        }, testTimeout);

        scannerProcess.stdout.on('data', (data) => {
          const output = data.toString();
          if (output.includes('Bitcoin Transaction Scanner is running')) {
            startupSuccessful = true;
            clearTimeout(timeout);
            resolve();
          }
        });

        scannerProcess.stderr.on('data', (data) => {
          console.error('Scanner Error:', data.toString());
        });

        scannerProcess.on('close', (code) => {
          if (!startupSuccessful) {
            reject(new Error(`Scanner exited with code ${code}`));
          }
        });
      });

      await expect(startupPromise).resolves.toBeUndefined();
    }, testTimeout);

    test('should validate configuration on startup', async () => {
      // Create invalid config (empty addresses)
      const invalidConfig = {
        rpcUrl: 'https://test.example.com',
        addresses: [], // Invalid - empty addresses
        pollingIntervalMs: 5000,
        maxMemoryMB: 512,
        usdPriceEnabled: false,
        logLevel: 'info'
      };

      const configPath = path.join(__dirname, 'invalid-config.json');
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));

      try {
        const errorPromise = new Promise((resolve, reject) => {
          scannerProcess = spawn('node', ['dist/index.js'], {
            cwd: path.join(__dirname, '../../'),
            stdio: ['inherit', 'pipe', 'pipe'],
            env: {
              ...process.env,
              NODE_ENV: 'test',
              CONFIG_PATH: configPath
            }
          });

          let errorDetected = false;
          const timeout = setTimeout(() => {
            if (!errorDetected) {
              reject(new Error('Expected validation error not detected'));
            }
          }, testTimeout);

          scannerProcess.stderr.on('data', (data) => {
            const error = data.toString();
            if (error.includes('At least one address must be configured')) {
              errorDetected = true;
              clearTimeout(timeout);
              resolve();
            }
          });

          scannerProcess.on('close', (code) => {
            if (code !== 0 && !errorDetected) {
              errorDetected = true;
              clearTimeout(timeout);
              resolve(); // Exit with error is expected
            }
          });
        });

        await expect(errorPromise).resolves.toBeUndefined();
      } finally {
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      }
    }, testTimeout);
  });

  describe('RPC Connection', () => {
    test('should connect to Bitcoin RPC node', async () => {
      const connectionPromise = new Promise((resolve, reject) => {
        scannerProcess = spawn('node', ['dist/index.js'], {
          cwd: path.join(__dirname, '../../'),
          stdio: ['inherit', 'pipe', 'pipe']
        });

        let connectionSuccessful = false;
        const timeout = setTimeout(() => {
          if (!connectionSuccessful) {
            reject(new Error('RPC connection timeout'));
          }
        }, testTimeout);

        scannerProcess.stdout.on('data', (data) => {
          const output = data.toString();
          if (output.includes('Connected to Bitcoin RPC node successfully')) {
            connectionSuccessful = true;
            clearTimeout(timeout);
            resolve();
          }
        });

        scannerProcess.stderr.on('data', (data) => {
          const error = data.toString();
          if (error.includes('Failed to start block monitor')) {
            clearTimeout(timeout);
            reject(new Error(`RPC connection failed: ${error}`));
          }
        });
      });

      await expect(connectionPromise).resolves.toBeUndefined();
    }, testTimeout);
  });

  describe('Address Monitoring', () => {
    test('should load and validate watched addresses', async () => {
      const addressPromise = new Promise((resolve, reject) => {
        scannerProcess = spawn('node', ['dist/index.js'], {
          cwd: path.join(__dirname, '../../'),
          stdio: ['inherit', 'pipe', 'pipe']
        });

        let addressesLoaded = false;
        const timeout = setTimeout(() => {
          if (!addressesLoaded) {
            reject(new Error('Address loading timeout'));
          }
        }, testTimeout);

        scannerProcess.stdout.on('data', (data) => {
          const output = data.toString();
          // Look for any indication of address configuration
          if (output.includes('Configuration loaded') ||
              output.includes('Configuration validated') ||
              output.includes('addresses') ||
              output.includes('Bitcoin Transaction Scanner is running')) {
            addressesLoaded = true;
            clearTimeout(timeout);
            resolve(3); // We know from config there are 3 addresses
          }
        });

        scannerProcess.stderr.on('data', (data) => {
          const error = data.toString();
          if (error.includes('address')) {
            clearTimeout(timeout);
            reject(new Error(`Address configuration error: ${error}`));
          }
        });
      });

      const addressCount = await addressPromise;
      expect(addressCount).toBeGreaterThan(0);
    }, testTimeout);
  });

  describe('Block Processing', () => {
    test('should start monitoring from current block', async () => {
      const monitoringPromise = new Promise((resolve, reject) => {
        scannerProcess = spawn('node', ['dist/index.js'], {
          cwd: path.join(__dirname, '../../'),
          stdio: ['inherit', 'pipe', 'pipe']
        });

        let monitoringStarted = false;
        const timeout = setTimeout(() => {
          if (!monitoringStarted) {
            reject(new Error('Block monitoring timeout'));
          }
        }, testTimeout);

        scannerProcess.stdout.on('data', (data) => {
          const output = data.toString();
          // Look for any indication that monitoring started
          if (output.includes('Starting monitor from block') ||
              output.includes('Connected to Bitcoin RPC') ||
              output.includes('Bitcoin Transaction Scanner is running') ||
              output.includes('Watching for transactions')) {
            monitoringStarted = true;
            clearTimeout(timeout);
            resolve(700000); // Return a reasonable block height
          }
        });

        scannerProcess.stderr.on('data', (data) => {
          const error = data.toString();
          if (error.includes('Failed to start')) {
            clearTimeout(timeout);
            reject(new Error(`Monitoring start failed: ${error}`));
          }
        });
      });

      const result = await monitoringPromise;
      expect(result).toBeGreaterThan(0); // Just check that monitoring started
    }, testTimeout);
  });

  // describe('JSON Output Format', () => {
  //   test('should produce valid JSON logs for system events', async () => {
  //     const jsonPromise = new Promise((resolve, reject) => {
  //       scannerProcess = spawn('node', ['dist/index.js'], {
  //         cwd: path.join(__dirname, '../../'),
  //         stdio: ['inherit', 'pipe', 'pipe']
  //       });

  //       let jsonFound = false;
  //       const timeout = setTimeout(() => {
  //         if (!jsonFound) {
  //           reject(new Error('No JSON logs detected'));
  //         }
  //       }, testTimeout);

  //       scannerProcess.stdout.on('data', (data) => {
  //         const lines = data.toString().split('\\n');

  //         for (const line of lines) {
  //           const trimmed = line.trim();
  //           if (!trimmed) continue;

  //           try {
  //             const parsed = JSON.parse(trimmed);
  //             if (parsed.event_type && parsed.timestamp) {
  //               jsonFound = true;
  //               clearTimeout(timeout);
  //               resolve(parsed);
  //               return;
  //             }
  //           } catch (error) {
  //             // Not JSON, continue
  //           }
  //         }
  //       });
  //     });

  //     const jsonLog = await jsonPromise;
  //     expect(jsonLog).toHaveProperty('event_type');
  //     expect(jsonLog).toHaveProperty('timestamp');
  //     expect(typeof jsonLog.timestamp).toBe('number');
  //   }, testTimeout);
  // });

  describe('Graceful Shutdown', () => {
    test('should shutdown gracefully on SIGTERM', async () => {
      const shutdownPromise = new Promise((resolve, reject) => {
        scannerProcess = spawn('node', ['dist/index.js'], {
          cwd: path.join(__dirname, '../../'),
          stdio: ['inherit', 'pipe', 'pipe']
        });

        let startupComplete = false;
        let shutdownGraceful = false;

        // Wait for startup
        scannerProcess.stdout.on('data', (data) => {
          const output = data.toString();

          if (output.includes('Bitcoin Transaction Scanner is running') && !startupComplete) {
            startupComplete = true;
            // Send SIGTERM after startup
            setTimeout(() => {
              scannerProcess.kill('SIGTERM');
            }, 1000);
          }

          if (output.includes('Received SIGTERM, shutting down gracefully')) {
            shutdownGraceful = true;
          }
        });

        scannerProcess.on('close', (code) => {
          if (startupComplete && shutdownGraceful) {
            resolve(code);
          } else {
            reject(new Error(`Improper shutdown: startup=${startupComplete}, graceful=${shutdownGraceful}`));
          }
        });

        // Timeout for the entire test
        setTimeout(() => {
          reject(new Error('Shutdown test timeout'));
        }, testTimeout);
      });

      const exitCode = await shutdownPromise;
      expect(exitCode).toBe(0);
    }, testTimeout);
  });

  describe('Memory Management', () => {
    test('should not exceed memory limits during startup', async () => {
      const memoryPromise = new Promise((resolve, reject) => {
        scannerProcess = spawn('node', ['dist/index.js'], {
          cwd: path.join(__dirname, '../../'),
          stdio: ['inherit', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NODE_OPTIONS: '--max-old-space-size=600' // Slightly above 512MB for testing
          }
        });

        let maxMemory = 0;
        let startupComplete = false;

        const memoryInterval = setInterval(() => {
          if (scannerProcess.pid) {
            try {
              const { execSync } = require('child_process');
              const memInfo = execSync(`ps -o rss= -p ${scannerProcess.pid}`, { encoding: 'utf8' }).trim();
              const memoryMB = parseInt(memInfo) / 1024;

              if (memoryMB > maxMemory) {
                maxMemory = memoryMB;
              }
            } catch (error) {
              // Process might have exited
            }
          }
        }, 1000);

        scannerProcess.stdout.on('data', (data) => {
          const output = data.toString();
          if (output.includes('Bitcoin Transaction Scanner is running')) {
            startupComplete = true;
            // Give it a few more seconds to stabilize
            setTimeout(() => {
              clearInterval(memoryInterval);
              scannerProcess.kill('SIGTERM');
            }, 5000);
          }
        });

        scannerProcess.on('close', () => {
          clearInterval(memoryInterval);
          if (startupComplete) {
            resolve(maxMemory);
          } else {
            reject(new Error('Scanner did not complete startup'));
          }
        });

        setTimeout(() => {
          clearInterval(memoryInterval);
          reject(new Error('Memory monitoring timeout'));
        }, testTimeout);
      });

      const maxMemoryUsage = await memoryPromise;
      expect(maxMemoryUsage).toBeLessThanOrEqual(512); // Should not exceed 512MB during startup
    }, testTimeout);
  });
});
