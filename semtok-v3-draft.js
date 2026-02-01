/**
 * SEMTOK v3.0 - Semantic Token-Optimized Notation
 *
 * v3 BREAKTHROUGH: Scope Blocks
 * - Define path scope once, then use short keys
 * - Combines best of indentation + path notation
 * - Hybrid approach for maximum efficiency
 */

class SEMTOKv3 {
  constructor() {
    this.INDENT = '  ';
  }

  // ============================================
  // v3 ENCODER: JSON -> SEMTOK
  // ============================================

  encode(data, options = {}) {
    const context = {
      indent: options.indent || 0,
      scope: options.scope || ''
    };

    if (data === null || data === undefined) return '~';
    if (typeof data === 'boolean') return data ? 'Y' : 'N';
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

    // Minimal quoting - only when necessary
    if (/[\s\n\r\t@>|#~]/.test(str) ||
        str === 'Y' || str === 'N' ||
        /^-?\d+\.?\d*$/.test(str)) {
      // Use single quote for most strings (1 char vs 2)
      if (!str.includes("'")) return "'" + str + "'";
      if (!str.includes('"')) return '"' + str + '"';
      return '`' + str.replace(/`/g, '\\`') + '`';
    }

    return str;
  }

  encodeArray(arr, context) {
    if (arr.length === 0) return '[]';

    // Tabular format for uniform object arrays
    if (this.isTabular(arr)) {
      return this.encodeTabular(arr, context);
    }

    // Inline for simple primitive arrays
    if (arr.every(v => typeof v !== 'object')) {
      const values = arr.map(v => this.encode(v));
      // Super compact: space-separated in brackets
      return '[' + values.join(' ') + ']';
    }

    // Complex arrays with items
    const prefix = this.INDENT.repeat(context.indent);
    return arr.map(item => {
      const encoded = this.encode(item, { indent: context.indent + 1 });
      return prefix + '- ' + encoded.split('\n').join('\n' + prefix + '  ');
    }).join('\n');
  }

  isTabular(arr) {
    if (arr.length < 2) return false;
    const isObjArr = arr.every(item =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
    );
    if (!isObjArr) return false;

    const keys = Object.keys(arr[0]).sort().join(',');
    return arr.every(item => Object.keys(item).sort().join(',') === keys);
  }

  encodeTabular(arr, context) {
    const keys = Object.keys(arr[0]);
    const prefix = this.INDENT.repeat(context.indent);

    // Compact: header with | then space-separated values
    const header = '|' + keys.join(' ');
    const rows = arr.map(item => {
      return keys.map(k => {
        const v = this.encode(item[k]);
        return v.includes(' ') && !v.startsWith("'") && !v.startsWith('"')
          ? "'" + v + "'"
          : v;
      }).join(' ');
    });

    return header + '\n' + rows.map(r => prefix + r).join('\n');
  }

  encodeObject(obj, context) {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';

    const prefix = this.INDENT.repeat(context.indent);
    const lines = [];

    // Analyze structure to choose best encoding
    const analysis = this.analyzeObject(obj);

    if (analysis.isFlat) {
      // All primitive values - ultra compact inline
      return entries.map(([k, v]) => k + '=' + this.encode(v)).join(' ');
    }

    for (const [key, value] of entries) {
      if (value === null || value === undefined) {
        lines.push(prefix + key + '=~');
        continue;
      }

      if (typeof value !== 'object') {
        lines.push(prefix + key + '=' + this.encode(value));
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(prefix + key + '=[]');
        } else if (this.isTabular(value)) {
          lines.push(prefix + key);
          lines.push(this.encodeTabular(value, { indent: context.indent + 1 }));
        } else if (value.every(v => typeof v !== 'object')) {
          lines.push(prefix + key + '=' + this.encodeArray(value, context));
        } else {
          lines.push(prefix + key);
          lines.push(this.encodeArray(value, { indent: context.indent + 1 }));
        }
        continue;
      }

      // NESTED OBJECT - use scope block with @
      const nestedAnalysis = this.analyzeObject(value);

      if (nestedAnalysis.isFlat && nestedAnalysis.count <= 4) {
        // Inline small flat objects
        const inline = Object.entries(value)
          .map(([k, v]) => k + '=' + this.encode(v))
          .join(' ');
        lines.push(prefix + key + ':{' + inline + '}');
      } else {
        // Scope block for nested objects
        lines.push(prefix + '@' + key);
        const nested = this.encodeObject(value, { indent: context.indent + 1 });
        lines.push(nested);
      }
    }

    return lines.join('\n');
  }

  analyzeObject(obj) {
    const entries = Object.entries(obj);
    const isFlat = entries.every(([_, v]) =>
      v === null || typeof v !== 'object'
    );
    return {
      count: entries.length,
      isFlat,
      depth: isFlat ? 1 : this.getDepth(obj)
    };
  }

  getDepth(obj, current = 1) {
    let maxDepth = current;
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        maxDepth = Math.max(maxDepth, this.getDepth(value, current + 1));
      }
    }
    return maxDepth;
  }

  // ============================================
  // TOKEN COUNTING (research-based)
  // ============================================

  countTokens(str) {
    // Based on research: ~3.5-4 chars per token average
    // But punctuation often = 1 token each
    // Let's use character-weighted counting

    let tokens = 0;
    let wordChars = 0;

    for (const char of str) {
      if (/[{}[\]"':;,<>@#|]/.test(char)) {
        // Punctuation often 1 token
        if (wordChars > 0) {
          tokens += Math.ceil(wordChars / 4);
          wordChars = 0;
        }
        tokens += 0.5; // Punctuation averages ~0.5 tokens
      } else if (/\s/.test(char)) {
        if (wordChars > 0) {
          tokens += Math.ceil(wordChars / 4);
          wordChars = 0;
        }
        // Whitespace is cheap
        tokens += 0.1;
      } else {
        wordChars++;
      }
    }

    if (wordChars > 0) {
      tokens += Math.ceil(wordChars / 4);
    }

    return Math.ceil(tokens);
  }

  compare(data) {
    const json = JSON.stringify(data);
    const semtok = this.encode(data);

    const jsonTokens = this.countTokens(json);
    const semtokTokens = this.countTokens(semtok);
    const savings = ((jsonTokens - semtokTokens) / jsonTokens * 100).toFixed(1);

    return {
      json: { text: json, chars: json.length, tokens: jsonTokens },
      semtok: { text: semtok, chars: semtok.length, tokens: semtokTokens },
      savings: `${savings}%`,
      savingsNum: parseFloat(savings)
    };
  }
}

// ============================================
// BENCHMARK SUITE
// ============================================

function runBenchmarks() {
  const semtok = new SEMTOKv3();

  console.log('='.repeat(70));
  console.log('SEMTOK v3.0 - Scope Block Architecture Benchmark');
  console.log('='.repeat(70));

  const testCases = [
    {
      name: 'Flat Object',
      data: { name: 'Alice', age: 30, active: true, role: 'admin' }
    },
    {
      name: 'Tabular Array',
      data: {
        users: [
          { id: 1, name: 'Alice', role: 'admin' },
          { id: 2, name: 'Bob', role: 'user' },
          { id: 3, name: 'Carol', role: 'user' }
        ]
      }
    },
    {
      name: 'Nested Shallow',
      data: {
        database: { host: 'localhost', port: 5432 },
        cache: { enabled: true, ttl: 3600 }
      }
    },
    {
      name: 'Nested Deep',
      data: {
        config: {
          database: { host: 'localhost', port: 5432, ssl: true },
          cache: { enabled: true, ttl: 3600 }
        }
      }
    },
    {
      name: 'Deep 4-Level',
      data: {
        app: {
          server: {
            http: { port: 8080, host: '0.0.0.0' },
            https: { port: 443, cert: '/path/to/cert' }
          }
        }
      }
    },
    {
      name: 'Complex Swarm',
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
      name: 'Large Tabular 50',
      data: {
        orders: Array.from({ length: 50 }, (_, i) => ({
          id: i + 1,
          item: `P${i + 1}`,
          qty: 10 + i,
          price: (10 + i * 0.5).toFixed(2)
        }))
      }
    },
    {
      name: 'Large Tabular 100',
      data: {
        records: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          val: `v${i}`,
          x: i * 2
        }))
      }
    },
    {
      name: 'Simple Array',
      data: { tags: ['js', 'ts', 'py', 'go', 'rust'] }
    },
    {
      name: 'API Response',
      data: {
        status: 'ok',
        data: {
          user: { id: 1, email: 'a@b.com' },
          items: [
            { id: 1, name: 'X', qty: 5 },
            { id: 2, name: 'Y', qty: 3 }
          ]
        },
        meta: { page: 1, total: 50 }
      }
    }
  ];

  let totalJson = 0;
  let totalSemtok = 0;
  const results = [];

  for (const test of testCases) {
    const r = semtok.compare(test.data);
    totalJson += r.json.tokens;
    totalSemtok += r.semtok.tokens;
    results.push({ name: test.name, ...r });
  }

  // Print detailed results
  console.log('\n--- DETAILED OUTPUT ---\n');
  for (const r of results) {
    console.log(`[${r.name}] Savings: ${r.savings}`);
    console.log('SEMTOK:');
    console.log(r.semtok.text);
    console.log('');
  }

  // Summary
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('Test'.padEnd(25) + 'JSON'.padEnd(8) + 'SEMTOK'.padEnd(8) + 'Savings');
  console.log('-'.repeat(70));

  for (const r of results) {
    const color = r.savingsNum >= 50 ? '***' : r.savingsNum >= 30 ? '**' : r.savingsNum >= 0 ? '*' : '!';
    console.log(
      r.name.padEnd(25) +
      String(r.json.tokens).padEnd(8) +
      String(r.semtok.tokens).padEnd(8) +
      r.savings + ' ' + color
    );
  }

  console.log('-'.repeat(70));
  const overall = ((totalJson - totalSemtok) / totalJson * 100).toFixed(1);
  console.log('TOTAL'.padEnd(25) + String(totalJson).padEnd(8) + String(totalSemtok).padEnd(8) + overall + '%');

  console.log('\n' + '='.repeat(70));
  console.log(`TARGET: >60% | ACHIEVED: ${overall}%`);
  if (parseFloat(overall) >= 60) {
    console.log('*** TARGET MET! ***');
  } else {
    console.log(`Gap to target: ${(60 - parseFloat(overall)).toFixed(1)}%`);
  }
  console.log('='.repeat(70));

  // Category analysis
  const categories = {
    Flat: results.filter(r => r.name.includes('Flat')),
    Tabular: results.filter(r => r.name.includes('Tabular')),
    Nested: results.filter(r => r.name.includes('Nested') || r.name.includes('Deep') || r.name.includes('Level')),
    Mixed: results.filter(r => r.name.includes('Complex') || r.name.includes('API')),
    Array: results.filter(r => r.name.includes('Array'))
  };

  console.log('\nBY CATEGORY:');
  for (const [cat, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    const jt = items.reduce((s, r) => s + r.json.tokens, 0);
    const st = items.reduce((s, r) => s + r.semtok.tokens, 0);
    const sav = ((jt - st) / jt * 100).toFixed(1);
    console.log(`  ${cat}: ${sav}%`);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runBenchmarks();
}

module.exports = { SEMTOKv3 };
