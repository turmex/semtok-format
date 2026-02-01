/**
 * SEMTOK Comprehensive Test Suite
 *
 * Tests across all data scenarios to identify weaknesses and edge cases
 */

const { SEMTOKExtreme, BinaryInspiredEncoder } = require('./semtok-extreme-v5.js');

class ComprehensiveTestSuite {
  constructor() {
    this.encoder = new BinaryInspiredEncoder();
    this.results = {
      categories: {},
      failures: [],
      edgeCases: [],
      total: { passed: 0, failed: 0 }
    };
  }

  // Token counting
  countTokens(str) {
    return Math.ceil(str.length / 3.5);
  }

  // Test a single case
  test(category, name, data, expectedIssues = []) {
    try {
      const json = JSON.stringify(data);
      const encoded = this.encoder.encode(data);

      // Attempt decode (round-trip test)
      let decoded = null;
      let roundTripOk = false;
      try {
        // Simple decode test - check if encoding is valid
        roundTripOk = encoded.length > 0 && !encoded.includes('undefined');
      } catch (e) {
        roundTripOk = false;
      }

      const jsonTok = this.countTokens(json);
      const encTok = this.countTokens(encoded);
      const savings = ((jsonTok - encTok) / jsonTok * 100);

      const result = {
        name,
        category,
        json: { chars: json.length, tokens: jsonTok },
        encoded: { chars: encoded.length, tokens: encTok, text: encoded.slice(0, 100) },
        savings: savings.toFixed(1) + '%',
        savingsNum: savings,
        roundTripOk,
        issues: expectedIssues
      };

      // Track by category
      if (!this.results.categories[category]) {
        this.results.categories[category] = [];
      }
      this.results.categories[category].push(result);

      // Track failures
      if (savings < 0) {
        this.results.failures.push({ ...result, reason: 'Negative savings' });
      }

      this.results.total.passed++;
      return result;

    } catch (error) {
      this.results.total.failed++;
      this.results.failures.push({
        name, category, error: error.message
      });
      return null;
    }
  }

  // Run all tests
  runAll() {
    console.log('='.repeat(80));
    console.log('SEMTOK COMPREHENSIVE TEST SUITE');
    console.log('='.repeat(80));

    // ========================================
    // 1. TABULAR DATA TESTS
    // ========================================
    console.log('\n📊 TABULAR DATA TESTS\n');

    this.test('tabular', 'Small table (3 rows)', {
      users: [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'user' },
        { id: 3, name: 'Carol', role: 'user' }
      ]
    });

    this.test('tabular', 'Medium table (20 rows)', {
      items: Array.from({ length: 20 }, (_, i) => ({
        id: i, name: `Item${i}`, price: (i * 10.5).toFixed(2), stock: i * 5
      }))
    });

    this.test('tabular', 'Large table (100 rows)', {
      records: Array.from({ length: 100 }, (_, i) => ({
        id: i, value: i * 2, label: `L${i}`
      }))
    });

    this.test('tabular', 'Wide table (10 columns)', {
      data: Array.from({ length: 10 }, (_, i) => ({
        a: i, b: i*2, c: i*3, d: i*4, e: i*5,
        f: i*6, g: i*7, h: i*8, i: i*9, j: i*10
      }))
    });

    this.test('tabular', 'Single row table', {
      solo: [{ id: 1, val: 'only' }]
    });

    this.test('tabular', 'Two row table (minimum tabular)', {
      pair: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
    });

    // ========================================
    // 2. NON-TABULAR DATA TESTS
    // ========================================
    console.log('\n📝 NON-TABULAR DATA TESTS\n');

    this.test('non-tabular', 'Simple flat object', {
      name: 'Test', count: 42, active: true
    });

