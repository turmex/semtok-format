/**
 * SEMTOK v4.0 - SYMBOLIC Edition
 *
 * Hypothesis: LLMs understand mathematical symbols from training on
 * code, LaTeX, and scientific papers. We can use symbols instead of
 * words for maximum token efficiency WITHOUT sacrificing accuracy.
 *
 * Key symbols (each typically 1 token in cl100k_base):
 * → (arrow): assignment/mapping
 * ∈ (element of): list membership
 * | (pipe): separator/delimiter
 * : (colon): key-value
 * ; (semicolon): end of statement
 * ⊂ (subset): nested scope
 * # (hash): type marker
 * ~ : null
 * + : true
 * - : false
 */

class SEMTOKSymbolic {
  constructor() {
    // Symbolic mappings
    this.SYM = {
      TRUE: '+',      // Mathematical positive
      FALSE: '-',     // Mathematical negative
      NULL: '~',      // Tilde for nothing
      SEP: '|',       // Pipe separator
      ASSIGN: ':',    // Assignment (like math :=)
      NEST: '>',      // Nesting depth marker
      ARRAY: '*',     // Array/list marker
      END: ';',       // Statement end
      HEADER: '#'     // Header/schema marker
    };
  }

  encode(data, depth = 0) {
    if (data === null || data === undefined) return '~';
    if (data === true) return '+';
    if (data === false) return '-';
    if (typeof data === 'number') return String(data);
    if (typeof data === 'string') return this.encodeString(data);

    if (Array.isArray(data)) {
      return this.encodeArray(data, depth);
    }

    if (typeof data === 'object') {
      return this.encodeObject(data, depth);
    }

    return String(data);
  }

