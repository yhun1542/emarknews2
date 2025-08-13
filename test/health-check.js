#!/usr/bin/env node

/**
 * EmarkNews Health Check Test
 * 기본적인 서버 기능과 API 엔드포인트를 테스트합니다.
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const TEST_PORT = process.env.TEST_PORT || 3001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let server;
let testResults = [];

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function makeRequest(path, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === expectedStatus) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        } else {
          reject(new Error(`Expected ${expectedStatus}, got ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', 'ai-news-system-final.js');
    server = spawn('node', [serverPath], {
      env: { ...process.env, PORT: TEST_PORT },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    server.stdout.on('data', (data) => {
      if (data.toString().includes('backend started')) {
        setTimeout(resolve, 1000); // 서버 시작 대기
      }
    });
    
    server.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });
    
    server.on('error', reject);
    
    // 10초 후 타임아웃
    setTimeout(() => reject(new Error('Server start timeout')), 10000);
  });
}

function stopServer() {
  if (server) {
    server.kill('SIGTERM');
    server = null;
  }
}

async function runTest(name, testFn) {
  try {
    log(`Running test: ${name}`);
    await testFn();
    log(`✅ ${name} - PASSED`, 'success');
    testResults.push({ name, status: 'PASSED' });
  } catch (error) {
    log(`❌ ${name} - FAILED: ${error.message}`, 'error');
    testResults.push({ name, status: 'FAILED', error: error.message });
  }
}

async function testHealthEndpoint() {
  const response = await makeRequest('/healthz');
  const data = JSON.parse(response.data);
  
  if (!data.status || data.status !== 'ok') {
    throw new Error('Health check status is not ok');
  }
  
  if (!data.uptime || typeof data.uptime !== 'number') {
    throw new Error('Uptime is missing or invalid');
  }
  
  if (!data.version) {
    throw new Error('Version is missing');
  }
  
  log(`Health check passed - uptime: ${data.uptime}s, version: ${data.version}`);
}

async function testFeedEndpoint() {
  const response = await makeRequest('/feed');
  const data = JSON.parse(response.data);
  
  if (!data.clusters || !Array.isArray(data.clusters)) {
    throw new Error('Clusters array is missing or invalid');
  }
  
  if (data.clusters.length > 0) {
    const cluster = data.clusters[0];
    if (!cluster.id || !cluster.articles || !Array.isArray(cluster.articles)) {
      throw new Error('Cluster structure is invalid');
    }
  }
  
  log(`Feed endpoint passed - ${data.clusters.length} clusters returned`);
}

async function testFeedOptions() {
  // Test freshness option
  const freshnessResponse = await makeRequest('/feed?freshness=1');
  const freshnessData = JSON.parse(freshnessResponse.data);
  
  if (freshnessData.freshness !== 1) {
    throw new Error('Freshness parameter not processed correctly');
  }
  
  // Test domain_cap option
  const domainCapResponse = await makeRequest('/feed?domain_cap=1');
  const domainCapData = JSON.parse(domainCapResponse.data);
  
  if (domainCapData.domain_cap !== 1) {
    throw new Error('Domain cap parameter not processed correctly');
  }
  
  log('Feed options test passed');
}

async function testCacheHeaders() {
  const response = await makeRequest('/healthz');
  
  if (!response.headers['cache-control']) {
    throw new Error('Cache-Control header is missing');
  }
  
  if (!response.headers['etag']) {
    throw new Error('ETag header is missing');
  }
  
  log('Cache headers test passed');
}

async function main() {
  log('🚀 Starting EmarkNews Health Check Tests');
  
  try {
    log('Starting test server...');
    await startServer();
    log('Test server started successfully');
    
    await runTest('Health Endpoint Test', testHealthEndpoint);
    await runTest('Feed Endpoint Test', testFeedEndpoint);
    await runTest('Feed Options Test', testFeedOptions);
    await runTest('Cache Headers Test', testCacheHeaders);
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  } finally {
    stopServer();
  }
  
  // 결과 요약
  const passed = testResults.filter(r => r.status === 'PASSED').length;
  const failed = testResults.filter(r => r.status === 'FAILED').length;
  
  log(`\n📊 Test Results Summary:`);
  log(`✅ Passed: ${passed}`);
  log(`❌ Failed: ${failed}`);
  log(`📈 Success Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    log('\n❌ Failed Tests:');
    testResults.filter(r => r.status === 'FAILED').forEach(test => {
      log(`  - ${test.name}: ${test.error}`);
    });
    process.exit(1);
  } else {
    log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

// 프로세스 종료 시 서버 정리
process.on('SIGINT', () => {
  log('Received SIGINT, cleaning up...');
  stopServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, cleaning up...');
  stopServer();
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    log(`Unhandled error: ${error.message}`, 'error');
    stopServer();
    process.exit(1);
  });
}

module.exports = { main, runTest };