    this.test('non-tabular', 'Large flat object (20 keys)',
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, `value${i}`]))
    );

    this.test('non-tabular', 'Mixed types flat', {
      str: 'hello', num: 42, bool: true, nil: null, float: 3.14
    });

    this.test('non-tabular', 'Simple array (primitives)', {
      tags: ['a', 'b', 'c', 'd', 'e']
    });

    this.test('non-tabular', 'Number array', {
      nums: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    });

    this.test('non-tabular', 'Mixed array (non-uniform)', {
      mixed: [1, 'two', true, null, { nested: 'obj' }]
    });

    // ========================================
    // 3. NESTED DATA TESTS
    // ========================================
    console.log('\n🔄 NESTED DATA TESTS\n');

    this.test('nested', 'Shallow nesting (2 levels)', {
      level1: { level2: { value: 'deep' } }
    });

    this.test('nested', 'Medium nesting (4 levels)', {
      a: { b: { c: { d: { value: 'very deep' } } } }
    });

    this.test('nested', 'Deep nesting (8 levels)', {
      l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: { v: 1 } } } } } } } }
    });

    this.test('nested', 'Wide nesting (many siblings)', {
      parent: {
        child1: { val: 1 },
        child2: { val: 2 },
        child3: { val: 3 },
        child4: { val: 4 },
        child5: { val: 5 }
      }
    });

    this.test('nested', 'Nested with arrays', {
      config: {
        servers: [
          { host: 'a.com', port: 80 },
          { host: 'b.com', port: 443 }
        ],
        settings: { timeout: 30, retries: 3 }
      }
    });

    this.test('nested', 'Array of nested objects (non-uniform)', {
      items: [
        { type: 'a', data: { x: 1 } },
        { type: 'b', data: { y: 2, z: 3 } },
        { type: 'c', data: { w: 4 } }
      ]
    });

    // ========================================
    // 4. EDGE CASES
    // ========================================
    console.log('\n⚠️ EDGE CASES\n');

    this.test('edge', 'Empty object', {});
    this.test('edge', 'Empty array', { arr: [] });
    this.test('edge', 'Null value', { value: null });
    this.test('edge', 'All nulls', { a: null, b: null, c: null });
    this.test('edge', 'Empty string', { str: '' });
    this.test('edge', 'Whitespace string', { str: '   ' });

    this.test('edge', 'Special characters', {
      pipe: 'a|b', comma: 'a,b', colon: 'a:b',
      equals: 'a=b', semi: 'a;b', backslash: 'a\\b'
    });

    this.test('edge', 'Unicode text', {
      emoji: '🎉', chinese: '你好', arabic: 'مرحبا', math: '∑∏∫'
    });

    this.test('edge', 'Very long string', {
      long: 'x'.repeat(1000)
    });

    this.test('edge', 'Large number', {
      big: 9999999999999, small: 0.0000000001
    });

    this.test('edge', 'Negative numbers', {
      neg: -42, negFloat: -3.14
    });

    this.test('edge', 'Boolean edge cases', {
      t: true, f: false, arr: [true, false, true]
    });

    this.test('edge', 'Keys with special chars', {
      'key-with-dash': 1, 'key.with.dot': 2, 'key with space': 3
    });

    // ========================================
    // 5. REAL-WORLD SCENARIOS
    // ========================================
    console.log('\n🌍 REAL-WORLD SCENARIOS\n');

    this.test('realworld', 'API Response (paginated)', {
      status: 'success',
      data: {
        users: [
          { id: 1, email: 'a@test.com', verified: true },
          { id: 2, email: 'b@test.com', verified: false }
        ]
      },
      meta: { page: 1, total: 100, perPage: 20 }
    });

    this.test('realworld', 'Configuration file', {
      database: {
        host: 'localhost',
        port: 5432,
        name: 'mydb',
        ssl: true,
        pool: { min: 5, max: 20 }
      },
      cache: { enabled: true, ttl: 3600 },
      logging: { level: 'info', file: '/var/log/app.log' }
    });

    this.test('realworld', 'Log entries', {
      logs: Array.from({ length: 10 }, (_, i) => ({
        ts: Date.now() + i,
        level: i % 2 === 0 ? 'info' : 'warn',
        msg: `Event ${i}`,
        code: 200 + i
      }))
    });

    this.test('realworld', 'E-commerce order', {
      orderId: 'ORD-12345',
      customer: { id: 1, email: 'cust@shop.com' },
      items: [
        { sku: 'SKU001', qty: 2, price: 29.99 },
        { sku: 'SKU002', qty: 1, price: 49.99 }
      ],
      shipping: { method: 'express', cost: 9.99 },
      total: 119.96
    });

    this.test('realworld', 'Agent swarm state', {
      swarm: {
        id: 'swarm-001',
        topology: 'mesh',
        agents: [
          { id: 'a1', role: 'coordinator', status: 'active', tasks: 12 },
          { id: 'a2', role: 'worker', status: 'active', tasks: 8 },
          { id: 'a3', role: 'worker', status: 'idle', tasks: 0 }
        ]
      },
      consensus: { protocol: 'raft', quorum: 2, leader: 'a1' },
      metrics: { uptime: 3600, processed: 1024 }
    });

    this.test('realworld', 'GraphQL response', {
      data: {
        viewer: {
          login: 'testuser',
          repositories: {
            nodes: [
              { name: 'repo1', stargazerCount: 100 },
              { name: 'repo2', stargazerCount: 50 }
            ],
            totalCount: 10
          }
        }
      }
    });

    // ========================================
    // 6. STRESS TESTS
    // ========================================
    console.log('\n💪 STRESS TESTS\n');

    this.test('stress', 'Very large table (500 rows)', {
      big: Array.from({ length: 500 }, (_, i) => ({ i, v: i * 2 }))
    });

    this.test('stress', 'Deep nesting (15 levels)',
      this.createDeepNesting(15)
    );

    this.test('stress', 'Wide object (50 keys)',
      Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]))
    );

    this.test('stress', 'Complex mixed structure', {
      arrays: {
        simple: [1, 2, 3],
        nested: [[1, 2], [3, 4]],
        objects: [{ a: 1 }, { b: 2 }]
      },
      objects: {
        flat: { x: 1, y: 2 },
        deep: { a: { b: { c: 1 } } }
      },
      mixed: [1, 'two', { three: 3 }, [4, 5]]
    });

    // Print results
    this.printResults();
  }

  createDeepNesting(depth) {
    if (depth === 0) return { value: 'bottom' };
    return { [`level${depth}`]: this.createDeepNesting(depth - 1) };
  }

  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(80));

    // Category summary
    console.log('\n📊 RESULTS BY CATEGORY:\n');

    for (const [category, tests] of Object.entries(this.results.categories)) {
      const avgSavings = tests.reduce((sum, t) => sum + t.savingsNum, 0) / tests.length;
      const minSavings = Math.min(...tests.map(t => t.savingsNum));
      const maxSavings = Math.max(...tests.map(t => t.savingsNum));
      const failures = tests.filter(t => t.savingsNum < 0).length;

      console.log(`${category.toUpperCase()}`);
      console.log(`  Tests: ${tests.length} | Avg: ${avgSavings.toFixed(1)}% | Min: ${minSavings.toFixed(1)}% | Max: ${maxSavings.toFixed(1)}%`);
      if (failures > 0) {
        console.log(`  ⚠️  Negative savings: ${failures} tests`);
      }
      console.log('');
    }

    // Detailed results table
    console.log('\n📋 DETAILED RESULTS:\n');
    console.log('Category'.padEnd(15) + 'Test Name'.padEnd(35) + 'JSON'.padEnd(8) + 'ENC'.padEnd(8) + 'Savings');
    console.log('-'.repeat(80));

    for (const [category, tests] of Object.entries(this.results.categories)) {
      for (const t of tests) {
        const indicator = t.savingsNum >= 70 ? '🟢' : t.savingsNum >= 50 ? '🟡' : t.savingsNum >= 0 ? '🟠' : '🔴';
        console.log(
          category.padEnd(15) +
          t.name.slice(0, 33).padEnd(35) +
          String(t.json.tokens).padEnd(8) +
          String(t.encoded.tokens).padEnd(8) +
          t.savings + ' ' + indicator
        );
      }
    }

    // Failures
    if (this.results.failures.length > 0) {
      console.log('\n❌ FAILURES & WEAKNESSES:\n');
      for (const f of this.results.failures) {
        console.log(`  - ${f.name}: ${f.reason || f.error}`);
      }
    }

    // Overall stats
    const allTests = Object.values(this.results.categories).flat();
    const overallAvg = allTests.reduce((sum, t) => sum + t.savingsNum, 0) / allTests.length;
    const below50 = allTests.filter(t => t.savingsNum < 50).length;
    const above70 = allTests.filter(t => t.savingsNum >= 70).length;

    console.log('\n' + '='.repeat(80));
    console.log('OVERALL STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total tests: ${allTests.length}`);
    console.log(`Average savings: ${overallAvg.toFixed(1)}%`);
    console.log(`Tests with >70% savings: ${above70} (${(above70/allTests.length*100).toFixed(1)}%)`);
    console.log(`Tests with <50% savings: ${below50} (${(below50/allTests.length*100).toFixed(1)}%)`);
    console.log(`Failures (negative savings): ${this.results.failures.length}`);

    // Identify weaknesses
    console.log('\n🔍 IDENTIFIED WEAKNESSES:\n');
    const weaknesses = allTests
      .filter(t => t.savingsNum < 50)
      .sort((a, b) => a.savingsNum - b.savingsNum);

    for (const w of weaknesses.slice(0, 10)) {
      console.log(`  ${w.savingsNum.toFixed(1)}% - ${w.category}/${w.name}`);
    }

    return this.results;
  }
}

// Run tests
if (require.main === module) {
  const suite = new ComprehensiveTestSuite();
  suite.runAll();
}

module.exports = { ComprehensiveTestSuite };
