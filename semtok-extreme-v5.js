/**
 * SEMTOK v5.0 - EXTREME COMPRESSION
 *
 * Goal: Achieve >75% token reduction without sacrificing LLM comprehension
 *
 * Key innovations:
 * 1. Position-based encoding (eliminate repeated key names)
 * 2. Single-char type markers
 * 3. Implicit structure from patterns
 * 4. Newline as primary delimiter (cheap token)
 * 5. Tab-separated values (1 token regardless of alignment)
 */

class SEMTOKExtreme {
  constructor() {
    // Type markers (single char, high semantic value)
    this.T = {
      OBJ: '@',     // Object/map
      ARR: '*',     // Array/list
      TAB: '#',     // Tabular (uniform object array)
      STR: "'",     // Quoted string
      NUM: '',      // No marker (implicit)
      BOOL_T: '+',  // True
      BOOL_F: '-',  // False
      NULL: '~',    // Null
      REF: '$'      // Reference (for repeated values)
    };

    // Use tab and newline as primary delimiters (both single tokens)
    this.SEP = '\t';   // Column separator
    this.EOL = '\n';   // Row separator
  }

  encode(data, context = {}) {
    if (data === null || data === undefined) return '~';
    if (data === true) return '+';
    if (data === false) return '-';
    if (typeof data === 'number') return String(data);
    if (typeof data === 'string') return this.str(data);

    if (Array.isArray(data)) {
      return this.arr(data, context);
    }

    if (typeof data === 'object') {
      return this.obj(data, context);
    }

    return String(data);
  }

