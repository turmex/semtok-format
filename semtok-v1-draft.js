/**
 * SEMTOK v1.0 - Semantic Token-Optimized Notation
 *
 * A novel serialization format designed for maximum LLM efficiency
 * combining XML's semantic clarity with TOON's token efficiency.
 *
 * Design Principles:
 * 1. Semantic delimiters (words > punctuation) for LLM comprehension
 * 2. Single-token markers where possible
 * 3. Schema-first declaration for tabular data
 * 4. Whitespace-based hierarchy (no closing braces)
 * 5. Type inference to minimize markers
 */

// ============================================
// SEMTOK SPECIFICATION v1.0
// ============================================

/*
SYNTAX OVERVIEW:

1. PRIMITIVES
   - Strings: unquoted unless containing special chars
   - Numbers: as-is (123, 45.67, -89)
   - Booleans: yes/no (shorter than true/false)
   - Null: ~ (single char, common in YAML)

2. OBJECTS/MAPS
   Use ">" prefix for semantic section marker:
   >user
     name Alice
     age 30

3. ARRAYS/LISTS
   Use "+" for list items (semantic "add"):
   +items
     Apple
     Banana
     Cherry

4. TABULAR ARRAYS (uniform objects)
   Use "|" header row, then space-separated values:
   |users name age role
     Alice 30 admin
     Bob 25 user

5. NESTED STRUCTURES
   Indentation (2 spaces) for hierarchy:
   >config
     >database
       host localhost
       port 5432
     >cache
       enabled yes

6. SPECIAL VALUES
   - Empty string: ""
   - String with spaces: "hello world"
   - String with special chars: `contains > special`

7. COMMENTS
   # comment line
*/

class SEMTOK {
  constructor() {
    this.INDENT = '  '; // 2 spaces
  }

  // ============================================
  // ENCODER: JSON -> SEMTOK
  // ============================================

  encode(data, indent = 0) {
    if (data === null || data === undefined) {
      return '~';
    }

    if (typeof data === 'boolean') {
      return data ? 'yes' : 'no';
    }

    if (typeof data === 'number') {
      return String(data);
    }

    if (typeof data === 'string') {
      return this.encodeString(data);
    }

    if (Array.isArray(data)) {
      return this.encodeArray(data, indent);
    }

    if (typeof data === 'object') {
      return this.encodeObject(data, indent);
    }

    return String(data);
  }

  encodeString(str) {
    if (str === '') return '""';
    if (str.length === 0) return '""';

    // Check if needs quoting
    const needsQuotes = /[\s\n\r\t>|+#~`]/.test(str) ||
                        str === 'yes' || str === 'no' ||
                        /^-?\d+\.?\d*$/.test(str);

    if (needsQuotes) {
      // Use backticks for strings with quotes, double quotes otherwise
      if (str.includes('"') && !str.includes('`')) {
        return '`' + str + '`';
      }
      return '"' + str.replace(/"/g, '\\"') + '"';
    }

    return str;
  }

  encodeArray(arr, indent) {
    if (arr.length === 0) return '+empty';

    const prefix = this.INDENT.repeat(indent);

    // Check if tabular (array of uniform objects)
    if (this.isTabular(arr)) {
      return this.encodeTabular(arr, indent);
    }

    // Simple array
    const lines = arr.map(item => {
      if (typeof item === 'object' && item !== null) {
        return prefix + this.INDENT + this.encode(item, indent + 1);
      }
      return prefix + this.INDENT + this.encode(item, indent);
    });

    return lines.join('\n');
  }

  isTabular(arr) {
    if (arr.length < 2) return false;
    if (!arr.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
      return false;
    }

    // Check if all objects have same keys
    const firstKeys = Object.keys(arr[0]).sort().join(',');
    return arr.every(item => Object.keys(item).sort().join(',') === firstKeys);
  }

  encodeTabular(arr, indent) {
    const prefix = this.INDENT.repeat(indent);
    const keys = Object.keys(arr[0]);

    // Header row with | marker
    const header = prefix + '|' + keys.join(' ');

    // Data rows
    const rows = arr.map(item => {
      const values = keys.map(k => this.encode(item[k], 0));
      return prefix + this.INDENT + values.join(' ');
    });

    return header + '\n' + rows.join('\n');
  }

  encodeObject(obj, indent) {
    const prefix = this.INDENT.repeat(indent);
    const entries = Object.entries(obj);

    if (entries.length === 0) return '>empty';

    const lines = entries.map(([key, value]) => {
      const safeKey = this.encodeString(key);

      if (value === null || value === undefined) {
        return prefix + safeKey + ' ~';
      }

      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          if (this.isTabular(value)) {
            return prefix + safeKey + '\n' + this.encodeTabular(value, indent + 1);
          }
          return prefix + '+' + safeKey + '\n' + this.encodeArray(value, indent + 1);
        }
        // Nested object
        return prefix + '>' + safeKey + '\n' + this.encodeObject(value, indent + 1);
      }

      return prefix + safeKey + ' ' + this.encode(value, indent);
    });

    return lines.join('\n');
  }

