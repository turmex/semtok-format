/**
 * SEMTOK v2.0 - Semantic Token-Optimized Notation
 *
 * v2 IMPROVEMENTS:
 * - Compact nested objects using path notation
 * - Inline small objects (≤3 key-value pairs)
 * - Better whitespace optimization
 * - Semantic markers optimized for single tokens
 */

class SEMTOKv2 {
  constructor(options = {}) {
    this.INDENT = '  ';
    this.INLINE_THRESHOLD = 3; // Max KV pairs for inline
    this.PATH_SEPARATOR = '.'; // Dot notation for paths
  }

  // ============================================
  // ENCODER v2: JSON -> SEMTOK
  // ============================================

  encode(data, context = { indent: 0, path: '' }) {
    if (data === null || data === undefined) return '~';
    if (typeof data === 'boolean') return data ? 'Y' : 'N'; // Even shorter
    if (typeof data === 'number') return String(data);
    if (typeof data === 'string') return this.encodeString(data);

    if (Array.isArray(data)) {
      return this.encodeArray(data, context);
    }

    if (typeof data === 'object') {
      return this.encodeObject(data, context);
    }

    return String(data);
  }

  encodeString(str) {
    if (str === '') return '""';

    // Check if needs quoting
    const needsQuotes = /[\s\n\r\t.>|+#~`=]/.test(str) ||
                        str === 'Y' || str === 'N' ||
                        /^-?\d+\.?\d*$/.test(str);

    if (needsQuotes) {
      if (str.includes('"') && !str.includes('`')) {
        return '`' + str + '`';
      }
      return '"' + str.replace(/"/g, '\\"') + '"';
    }

    return str;
  }

  encodeArray(arr, context) {
    if (arr.length === 0) return '[]';

    const prefix = this.INDENT.repeat(context.indent);

    // Check if tabular (array of uniform objects)
    if (this.isTabular(arr)) {
      return this.encodeTabular(arr, context);
    }

    // Check if simple array (primitives only)
    if (arr.every(item => typeof item !== 'object')) {
      // Inline simple arrays
      return '[' + arr.map(item => this.encode(item, context)).join(' ') + ']';
    }

    // Complex array
    const lines = arr.map(item => {
      const encoded = this.encode(item, { ...context, indent: context.indent + 1 });
      return prefix + this.INDENT + '- ' + encoded.trimStart();
    });

    return lines.join('\n');
  }

  isTabular(arr) {
    if (arr.length < 2) return false;
    if (!arr.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
      return false;
    }
    const firstKeys = Object.keys(arr[0]).sort().join(',');
    return arr.every(item => Object.keys(item).sort().join(',') === firstKeys);
  }

  encodeTabular(arr, context) {
    const prefix = this.INDENT.repeat(context.indent);
    const keys = Object.keys(arr[0]);

    // Compact header with | separator
    const header = '|' + keys.join('|');

    // Data rows - space separated, no prefix on values
    const rows = arr.map(item => {
      const values = keys.map(k => {
        const v = this.encode(item[k], { indent: 0 });
        // Ensure no spaces in values for tabular
        return v.includes(' ') ? `"${v}"` : v;
      });
      return values.join(' ');
    });

    return header + '\n' + prefix + rows.join('\n' + prefix);
  }

  encodeObject(obj, context) {
    const entries = Object.entries(obj);

    if (entries.length === 0) return '{}';

    // OPTIMIZATION 1: Inline small flat objects
    if (this.canInline(obj)) {
      return this.encodeInline(obj);
    }

    // OPTIMIZATION 2: Use path notation for deep single-value chains
    const flatPaths = this.flattenPaths(obj);
    if (flatPaths.length > 0 && this.shouldUsePaths(obj)) {
      return flatPaths.map(([path, value]) => {
        return path + '=' + this.encode(value, { indent: 0 });
      }).join('\n');
    }

    // Standard nested encoding
    const prefix = this.INDENT.repeat(context.indent);
    const lines = [];

    for (const [key, value] of entries) {
      const safeKey = this.encodeString(key);

      if (value === null || value === undefined) {
        lines.push(prefix + safeKey + '=~');
        continue;
      }

      if (typeof value !== 'object') {
        // Simple key=value
        lines.push(prefix + safeKey + '=' + this.encode(value, context));
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(prefix + safeKey + '=[]');
        } else if (this.isTabular(value)) {
          lines.push(prefix + safeKey);
          lines.push(prefix + this.INDENT + this.encodeTabular(value, { indent: context.indent + 1 }));
        } else if (value.every(v => typeof v !== 'object')) {
          // Inline simple arrays
          lines.push(prefix + safeKey + '=' + this.encodeArray(value, context));
        } else {
          lines.push(prefix + safeKey);
          lines.push(this.encodeArray(value, { indent: context.indent + 1 }));
        }
        continue;
      }

      // Nested object - check if can inline
      if (this.canInline(value)) {
        lines.push(prefix + safeKey + '=' + this.encodeInline(value));
      } else {
        lines.push(prefix + safeKey);
        lines.push(this.encodeObject(value, { indent: context.indent + 1 }));
      }
    }

    return lines.join('\n');
  }

  canInline(obj) {
    const entries = Object.entries(obj);
    if (entries.length > this.INLINE_THRESHOLD) return false;

    // All values must be primitives
    return entries.every(([_, v]) =>
      v === null || typeof v !== 'object'
    );
  }

  encodeInline(obj) {
    // Format: {k1=v1 k2=v2 k3=v3}
    const pairs = Object.entries(obj).map(([k, v]) =>
      this.encodeString(k) + '=' + this.encode(v, { indent: 0 })
    );
    return '{' + pairs.join(' ') + '}';
  }

  flattenPaths(obj, prefix = '') {
    const result = [];

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? prefix + '.' + key : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result.push(...this.flattenPaths(value, path));
      } else {
        result.push([path, value]);
      }
    }