  str(s) {
    if (s === '') return "''";
    // Only quote if contains delimiters
    if (/[\t\n@*#~+-]/.test(s)) {
      return "'" + s.replace(/'/g, "''") + "'";
    }
    return s;
  }

  arr(arr, context) {
    if (arr.length === 0) return '*';

    // Tabular: uniform object arrays
    if (this.isTabular(arr)) {
      return this.tab(arr);
    }

    // Simple array: tab-separated on one line
    if (arr.every(v => typeof v !== 'object')) {
      return '*' + arr.map(v => this.encode(v)).join(this.SEP);
    }

    // Complex array: newline separated
    return arr.map((item, i) =>
      '*' + i + this.SEP + this.encode(item, { depth: (context.depth || 0) + 1 })
    ).join(this.EOL);
  }

  isTabular(arr) {
    if (arr.length < 2) return false;
    if (!arr.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
      return false;
    }
    const keys = Object.keys(arr[0]).sort().join(',');
    return arr.every(item => Object.keys(item).sort().join(',') === keys);
  }

  tab(arr) {
    const keys = Object.keys(arr[0]);
    // Header line: #key1\tkey2\tkey3
    const header = '#' + keys.join(this.SEP);
    // Data lines: val1\tval2\tval3
    const rows = arr.map(item =>
      keys.map(k => this.encode(item[k])).join(this.SEP)
    );
    return header + this.EOL + rows.join(this.EOL);
  }

  obj(obj, context) {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '@';

    const depth = context.depth || 0;

    // Check if all values are primitives
    const isFlat = entries.every(([_, v]) =>
      v === null || typeof v !== 'object'
    );

    if (isFlat) {
      // Inline: key1:val1\tkey2:val2
      return entries.map(([k, v]) =>
        this.str(k) + ':' + this.encode(v)
      ).join(this.SEP);
    }

    // Complex: newline separated with key prefix
    return entries.map(([k, v]) => {
      const key = this.str(k);
      if (typeof v === 'object' && v !== null) {
        if (Array.isArray(v)) {
          if (this.isTabular(v)) {
            return key + this.EOL + this.tab(v);
          }
          return key + ':' + this.arr(v, { depth: depth + 1 });
        }
        // Nested object
        const nested = this.obj(v, { depth: depth + 1 });
        if (nested.includes(this.EOL)) {
          return '@' + key + this.EOL + nested;
        }
        return key + ':' + nested;
      }
      return key + ':' + this.encode(v);
    }).join(this.EOL);
  }

  // ULTRA-COMPACT: Position-based encoding
  // For known schemas, eliminate all key names
  encodePositional(data, schema) {
    if (!schema) return this.encode(data);

    if (Array.isArray(data) && schema.type === 'array') {
      if (schema.items && typeof schema.items === 'object') {
        // Tabular with implicit schema
        const keys = Object.keys(schema.items);
        return '#' + data.map(item =>
          keys.map(k => this.encode(item[k])).join(this.SEP)
        ).join(this.EOL);
      }
    }

    return this.encode(data);
  }

  // Token counting optimized for this format
  countTokens(str) {
    let tokens = 0;
    let inWord = false;
    let wordLen = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (char === '\t' || char === '\n') {
        // Tab and newline are ~1 token each
        if (wordLen > 0) {
          tokens += Math.ceil(wordLen / 4);
          wordLen = 0;
        }
        tokens += 0.5; // Whitespace tokens are cheap
      } else if (/[@*#:~+\-']/.test(char)) {
        if (wordLen > 0) {
          tokens += Math.ceil(wordLen / 4);
          wordLen = 0;
        }
        tokens += 0.5; // Single punctuation
      } else if (/[a-zA-Z0-9_]/.test(char)) {
        wordLen++;
      } else {
        if (wordLen > 0) {
          tokens += Math.ceil(wordLen / 4);
          wordLen = 0;
        }
        tokens += 0.5;
      }
    }

    if (wordLen > 0) {
      tokens += Math.ceil(wordLen / 4);
    }

    return Math.ceil(tokens);
  }

  compare(data) {
    const json = JSON.stringify(data);
    const extreme = this.encode(data);

    const jsonTok = this.countTokens(json);
    const extremeTok = this.countTokens(extreme);

    return {
      json: { text: json, chars: json.length, tokens: jsonTok },
      extreme: { text: extreme, chars: extreme.length, tokens: extremeTok },
      savings: ((jsonTok - extremeTok) / jsonTok * 100).toFixed(1) + '%',
      charReduction: ((json.length - extreme.length) / json.length * 100).toFixed(1) + '%'
    };
  }
}

// ============================================
// BINARY-INSPIRED ENCODING
// ============================================

class BinaryInspiredEncoder {
  /**
   * Uses minimal character patterns inspired by binary efficiency:
   * - Position encodes type (first char = type)
   * - Values separated by single delimiter
   * - No repeated structure markers
   */

  encode(data) {
    return this._encode(data, 0);
  }

  _encode(data, depth) {
    if (data === null) return '0';
    if (data === true) return '1';
    if (data === false) return '2';
    if (typeof data === 'number') return '3' + data;
    if (typeof data === 'string') return '4' + this.escStr(data);

    if (Array.isArray(data)) {
      if (data.length === 0) return '5';
      if (this.isTabular(data)) {
        const keys = Object.keys(data[0]);
        const header = keys.join(',');
        const rows = data.map(obj =>
          keys.map(k => this.val(obj[k])).join(',')
        ).join(';');
        return '6' + header + ':' + rows;
      }
      return '7' + data.map(v => this._encode(v, depth + 1)).join('|');
    }

    if (typeof data === 'object') {
      return '8' + Object.entries(data).map(([k, v]) =>
        k + '=' + this._encode(v, depth + 1)
      ).join('|');
    }

    return String(data);
  }

  val(v) {
    if (v === null) return '0';
    if (v === true) return '1';
    if (v === false) return '2';
    return String(v);
  }

  escStr(s) {
    return s.replace(/[|;:=,]/g, c => '\\' + c);
  }

  isTabular(arr) {
    if (arr.length < 2) return false;
    if (!arr.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
      return false;
    }
    const keys = Object.keys(arr[0]).sort().join(',');
    return arr.every(item => Object.keys(item).sort().join(',') === keys);
  }

  countTokens(str) {
    return Math.ceil(str.length / 3.5);
  }
}

// ============================================
// BENCHMARK
// ============================================

function runExtremeBenchmark() {
  const extreme = new SEMTOKExtreme();
  const binary = new BinaryInspiredEncoder();

  console.log('='.repeat(80));
  console.log('SEMTOK v5.0 EXTREME - Maximum Compression Benchmark');
  console.log('='.repeat(80));

  const testCases = [
    { name: 'Flat', data: { name: 'Alice', age: 30, active: true } },
    { name: 'Tabular', data: { u: [
      { i: 1, n: 'A', r: 'a' },
      { i: 2, n: 'B', r: 'u' },
      { i: 3, n: 'C', r: 'u' }
    ]}},
    { name: 'Nested', data: { db: { h: 'local', p: 5432 }, c: { e: true, t: 3600 } }},
    { name: 'Complex', data: {
      s: { t: 'mesh', a: [
        { n: 'c', s: 1, t: 12 },
        { n: 'w', s: 1, t: 8 }
      ]},
      x: { p: 'r', q: 3 }
    }},
    { name: 'Large50', data: { d: Array.from({ length: 50 }, (_, i) => ({ i, v: i * 2 })) }},
    { name: 'Large100', data: { d: Array.from({ length: 100 }, (_, i) => ({ i, v: i * 3 })) }}
  ];

  let totals = { json: 0, extreme: 0, binary: 0 };

  console.log('\n--- RESULTS ---\n');

  for (const test of testCases) {
    const json = JSON.stringify(test.data);
    const ext = extreme.encode(test.data);
    const bin = binary.encode(test.data);

    const jsonTok = extreme.countTokens(json);
    const extTok = extreme.countTokens(ext);
    const binTok = binary.countTokens(bin);

    totals.json += jsonTok;
    totals.extreme += extTok;
    totals.binary += binTok;

    const extSav = ((jsonTok - extTok) / jsonTok * 100).toFixed(1);
    const binSav = ((jsonTok - binTok) / jsonTok * 100).toFixed(1);

    console.log(`[${test.name}]`);
    console.log(`  JSON     (${String(jsonTok).padStart(4)} tok): ${json.slice(0, 60)}...`);
    console.log(`  EXTREME  (${String(extTok).padStart(4)} tok): ${ext.slice(0, 60).replace(/\n/g, '↵').replace(/\t/g, '→')}...`);
    console.log(`  BINARY   (${String(binTok).padStart(4)} tok): ${bin.slice(0, 60)}...`);
    console.log(`  Savings: EXTREME ${extSav}% | BINARY ${binSav}%`);
    console.log('');
  }

  // Summary
  const extTotal = ((totals.json - totals.extreme) / totals.json * 100).toFixed(1);
  const binTotal = ((totals.json - totals.binary) / totals.json * 100).toFixed(1);

  console.log('='.repeat(80));
  console.log('FINAL RESULTS');
  console.log('='.repeat(80));
  console.log(`JSON Total:    ${totals.json} tokens (baseline)`);
  console.log(`EXTREME Total: ${totals.extreme} tokens (${extTotal}% savings)`);
  console.log(`BINARY Total:  ${totals.binary} tokens (${binTotal}% savings)`);
  console.log('');

  const winner = totals.extreme < totals.binary ? 'EXTREME' : 'BINARY';
  const winSav = totals.extreme < totals.binary ? extTotal : binTotal;
  console.log(`🏆 WINNER: ${winner} with ${winSav}% total savings`);

  // Target check
  console.log('');
  console.log('='.repeat(80));
  const best = Math.min(totals.extreme, totals.binary);
  const bestSav = ((totals.json - best) / totals.json * 100);
  if (bestSav >= 75) {
    console.log(`✅ TARGET MET: ${bestSav.toFixed(1)}% >= 75%`);
  } else if (bestSav >= 70) {
    console.log(`🔶 CLOSE: ${bestSav.toFixed(1)}% (target: 75%)`);
  } else {
    console.log(`❌ Gap to target: ${(75 - bestSav).toFixed(1)}%`);
  }
  console.log('='.repeat(80));

  // Show detailed output for best format
  console.log('\n--- BEST FORMAT DETAILED OUTPUT ---\n');
  for (const test of testCases.slice(0, 4)) {
    console.log(`[${test.name}]`);
    console.log('JSON:', JSON.stringify(test.data));
    console.log('BEST:', extreme.encode(test.data).replace(/\n/g, '↵').replace(/\t/g, '→'));
    console.log('');
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runExtremeBenchmark();
}

module.exports = { SEMTOKExtreme, BinaryInspiredEncoder };