  // ============================================
  // DECODER: SEMTOK -> JSON
  // ============================================

  decode(semtok) {
    const lines = semtok.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    });

    return this.parseLines(lines, 0).value;
  }

  parseLines(lines, startIndent) {
    if (lines.length === 0) return { value: null, consumed: 0 };

    const result = {};
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const indent = this.getIndent(line);
      const content = line.trim();

      if (indent < startIndent) {
        break; // End of this block
      }

      if (content.startsWith('|')) {
        // Tabular array
        const { value, consumed } = this.parseTabular(lines.slice(i), indent);
        // Need to find the key from previous context or use default
        return { value, consumed: i + consumed };
      }

      if (content.startsWith('>')) {
        // Object section
        const key = content.slice(1);
        const { value, consumed } = this.parseLines(lines.slice(i + 1), indent + 1);
        result[key] = value;
        i += consumed + 1;
        continue;
      }

      if (content.startsWith('+')) {
        // Array section
        const key = content.slice(1);
        const { value, consumed } = this.parseArray(lines.slice(i + 1), indent + 1);
        result[key] = value;
        i += consumed + 1;
        continue;
      }

      // Key-value pair
      const spaceIdx = content.indexOf(' ');
      if (spaceIdx > 0) {
        const key = content.slice(0, spaceIdx);
        const rawValue = content.slice(spaceIdx + 1);
        result[key] = this.parseValue(rawValue);
      }

      i++;
    }

    return { value: result, consumed: i };
  }

  parseTabular(lines, baseIndent) {
    const header = lines[0].trim().slice(1); // Remove |
    const keys = header.split(/\s+/);
    const result = [];
    let i = 1;

    while (i < lines.length) {
      const indent = this.getIndent(lines[i]);
      if (indent <= baseIndent) break;

      const values = lines[i].trim().split(/\s+/);
      const obj = {};
      keys.forEach((key, idx) => {
        obj[key] = this.parseValue(values[idx] || '');
      });
      result.push(obj);
      i++;
    }

    return { value: result, consumed: i };
  }

  parseArray(lines, baseIndent) {
    const result = [];
    let i = 0;

    while (i < lines.length) {
      const indent = this.getIndent(lines[i]);
      if (indent < baseIndent) break;

      result.push(this.parseValue(lines[i].trim()));
      i++;
    }

    return { value: result, consumed: i };
  }

  parseValue(str) {
    if (str === '~') return null;
    if (str === 'yes') return true;
    if (str === 'no') return false;
    if (str === '""') return '';
    if (str === '>empty' || str === '+empty') return str.startsWith('>') ? {} : [];

    // Quoted string
    if ((str.startsWith('"') && str.endsWith('"')) ||
        (str.startsWith('`') && str.endsWith('`'))) {
      return str.slice(1, -1);
    }

    // Number
    if (/^-?\d+\.?\d*$/.test(str)) {
      return str.includes('.') ? parseFloat(str) : parseInt(str, 10);
    }

    return str;
  }

  getIndent(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length / 2 : 0;
  }

  // ============================================
  // UTILITIES
  // ============================================

  // Approximate token count (4 chars ≈ 1 token)
  countTokens(str) {
    return Math.ceil(str.length / 4);
  }

  // Compare with JSON
  compare(data) {
    const json = JSON.stringify(data);
    const semtok = this.encode(data);

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
// TEST SUITE
// ============================================

function runTests() {
  const semtok = new SEMTOK();

  console.log('='.repeat(60));
  console.log('SEMTOK v1.0 - Token Efficiency Benchmark');
  console.log('='.repeat(60));

  // Test 1: Flat object
  console.log('\n--- TEST 1: Flat Object ---');
  const flat = {
    name: 'Alice',
    age: 30,
    active: true,
    role: 'admin'
  };
  let result = semtok.compare(flat);
  console.log('JSON:', result.json.text);
  console.log('SEMTOK:\n' + result.semtok.text);
  console.log(`Savings: ${result.savings}`);

  // Test 2: Tabular array
  console.log('\n--- TEST 2: Tabular Array ---');
  const tabular = {
    users: [
      { id: 1, name: 'Alice', role: 'admin' },
      { id: 2, name: 'Bob', role: 'user' },
      { id: 3, name: 'Carol', role: 'user' }
    ]
  };
  result = semtok.compare(tabular);
  console.log('JSON:', result.json.text);
  console.log('SEMTOK:\n' + result.semtok.text);
  console.log(`Savings: ${result.savings}`);

  // Test 3: Nested object
  console.log('\n--- TEST 3: Nested Object ---');
  const nested = {
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
  };
  result = semtok.compare(nested);
  console.log('JSON:', result.json.text);
  console.log('SEMTOK:\n' + result.semtok.text);
  console.log(`Savings: ${result.savings}`);

  // Test 4: Complex mixed
  console.log('\n--- TEST 4: Complex Mixed ---');
  const complex = {
    swarm: {
      topology: 'mesh',
      agents: [
        { name: 'coordinator', status: 'active', tasks: 12 },
        { name: 'worker-1', status: 'active', tasks: 8 },
        { name: 'worker-2', status: 'idle', tasks: 0 }
      ]
    },
    consensus: {
      protocol: 'raft',
      quorum: 3
    }
  };
  result = semtok.compare(complex);
  console.log('JSON:', result.json.text);
  console.log('SEMTOK:\n' + result.semtok.text);
  console.log(`Savings: ${result.savings}`);

  // Test 5: Large tabular
  console.log('\n--- TEST 5: Large Tabular (50 records) ---');
  const largeTabular = {
    orders: Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      product: `Product-${i + 1}`,
      qty: Math.floor(Math.random() * 100),
      price: (Math.random() * 100).toFixed(2)
    }))
  };
  result = semtok.compare(largeTabular);
  console.log('JSON chars:', result.json.chars);
  console.log('SEMTOK chars:', result.semtok.chars);
  console.log(`Savings: ${result.savings}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(60));

  const tests = [
    { name: 'Flat Object', data: flat },
    { name: 'Tabular Array', data: tabular },
    { name: 'Nested Object', data: nested },
    { name: 'Complex Mixed', data: complex },
    { name: 'Large Tabular', data: largeTabular }
  ];

  let totalJsonTokens = 0;
  let totalSemtokTokens = 0;

  tests.forEach(test => {
    const r = semtok.compare(test.data);
    totalJsonTokens += r.json.tokens;
    totalSemtokTokens += r.semtok.tokens;
    console.log(`${test.name}: ${r.savings} savings`);
  });

  const overallSavings = ((totalJsonTokens - totalSemtokTokens) / totalJsonTokens * 100).toFixed(1);
  console.log(`\nOVERALL AVERAGE SAVINGS: ${overallSavings}%`);
  console.log(`Total JSON tokens: ${totalJsonTokens}`);
  console.log(`Total SEMTOK tokens: ${totalSemtokTokens}`);
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runTests();
}

module.exports = { SEMTOK };