  encodeString(str) {
    if (str === '') return '""';
    // Only quote if contains special chars
    if (/[:|;>*#~+\-\n\t]/.test(str) || /^\d/.test(str)) {
      return '"' + str.replace(/"/g, '\\"') + '"';
    }
    return str;
  }

  encodeArray(arr, depth) {
    if (arr.length === 0) return '*';

    // Check if tabular (uniform objects)
    if (this.isTabular(arr)) {
      return this.encodeTabular(arr, depth);
    }

    // Simple primitives: inline with |
    if (arr.every(v => typeof v !== 'object')) {
      return '*' + arr.map(v => this.encode(v)).join('|');
    }

    // Complex array
    const items = arr.map(item => {
      const prefix = '>'.repeat(depth + 1);
      return prefix + this.encode(item, depth + 1);
    });
    return items.join(';');
  }

  isTabular(arr) {
    if (arr.length < 2) return false;
    const isObj = arr.every(item =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
    );
    if (!isObj) return false;
    const keys = Object.keys(arr[0]).sort().join(',');
    return arr.every(item => Object.keys(item).sort().join(',') === keys);
  }

  encodeTabular(arr, depth) {
    const keys = Object.keys(arr[0]);
    // Header: #field1|field2|field3
    const header = '#' + keys.join('|');
    // Rows: val1|val2|val3
    const rows = arr.map(item => {
      return keys.map(k => this.encode(item[k])).join('|');
    });
    return header + ';' + rows.join(';');
  }

  encodeObject(obj, depth) {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';

    // Flat object: inline k:v|k:v
    if (this.isFlat(obj) && entries.length <= 5) {
      return entries.map(([k, v]) =>
        this.encodeString(k) + ':' + this.encode(v)
      ).join('|');
    }

    // Complex: use nesting with >
    const prefix = '>'.repeat(depth);
    return entries.map(([k, v]) => {
      const safeKey = this.encodeString(k);
      if (typeof v === 'object' && v !== null) {
        if (Array.isArray(v)) {
          if (this.isTabular(v)) {
            return prefix + safeKey + ':' + this.encodeTabular(v, depth + 1);
          }
          return prefix + safeKey + ':' + this.encodeArray(v, depth + 1);
        }
        // Nested object
        if (this.isFlat(v) && Object.keys(v).length <= 3) {
          return prefix + safeKey + ':' + this.encodeObject(v, depth);
        }
        return prefix + safeKey + '>' + this.encodeObject(v, depth + 1);
      }
      return prefix + safeKey + ':' + this.encode(v);
    }).join(';');
  }

  isFlat(obj) {
    return Object.values(obj).every(v =>
      v === null || typeof v !== 'object'
    );
  }

  // Ultra-compressed variant using minimal chars
  encodeUltra(data) {
    const json = JSON.stringify(data);
    // Replace common JSON patterns with single chars
    let result = json
      .replace(/":/g, ':')           // Remove quote before colon
      .replace(/,"/g, '|')           // Comma+quote to pipe
      .replace(/\{"/g, '{')          // Opening brace+quote
      .replace(/"\}/g, '}')          // Quote+closing brace
      .replace(/":/g, ':')           // Any remaining
      .replace(/",/g, '|')           // Quote+comma
      .replace(/^\{/, '')            // Remove opening brace
      .replace(/\}$/, '')            // Remove closing brace
      .replace(/\[/g, '*')           // Array open
      .replace(/\]/g, '')            // Array close (implicit)
      .replace(/:true/g, ':+')       // True
      .replace(/:false/g, ':-')      // False
      .replace(/:null/g, ':~');      // Null
    return result;
  }

  // Token counting
  countTokens(str) {
    // More accurate: symbols often 1 token, words ~4 chars/token
    let tokens = 0;
    let wordChars = 0;

    for (const char of str) {
      if (/[{}[\]"':;,|@#$%^&*()<>=~+\-\/\\]/.test(char)) {
        if (wordChars > 0) {
          tokens += Math.ceil(wordChars / 4);
          wordChars = 0;
        }
        tokens += 0.7; // Most punctuation ~0.5-1 token
      } else if (/\s/.test(char)) {
        if (wordChars > 0) {
          tokens += Math.ceil(wordChars / 4);
          wordChars = 0;
        }
        tokens += 0.1;
      } else {
        wordChars++;
      }
    }
    if (wordChars > 0) tokens += Math.ceil(wordChars / 4);
    return Math.ceil(tokens);
  }

  compare(data) {
    const json = JSON.stringify(data);
    const jsonCompact = JSON.stringify(data);
    const symbolic = this.encode(data);
    const ultra = this.encodeUltra(data);

    return {
      json: { text: json, chars: json.length, tokens: this.countTokens(json) },
      symbolic: { text: symbolic, chars: symbolic.length, tokens: this.countTokens(symbolic) },
      ultra: { text: ultra, chars: ultra.length, tokens: this.countTokens(ultra) },
      symbolicSavings: ((this.countTokens(json) - this.countTokens(symbolic)) / this.countTokens(json) * 100).toFixed(1),
      ultraSavings: ((this.countTokens(json) - this.countTokens(ultra)) / this.countTokens(json) * 100).toFixed(1)
    };
  }
}

// ============================================
// EXPERIMENT: Mathematical Symbol Encoding
// ============================================

class MathSymbolicEncoder {
  /**
   * Uses mathematical symbols that LLMs understand from training:
   * ∈ (element): membership
   * → (arrow): mapping
   * ∧ (and): conjunction
   * ∨ (or): disjunction
   * ∅ (empty set): null/empty
   * ⊤ (top): true
   * ⊥ (bottom): false
   * ∀ (for all): iteration
   * ∃ (exists): presence
   */

  encode(data) {
    if (data === null) return '∅';
    if (data === true) return '⊤';
    if (data === false) return '⊥';
    if (typeof data === 'number') return String(data);
    if (typeof data === 'string') return this.str(data);

    if (Array.isArray(data)) {
      if (data.length === 0) return '∅';
      if (this.isTabular(data)) {
        const keys = Object.keys(data[0]);
        const header = keys.join('·');
        const rows = data.map(obj =>
          keys.map(k => this.encode(obj[k])).join('·')
        );
        return '∀' + header + '→' + rows.join('∧');
      }
      return '∈' + data.map(v => this.encode(v)).join('·');
    }

    if (typeof data === 'object') {
      const pairs = Object.entries(data).map(([k, v]) =>
        this.str(k) + '→' + this.encode(v)
      );
      return pairs.join('∧');
    }

    return String(data);
  }

  str(s) {
    if (/[→∧∨∅⊤⊥∀∃∈·\n]/.test(s)) return '"' + s + '"';
    return s;
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
    // Unicode symbols typically 1-2 tokens
    let tokens = 0;
    for (const char of str) {
      if (char.charCodeAt(0) > 127) {
        tokens += 1.5; // Unicode often 1-2 tokens
      } else if (/[a-zA-Z0-9]/.test(char)) {
        tokens += 0.25;
      } else {
        tokens += 0.5;
      }
    }
    return Math.ceil(tokens);
  }
}

// ============================================
// BENCHMARK
// ============================================

function runSymbolicBenchmark() {
  const symbolic = new SEMTOKSymbolic();
  const math = new MathSymbolicEncoder();

  console.log('='.repeat(80));
  console.log('SEMTOK v4.0 SYMBOLIC - Extreme Token Efficiency Experiment');
  console.log('='.repeat(80));

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
      name: 'Nested Config',
      data: {
        database: { host: 'localhost', port: 5432 },
        cache: { enabled: true, ttl: 3600 }
      }
    },
    {
      name: 'Complex Swarm',
      data: {
        swarm: {
          topology: 'mesh',
          agents: [
            { name: 'coord', status: 'on', tasks: 12 },
            { name: 'w1', status: 'on', tasks: 8 },
            { name: 'w2', status: 'off', tasks: 0 }
          ]
        },
        consensus: { protocol: 'raft', quorum: 3 }
      }
    },
    {
      name: 'Large Table 50',
      data: {
        items: Array.from({ length: 50 }, (_, i) => ({
          id: i,
          v: `x${i}`,
          n: i * 2
        }))
      }
    },
    {
      name: 'Large Table 100',
      data: {
        r: Array.from({ length: 100 }, (_, i) => ({
          i: i,
          v: i * 3
        }))
      }
    }
  ];

  console.log('\n--- FORMAT COMPARISON ---\n');

  let totalJson = 0, totalSymbolic = 0, totalUltra = 0, totalMath = 0;

  for (const test of testCases) {
    const json = JSON.stringify(test.data);
    const sym = symbolic.encode(test.data);
    const ultra = symbolic.encodeUltra(test.data);
    const mth = math.encode(test.data);

    const jsonTok = symbolic.countTokens(json);
    const symTok = symbolic.countTokens(sym);
    const ultraTok = symbolic.countTokens(ultra);
    const mathTok = math.countTokens(mth);

    totalJson += jsonTok;
    totalSymbolic += symTok;
    totalUltra += ultraTok;
    totalMath += mathTok;

    console.log(`=== ${test.name} ===`);
    console.log(`JSON (${jsonTok} tok): ${json.slice(0, 80)}${json.length > 80 ? '...' : ''}`);
    console.log(`SYMBOLIC (${symTok} tok): ${sym.slice(0, 80)}${sym.length > 80 ? '...' : ''}`);
    console.log(`ULTRA (${ultraTok} tok): ${ultra.slice(0, 80)}${ultra.length > 80 ? '...' : ''}`);
    console.log(`MATH (${mathTok} tok): ${mth.slice(0, 80)}${mth.length > 80 ? '...' : ''}`);
    console.log(`Savings: Symbolic ${((jsonTok - symTok) / jsonTok * 100).toFixed(1)}% | Ultra ${((jsonTok - ultraTok) / jsonTok * 100).toFixed(1)}% | Math ${((jsonTok - mathTok) / jsonTok * 100).toFixed(1)}%`);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total JSON tokens: ${totalJson}`);
  console.log(`Total SYMBOLIC tokens: ${totalSymbolic} (${((totalJson - totalSymbolic) / totalJson * 100).toFixed(1)}% savings)`);
  console.log(`Total ULTRA tokens: ${totalUltra} (${((totalJson - totalUltra) / totalJson * 100).toFixed(1)}% savings)`);
  console.log(`Total MATH tokens: ${totalMath} (${((totalJson - totalMath) / totalJson * 100).toFixed(1)}% savings)`);

  // Find winner
  const results = [
    { name: 'SYMBOLIC', tokens: totalSymbolic },
    { name: 'ULTRA', tokens: totalUltra },
    { name: 'MATH', tokens: totalMath }
  ].sort((a, b) => a.tokens - b.tokens);

  console.log(`\nWINNER: ${results[0].name} with ${((totalJson - results[0].tokens) / totalJson * 100).toFixed(1)}% total savings`);

  // Show sample outputs for best format
  console.log('\n' + '='.repeat(80));
  console.log('BEST FORMAT SAMPLE OUTPUTS');
  console.log('='.repeat(80));

  for (const test of testCases.slice(0, 3)) {
    console.log(`\n[${test.name}]`);
    console.log('JSON:', JSON.stringify(test.data));
    console.log('BEST:', results[0].name === 'SYMBOLIC' ? symbolic.encode(test.data) :
                        results[0].name === 'ULTRA' ? symbolic.encodeUltra(test.data) :
                        math.encode(test.data));
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runSymbolicBenchmark();
}

module.exports = { SEMTOKSymbolic, MathSymbolicEncoder };