    return result;
  }

  shouldUsePaths(obj) {
    // Use paths if object is deeply nested with few leaves
    const paths = this.flattenPaths(obj);
    const depth = Math.max(...paths.map(([p]) => p.split('.').length));
    return depth >= 2 && paths.length <= 10;
  }

  // ============================================
  // UTILITIES
  // ============================================

  countTokens(str) {
    // More accurate approximation based on research:
    // - Common words are often 1 token
    // - Punctuation is often 1 token each
    // - Numbers vary
    // Using 3.5 chars per token as better estimate
    return Math.ceil(str.length / 3.5);
  }

  compare(data) {
    const json = JSON.stringify(data);
    const semtok = this.encode(data, { indent: 0 });

    const jsonTokens = this.countTokens(json);
    const semtokTokens = this.countTokens(semtok);
    const savings = ((jsonTokens - semtokTokens) / jsonTokens * 100).toFixed(1);

    return {
      json: { text: json, chars: json.length, tokens: jsonTokens },
      semtok: { text: semtok, chars: semtok.length, tokens: semtokTokens },
      savings: `${savings}%`
    };
  }
}

// ============================================
// COMPREHENSIVE BENCHMARK
// ============================================

function runBenchmarks() {
  const semtok = new SEMTOKv2();

  console.log('='.repeat(70));
  console.log('SEMTOK v2.0 - Comprehensive Token Efficiency Benchmark');
  console.log('='.repeat(70));

  const testCases = [
    {
      name: 'Flat Object (simple)',
      data: { name: 'Alice', age: 30, active: true, role: 'admin' }
    },
    {
      name: 'Tabular Array (users)',
      data: {
        users: [
          { id: 1, name: 'Alice', role: 'admin' },
          { id: 2, name: 'Bob', role: 'user' },
          { id: 3, name: 'Carol', role: 'user' }
        ]
      }
    },
    {
      name: 'Nested Config (shallow)',
      data: {
        database: { host: 'localhost', port: 5432 },
        cache: { enabled: true, ttl: 3600 }
      }
    },
    {
      name: 'Nested Config (deep)',
      data: {
        config: {
          database: {
            host: 'localhost',
            port: 5432,
            ssl: true
          },
          cache: {
            enabled: true,
            ttl: 3600
          }
        }
      }
    },
    {
      name: 'Deep Nesting (4 levels)',
      data: {
        app: {
          server: {
            http: {
              port: 8080,
              host: '0.0.0.0'
            },
            https: {
              port: 443,
              cert: '/path/to/cert'
            }
          }
        }
      }
    },
    {
      name: 'Complex Mixed (swarm)',
      data: {
        swarm: {
          topology: 'mesh',
          agents: [
            { name: 'coordinator', status: 'active', tasks: 12 },
            { name: 'worker-1', status: 'active', tasks: 8 },
            { name: 'worker-2', status: 'idle', tasks: 0 }
          ]
        },
        consensus: { protocol: 'raft', quorum: 3 }
      }
    },
    {
      name: 'Large Tabular (50 records)',
      data: {
        orders: Array.from({ length: 50 }, (_, i) => ({
          id: i + 1,
          product: `Item${i + 1}`,
          qty: Math.floor(Math.random() * 100),
          price: parseFloat((Math.random() * 100).toFixed(2))
        }))
      }
    },
    {
      name: 'Simple Array',
      data: { tags: ['javascript', 'typescript', 'nodejs', 'react'] }
    },
    {
      name: 'Mixed Nesting + Arrays',
      data: {
        project: {
          name: 'semtok',
          version: '2.0.0',
          dependencies: ['lodash', 'express', 'cors'],
          config: {
            minify: true,
            sourcemap: false
          }
        }
      }
    },
    {
      name: 'API Response (realistic)',
      data: {
        status: 'success',
        data: {
          user: { id: 123, email: 'test@example.com' },
          posts: [
            { id: 1, title: 'First Post', likes: 42 },
            { id: 2, title: 'Second Post', likes: 17 }
          ]
        },
        meta: { page: 1, total: 100 }
      }
    }
  ];

  console.log('\nDETAILED RESULTS:\n');

  let totalJsonTokens = 0;
  let totalSemtokTokens = 0;
  const results = [];

  for (const test of testCases) {
    const result = semtok.compare(test.data);
    totalJsonTokens += result.json.tokens;
    totalSemtokTokens += result.semtok.tokens;

    results.push({
      name: test.name,
      ...result
    });

    console.log(`--- ${test.name} ---`);
    console.log('JSON:', result.json.chars, 'chars,', result.json.tokens, 'tokens');
    console.log('SEMTOK:', result.semtok.chars, 'chars,', result.semtok.tokens, 'tokens');
    console.log('Savings:', result.savings);
    console.log('SEMTOK Output:');
    console.log(result.semtok.text);
    console.log('');
  }

  // Summary table
  console.log('='.repeat(70));
  console.log('SUMMARY TABLE');
  console.log('='.repeat(70));
  console.log('Test Case'.padEnd(35) + 'JSON Tok'.padEnd(10) + 'SEMTOK Tok'.padEnd(12) + 'Savings');
  console.log('-'.repeat(70));

  for (const r of results) {
    console.log(
      r.name.padEnd(35) +
      String(r.json.tokens).padEnd(10) +
      String(r.semtok.tokens).padEnd(12) +
      r.savings
    );
  }

  console.log('-'.repeat(70));
  const overallSavings = ((totalJsonTokens - totalSemtokTokens) / totalJsonTokens * 100).toFixed(1);
  console.log(
    'TOTAL'.padEnd(35) +
    String(totalJsonTokens).padEnd(10) +
    String(totalSemtokTokens).padEnd(12) +
    overallSavings + '%'
  );

  console.log('\n' + '='.repeat(70));
  console.log('TARGET: >60% savings | ACHIEVED:', overallSavings + '%');
  console.log('='.repeat(70));

  // Category breakdown
  console.log('\nCATEGORY BREAKDOWN:');
  const categories = {
    'Flat': results.filter(r => r.name.includes('Flat')),
    'Tabular': results.filter(r => r.name.includes('Tabular')),
    'Nested': results.filter(r => r.name.includes('Nested') || r.name.includes('Deep')),
    'Mixed': results.filter(r => r.name.includes('Mixed') || r.name.includes('Complex')),
    'Realistic': results.filter(r => r.name.includes('API') || r.name.includes('Simple'))
  };

  for (const [cat, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    const catJsonTok = items.reduce((sum, r) => sum + r.json.tokens, 0);
    const catSemtokTok = items.reduce((sum, r) => sum + r.semtok.tokens, 0);
    const catSavings = ((catJsonTok - catSemtokTok) / catJsonTok * 100).toFixed(1);
    console.log(`  ${cat}: ${catSavings}% savings`);
  }
}

// Run benchmarks
if (typeof require !== 'undefined' && require.main === module) {
  runBenchmarks();
}

module.exports = { SEMTOKv2 };
