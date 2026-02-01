#!/usr/bin/env node

/**
 * BENCHMARK ENGINE - Format Comparison Testing Framework
 *
 * A comprehensive benchmark suite for comparing serialization formats:
 * - JSON (baseline)
 * - YAML
 * - TOON (Token-Optimized Object Notation)
 * - SEMTOK (Semantic Token-Optimized Notation) - our new format
 *
 * Features:
 * - Token counting (approximate + tiktoken when available)
 * - Format conversion with round-trip validation
 * - Statistical analysis with confidence intervals
 * - Report generation with savings breakdown
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// SECTION 1: TOKEN COUNTING
// ============================================================================

/**
 * Token Counter - Supports multiple tokenization strategies
 */
class TokenCounter {
    constructor(options = {}) {
        this.useApproximate = options.useApproximate !== false;
        this.tiktoken = null;
        this.encoding = null;

        // Try to load tiktoken if available
        this._initTiktoken();
    }

    async _initTiktoken() {
        try {
            // Attempt to load tiktoken (GPT-4 tokenizer)
            this.tiktoken = require('tiktoken');
            this.encoding = this.tiktoken.encoding_for_model('gpt-4');
            console.log('[TokenCounter] Using tiktoken cl100k_base encoder');
        } catch (e) {
            console.log('[TokenCounter] tiktoken not available, using approximate counting');
            console.log('[TokenCounter] Install with: npm install tiktoken');
        }
    }

    /**
     * Approximate token count: ~4 characters per token
     * This is a reasonable approximation for English text and code
     */
    countApproximate(text) {
        if (!text) return 0;

        // More sophisticated approximation
        // - Punctuation often becomes individual tokens
        // - Numbers and short words can be single tokens
        // - Whitespace is usually merged with adjacent text

        const str = String(text);

        // Count punctuation (often separate tokens)
        const punctuation = (str.match(/[{}[\]:,"\n]/g) || []).length;

        // Remaining characters at ~4 chars per token
        const otherChars = str.length - punctuation;
        const wordTokens = Math.ceil(otherChars / 4);

        return punctuation + wordTokens;
    }

    /**
     * Precise token count using tiktoken
     */
    countPrecise(text) {
        if (!this.encoding) {
            return this.countApproximate(text);
        }

        try {
            const tokens = this.encoding.encode(String(text));
            return tokens.length;
        } catch (e) {
            console.warn('[TokenCounter] Tiktoken error, falling back to approximate:', e.message);
            return this.countApproximate(text);
        }
    }

    /**
     * Count tokens using best available method
     */
    count(text) {
        if (this.encoding && !this.useApproximate) {
            return this.countPrecise(text);
        }
        return this.countApproximate(text);
    }

    /**
     * Get detailed token breakdown
     */
    analyze(text) {
        const str = String(text);
        return {
            characters: str.length,
            lines: str.split('\n').length,
            approximateTokens: this.countApproximate(str),
            preciseTokens: this.encoding ? this.countPrecise(str) : null,
            tokensUsed: this.count(str),
            method: this.encoding && !this.useApproximate ? 'tiktoken' : 'approximate'
        };
    }
}

// ============================================================================
// SECTION 2: FORMAT CONVERTERS
// ============================================================================

/**
 * YAML Converter - JSON to YAML and back
 */
class YAMLConverter {
    /**
     * Convert JSON object to YAML string
     */
    static toYAML(obj, indent = 0) {
        const spaces = '  '.repeat(indent);
        let result = '';

        if (Array.isArray(obj)) {
            for (const item of obj) {
                if (typeof item === 'object' && item !== null) {
                    result += `${spaces}-\n${this.toYAML(item, indent + 1)}`;
                } else {
                    result += `${spaces}- ${this._formatValue(item)}\n`;
                }
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value)) {
                        result += `${spaces}${key}:\n${this.toYAML(value, indent + 1)}`;
                    } else if (Object.keys(value).length === 0) {
                        result += `${spaces}${key}: {}\n`;
                    } else {
                        result += `${spaces}${key}:\n${this.toYAML(value, indent + 1)}`;
                    }
                } else {
                    result += `${spaces}${key}: ${this._formatValue(value)}\n`;
                }
            }
        }

        return result;
    }

    static _formatValue(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'null';
        if (typeof value === 'boolean') return value.toString();
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'string') {
            // Quote strings with special characters
            if (/[:#\[\]{},"'\n]/.test(value) || value === '') {
                return `"${value.replace(/"/g, '\\"')}"`;
            }
            return value;
        }
        return String(value);
    }

    /**
     * Parse YAML string to JSON object (simplified parser)
     */
    static fromYAML(yaml) {
        const lines = yaml.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
        return this._parseYAMLLines(lines, 0).result;
    }

    static _parseYAMLLines(lines, startIndent) {
        const result = {};
        let isArray = false;
        let arrayResult = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const indent = line.search(/\S/);

            if (indent < startIndent) break;
            if (indent > startIndent) {
                i++;
                continue;
            }

            const content = line.trim();

            if (content.startsWith('- ')) {
                isArray = true;
                const value = content.substring(2).trim();
                if (value) {
                    arrayResult.push(this._parseValue(value));
                }
                i++;
            } else if (content.startsWith('-')) {
                isArray = true;
                // Multi-line array item
                const subLines = [];
                i++;
                while (i < lines.length) {
                    const subLine = lines[i];
                    const subIndent = subLine.search(/\S/);
                    if (subIndent <= indent) break;
                    subLines.push(subLine);
                    i++;
                }
                if (subLines.length > 0) {
                    const parsed = this._parseYAMLLines(subLines, indent + 2);
                    arrayResult.push(parsed.result);
                }
            } else if (content.includes(':')) {
                const colonIdx = content.indexOf(':');
                const key = content.substring(0, colonIdx).trim();
                const valueStr = content.substring(colonIdx + 1).trim();

                if (valueStr) {
                    result[key] = this._parseValue(valueStr);
                    i++;
                } else {
                    // Nested object or array
                    const subLines = [];
                    i++;
                    while (i < lines.length) {
                        const subLine = lines[i];
                        const subIndent = subLine.search(/\S/);
                        if (subIndent !== -1 && subIndent <= indent) break;
                        subLines.push(subLine);
                        i++;
                    }
                    if (subLines.length > 0) {
                        const parsed = this._parseYAMLLines(subLines, indent + 2);
                        result[key] = parsed.result;
                    } else {
                        result[key] = null;
                    }
                }
            } else {
                i++;
            }
        }

        return { result: isArray ? arrayResult : result, consumed: i };
    }

    static _parseValue(str) {
        str = str.trim();
        if (str === 'null' || str === '~') return null;
        if (str === 'true') return true;
        if (str === 'false') return false;
        if (/^-?\d+$/.test(str)) return parseInt(str, 10);
        if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
        if (str === '{}') return {};
        if (str === '[]') return [];
        // Remove quotes
        if ((str.startsWith('"') && str.endsWith('"')) ||
            (str.startsWith("'") && str.endsWith("'"))) {
            return str.slice(1, -1);
        }
        return str;
    }
}

/**
 * TOON Converter - Token-Optimized Object Notation
 * Based on the TOON format from research
 */
class TOONConverter {
    /**
     * Convert JSON object to TOON string
     */
    static toTOON(obj, indent = 0) {
        const spaces = '  '.repeat(indent);
        let result = '';

        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return `${spaces}[]\n`;
            }

            // Check if array of uniform objects (tabular data)
            if (this._isUniformObjectArray(obj)) {
                const keys = Object.keys(obj[0]);
                result += `${spaces}[\n`;
                result += `${spaces}  ${keys.join(', ')}\n`;
                for (const item of obj) {
                    const values = keys.map(k => this._formatValue(item[k]));
                    result += `${spaces}  ${values.join(', ')}\n`;
                }
                result += `${spaces}]\n`;
            } else {
                result += `${spaces}[\n`;
                for (const item of obj) {
                    if (typeof item === 'object' && item !== null) {
                        result += this.toTOON(item, indent + 1);
                    } else {
                        result += `${spaces}  ${this._formatValue(item)}\n`;
                    }
                }
                result += `${spaces}]\n`;
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                    result += `${spaces}${key}:\n`;
                    result += this.toTOON(value, indent + 1);
                } else {
                    result += `${spaces}${key}: ${this._formatValue(value)}\n`;
                }
            }
        }

        return result;
    }

    static _isUniformObjectArray(arr) {
        if (!arr.length || typeof arr[0] !== 'object' || arr[0] === null) {
            return false;
        }
        const keys = Object.keys(arr[0]).sort().join(',');
        return arr.every(item =>
            typeof item === 'object' &&
            item !== null &&
            Object.keys(item).sort().join(',') === keys &&
            Object.values(item).every(v => typeof v !== 'object' || v === null)
        );
    }

    static _formatValue(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'null';
        if (typeof value === 'boolean') return value.toString();
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'string') {
            if (/[,:\[\]\n]/.test(value) || value === '') {
                return `"${value.replace(/"/g, '\\"')}"`;
            }
            return value;
        }
        return String(value);
    }

    /**
     * Parse TOON string to JSON object
     */
    static fromTOON(toon) {
        const lines = toon.split('\n').filter(l => l.trim());
        return this._parseTOONLines(lines, 0).result;
    }

    static _parseTOONLines(lines, startIndent) {
        let result = {};
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const indent = line.search(/\S/);

            if (indent < startIndent) break;
            if (indent > startIndent) {
                i++;
                continue;
            }

            const content = line.trim();

            if (content === '[' || content === '[]') {
                if (content === '[]') {
                    return { result: [], consumed: 1 };
                }
                // Parse array
                const arrayResult = [];
                i++;
                let headers = null;

                while (i < lines.length) {
                    const arrLine = lines[i];
                    const arrContent = arrLine.trim();

                    if (arrContent === ']') {
                        i++;
                        break;
                    }

                    const arrIndent = arrLine.search(/\S/);
                    if (arrIndent <= startIndent) break;

                    // Check if this is a header row (first row in tabular format)
                    if (headers === null && !arrContent.includes(':')) {
                        const parts = arrContent.split(',').map(p => p.trim());
                        // If all parts look like identifiers, treat as headers
                        if (parts.every(p => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p))) {
                            headers = parts;
                            i++;
                            continue;
                        }
                    }

                    if (headers) {
                        // Tabular row
                        const values = this._parseCSVRow(arrContent);
                        const obj = {};
                        headers.forEach((h, idx) => {
                            obj[h] = this._parseValue(values[idx] || 'null');
                        });
                        arrayResult.push(obj);
                    } else {
                        // Non-tabular array item
                        if (arrContent.includes(':')) {
                            // Object item - need to parse nested
                            const subLines = [arrLine];
                            i++;
                            while (i < lines.length) {
                                const subLine = lines[i];
                                const subIndent = subLine.search(/\S/);
                                if (subIndent <= arrIndent) break;
                                subLines.push(subLine);
                                i++;
                            }
                            const parsed = this._parseTOONLines(subLines, arrIndent);
                            arrayResult.push(parsed.result);
                            continue;
                        } else {
                            arrayResult.push(this._parseValue(arrContent));
                        }
                    }
                    i++;
                }

                return { result: arrayResult, consumed: i };
            } else if (content.includes(':')) {
                const colonIdx = content.indexOf(':');
                const key = content.substring(0, colonIdx).trim();
                const valueStr = content.substring(colonIdx + 1).trim();

                if (valueStr) {
                    result[key] = this._parseValue(valueStr);
                    i++;
                } else {
                    // Check next line for nested content
                    const subLines = [];
                    i++;
                    while (i < lines.length) {
                        const subLine = lines[i];
                        const subIndent = subLine.search(/\S/);
                        if (subIndent !== -1 && subIndent <= indent) break;
                        subLines.push(subLine);
                        i++;
                    }
                    if (subLines.length > 0) {
                        const parsed = this._parseTOONLines(subLines, indent + 2);
                        result[key] = parsed.result;
                    } else {
                        result[key] = null;
                    }
                }
            } else {
                i++;
            }
        }

        return { result, consumed: i };
    }

    static _parseCSVRow(str) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (const char of str) {
            if (char === '"' && !inQuotes) {
                inQuotes = true;
            } else if (char === '"' && inQuotes) {
                inQuotes = false;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());

        return result;
    }

    static _parseValue(str) {
        if (str === undefined) return null;
        str = str.trim();
        if (str === 'null') return null;
        if (str === 'true') return true;
        if (str === 'false') return false;
        if (/^-?\d+$/.test(str)) return parseInt(str, 10);
        if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
        if ((str.startsWith('"') && str.endsWith('"')) ||
            (str.startsWith("'") && str.endsWith("'"))) {
            return str.slice(1, -1);
        }
        return str;
    }
}

/**
 * SEMTOK Converter - Semantic Token-Optimized Notation
 * Our new format designed for maximum token efficiency
 */
class SEMTOKConverter {
    /**
     * Convert JSON object to SEMTOK string
     */
    static toSEMTOK(obj, indent = 0) {
        const spaces = '  '.repeat(indent);
        let result = '';

        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return `${spaces}@empty\n`;
            }

            // Check if array of uniform objects (use @list)
            if (this._isUniformObjectArray(obj)) {
                const keys = Object.keys(obj[0]);
                result += `${spaces}@list: ${keys.join(' ')}\n`;
                for (const item of obj) {
                    const values = keys.map(k => this._formatValue(item[k]));
                    result += `${spaces}  ${values.join(' ')}\n`;
                }
            } else {
                // Non-uniform array
                result += `${spaces}@array\n`;
                for (const item of obj) {
                    if (typeof item === 'object' && item !== null) {
                        result += `${spaces}  @item\n`;
                        result += this.toSEMTOK(item, indent + 2);
                    } else {
                        result += `${spaces}  ${this._formatValue(item)}\n`;
                    }
                }
            }
        } else if (typeof obj === 'object' && obj !== null) {
            const entries = Object.entries(obj);

            // Check if all values are primitives (use @map inline)
            const allPrimitive = entries.every(([, v]) =>
                typeof v !== 'object' || v === null
            );

            if (allPrimitive && entries.length <= 4 && indent > 0) {
                // Inline map for small flat objects
                const pairs = entries.map(([k, v]) => `${k}=${this._formatValue(v)}`);
                result += `${spaces}${pairs.join(' ')}\n`;
            } else {
                for (const [key, value] of entries) {
                    if (typeof value === 'object' && value !== null) {
                        if (Array.isArray(value)) {
                            const arrayContent = this.toSEMTOK(value, indent + 1);
                            // Replace first line's @list/@array with key prefix
                            const lines = arrayContent.split('\n').filter(l => l);
                            if (lines[0].includes('@list:')) {
                                result += `${spaces}@list ${key}: ${lines[0].split(':')[1].trim()}\n`;
                                result += lines.slice(1).join('\n') + '\n';
                            } else {
                                result += `${spaces}@${key}\n${arrayContent}`;
                            }
                        } else if (Object.keys(value).length === 0) {
                            result += `${spaces}@map ${key}\n`;
                        } else {
                            result += `${spaces}@${key}\n`;
                            result += this.toSEMTOK(value, indent + 1);
                        }
                    } else {
                        result += `${spaces}${key}=${this._formatValue(value)}\n`;
                    }
                }
            }
        }

        return result;
    }

    static _isUniformObjectArray(arr) {
        if (!arr.length || typeof arr[0] !== 'object' || arr[0] === null) {
            return false;
        }
        const keys = Object.keys(arr[0]).sort().join(',');
        return arr.every(item =>
            typeof item === 'object' &&
            item !== null &&
            Object.keys(item).sort().join(',') === keys &&
            Object.values(item).every(v => typeof v !== 'object' || v === null)
        );
    }

    static _formatValue(value) {
        if (value === null) return '_';  // Minimal null representation
        if (value === undefined) return '_';
        if (typeof value === 'boolean') return value ? 'T' : 'F';
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'string') {
            // Quote strings with special characters
            if (/[\s=@\n]/.test(value) || value === '') {
                return `"${value.replace(/"/g, '\\"')}"`;
            }
            return value;
        }
        return String(value);
    }

    /**
     * Parse SEMTOK string to JSON object (placeholder - basic implementation)
     */
    static fromSEMTOK(semtok) {
        const lines = semtok.split('\n').filter(l => l.trim());
        return this._parseSEMTOKLines(lines, 0).result;
    }

    static _parseSEMTOKLines(lines, startIndent) {
        let result = {};
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const indent = line.search(/\S/);

            if (indent < startIndent) break;
            if (indent > startIndent) {
                i++;
                continue;
            }

            const content = line.trim();

            if (content === '@empty') {
                return { result: [], consumed: 1 };
            }

            if (content.startsWith('@list')) {
                // Parse tabular list
                const headerMatch = content.match(/@list\s*(\w+)?:\s*(.+)/);
                const key = headerMatch?.[1];
                const headers = (headerMatch?.[2] || '').split(/\s+/).filter(h => h);

                const arrayResult = [];
                i++;

                while (i < lines.length) {
                    const dataLine = lines[i];
                    const dataIndent = dataLine.search(/\S/);
                    if (dataIndent <= indent) break;

                    const values = dataLine.trim().split(/\s+/);
                    const obj = {};
                    headers.forEach((h, idx) => {
                        obj[h] = this._parseValue(values[idx]);
                    });
                    arrayResult.push(obj);
                    i++;
                }

                if (key) {
                    result[key] = arrayResult;
                } else {
                    return { result: arrayResult, consumed: i };
                }
            } else if (content.startsWith('@array')) {
                const arrayResult = [];
                i++;

                while (i < lines.length) {
                    const itemLine = lines[i];
                    const itemIndent = itemLine.search(/\S/);
                    if (itemIndent <= indent) break;

                    const itemContent = itemLine.trim();
                    if (itemContent === '@item') {
                        // Parse nested object
                        const subLines = [];
                        i++;
                        while (i < lines.length) {
                            const subLine = lines[i];
                            const subIndent = subLine.search(/\S/);
                            if (subIndent <= itemIndent) break;
                            subLines.push(subLine);
                            i++;
                        }
                        if (subLines.length > 0) {
                            const parsed = this._parseSEMTOKLines(subLines, itemIndent + 2);
                            arrayResult.push(parsed.result);
                        }
                    } else {
                        arrayResult.push(this._parseValue(itemContent));
                        i++;
                    }
                }

                return { result: arrayResult, consumed: i };
            } else if (content.startsWith('@')) {
                // Parse section
                const sectionName = content.substring(1).split(/\s/)[0];
                const subLines = [];
                i++;

                while (i < lines.length) {
                    const subLine = lines[i];
                    const subIndent = subLine.search(/\S/);
                    if (subIndent <= indent) break;
                    subLines.push(subLine);
                    i++;
                }

                if (subLines.length > 0) {
                    const parsed = this._parseSEMTOKLines(subLines, indent + 2);
                    result[sectionName] = parsed.result;
                } else {
                    result[sectionName] = {};
                }
            } else if (content.includes('=')) {
                // Parse key=value pairs
                const pairs = content.split(/\s+/);
                for (const pair of pairs) {
                    const [key, value] = pair.split('=');
                    if (key && value !== undefined) {
                        result[key] = this._parseValue(value);
                    }
                }
                i++;
            } else {
                i++;
            }
        }

        return { result, consumed: i };
    }

    static _parseValue(str) {
        if (str === undefined) return null;
        str = str.trim();
        if (str === '_') return null;
        if (str === 'T') return true;
        if (str === 'F') return false;
        if (/^-?\d+$/.test(str)) return parseInt(str, 10);
        if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
        if ((str.startsWith('"') && str.endsWith('"')) ||
            (str.startsWith("'") && str.endsWith("'"))) {
            return str.slice(1, -1);
        }
        return str;
    }
}

/**
 * Format Converter - Unified interface for all format conversions
 */
class FormatConverter {
    /**
     * Convert data to specified format
     */
    static convert(data, format) {
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(data);
            case 'json-pretty':
                return JSON.stringify(data, null, 2);
            case 'yaml':
                return YAMLConverter.toYAML(data);
            case 'toon':
                return TOONConverter.toTOON(data);
            case 'semtok':
                return SEMTOKConverter.toSEMTOK(data);
            default:
                throw new Error(`Unknown format: ${format}`);
        }
    }

    /**
     * Parse data from specified format
     */
    static parse(str, format) {
        switch (format.toLowerCase()) {
            case 'json':
            case 'json-pretty':
                return JSON.parse(str);
            case 'yaml':
                return YAMLConverter.fromYAML(str);
            case 'toon':
                return TOONConverter.fromTOON(str);
            case 'semtok':
                return SEMTOKConverter.fromSEMTOK(str);
            default:
                throw new Error(`Unknown format: ${format}`);
        }
    }

    /**
     * Validate round-trip fidelity
     */
    static validateRoundTrip(original, format) {
        try {
            const converted = this.convert(original, format);
            const parsed = this.parse(converted, format);
            const reconverted = this.convert(parsed, 'json');
            const originalJson = JSON.stringify(original);

            return {
                valid: reconverted === originalJson,
                original: originalJson,
                converted,
                parsed: JSON.stringify(parsed),
                reconverted
            };
        } catch (e) {
            return {
                valid: false,
                error: e.message
            };
        }
    }
}

// ============================================================================
// SECTION 3: BENCHMARK RUNNER
// ============================================================================

/**
 * Statistical utilities
 */
class Statistics {
    static mean(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    static std(arr) {
        if (arr.length < 2) return 0;
        const avg = this.mean(arr);
        const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
        return Math.sqrt(this.mean(squareDiffs));
    }

    static median(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    static min(arr) {
        return arr.length ? Math.min(...arr) : 0;
    }

    static max(arr) {
        return arr.length ? Math.max(...arr) : 0;
    }

    /**
     * Calculate 95% confidence interval
     */
    static confidenceInterval95(arr) {
        const n = arr.length;
        if (n < 2) return { lower: 0, upper: 0 };

        const avg = this.mean(arr);
        const stdError = this.std(arr) / Math.sqrt(n);
        const tValue = 1.96; // Approximation for 95% CI

        return {
            lower: avg - tValue * stdError,
            upper: avg + tValue * stdError
        };
    }

    /**
     * Calculate percentage savings relative to baseline
     */
    static percentageSavings(baseline, value) {
        if (baseline === 0) return 0;
        return ((baseline - value) / baseline) * 100;
    }
}

/**
 * Benchmark Runner - Executes format comparison benchmarks
 */
class BenchmarkRunner {
    constructor(options = {}) {
        this.tokenCounter = new TokenCounter(options);
        this.formats = options.formats || ['json', 'yaml', 'toon', 'semtok'];
        this.results = [];
    }

    /**
     * Load test cases from JSON file
     */
    loadTestCases(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }

    /**
     * Run benchmark on a single test case
     */
    benchmarkTestCase(testCase) {
        const result = {
            name: testCase.name || 'unnamed',
            type: testCase.type || 'unknown',
            formats: {},
            baseline: null
        };

        const data = testCase.data;

        // Convert and measure each format
        for (const format of this.formats) {
            try {
                const converted = FormatConverter.convert(data, format);
                const tokens = this.tokenCounter.count(converted);
                const chars = converted.length;
                const roundTrip = FormatConverter.validateRoundTrip(data, format);

                result.formats[format] = {
                    tokens,
                    characters: chars,
                    charsPerToken: chars / tokens,
                    roundTripValid: roundTrip.valid,
                    content: converted
                };

                // JSON is baseline
                if (format === 'json') {
                    result.baseline = tokens;
                }
            } catch (e) {
                result.formats[format] = {
                    error: e.message
                };
            }
        }

        // Calculate savings vs baseline
        if (result.baseline) {
            for (const format of this.formats) {
                if (result.formats[format] && !result.formats[format].error) {
                    result.formats[format].savingsPercent =
                        Statistics.percentageSavings(result.baseline, result.formats[format].tokens);
                }
            }
        }

        return result;
    }

    /**
     * Run benchmark on all test cases
     */
    runBenchmarks(testCases) {
        this.results = testCases.map(tc => this.benchmarkTestCase(tc));
        return this.results;
    }

    /**
     * Get aggregated statistics by data type
     */
    getStatsByType() {
        const byType = {};

        for (const result of this.results) {
            const type = result.type;
            if (!byType[type]) {
                byType[type] = {
                    count: 0,
                    formats: {}
                };
                for (const format of this.formats) {
                    byType[type].formats[format] = {
                        tokens: [],
                        savings: []
                    };
                }
            }

            byType[type].count++;

            for (const format of this.formats) {
                const formatData = result.formats[format];
                if (formatData && !formatData.error) {
                    byType[type].formats[format].tokens.push(formatData.tokens);
                    if (formatData.savingsPercent !== undefined) {
                        byType[type].formats[format].savings.push(formatData.savingsPercent);
                    }
                }
            }
        }

        // Calculate statistics for each type/format combination
        for (const type of Object.keys(byType)) {
            for (const format of this.formats) {
                const data = byType[type].formats[format];
                data.stats = {
                    meanTokens: Statistics.mean(data.tokens),
                    stdTokens: Statistics.std(data.tokens),
                    meanSavings: Statistics.mean(data.savings),
                    stdSavings: Statistics.std(data.savings),
                    ci95Savings: Statistics.confidenceInterval95(data.savings)
                };
            }
        }

        return byType;
    }

    /**
     * Get overall statistics
     */
    getOverallStats() {
        const overall = {
            totalCases: this.results.length,
            formats: {}
        };

        for (const format of this.formats) {
            const tokens = [];
            const savings = [];
            let roundTripFailures = 0;

            for (const result of this.results) {
                const formatData = result.formats[format];
                if (formatData && !formatData.error) {
                    tokens.push(formatData.tokens);
                    if (formatData.savingsPercent !== undefined) {
                        savings.push(formatData.savingsPercent);
                    }
                    if (!formatData.roundTripValid) {
                        roundTripFailures++;
                    }
                }
            }

            overall.formats[format] = {
                meanTokens: Statistics.mean(tokens),
                medianTokens: Statistics.median(tokens),
                stdTokens: Statistics.std(tokens),
                meanSavings: Statistics.mean(savings),
                medianSavings: Statistics.median(savings),
                stdSavings: Statistics.std(savings),
                minSavings: Statistics.min(savings),
                maxSavings: Statistics.max(savings),
                ci95Savings: Statistics.confidenceInterval95(savings),
                roundTripFailures
            };
        }

        return overall;
    }

    /**
     * Find best and worst cases for each format
     */
    getBestWorstCases() {
        const bestWorst = {};

        for (const format of this.formats) {
            if (format === 'json') continue; // Skip baseline

            let best = null;
            let worst = null;
            let bestSavings = -Infinity;
            let worstSavings = Infinity;

            for (const result of this.results) {
                const savings = result.formats[format]?.savingsPercent;
                if (savings !== undefined) {
                    if (savings > bestSavings) {
                        bestSavings = savings;
                        best = result;
                    }
                    if (savings < worstSavings) {
                        worstSavings = savings;
                        worst = result;
                    }
                }
            }

            bestWorst[format] = {
                best: best ? {
                    name: best.name,
                    type: best.type,
                    savings: bestSavings.toFixed(2) + '%'
                } : null,
                worst: worst ? {
                    name: worst.name,
                    type: worst.type,
                    savings: worstSavings.toFixed(2) + '%'
                } : null
            };
        }

        return bestWorst;
    }
}

// ============================================================================
// SECTION 4: REPORT GENERATOR
// ============================================================================

/**
 * Report Generator - Creates formatted benchmark reports
 */
class ReportGenerator {
    constructor(runner) {
        this.runner = runner;
    }

    /**
     * Generate ASCII table
     */
    static table(headers, rows, options = {}) {
        const colWidths = headers.map((h, i) => {
            const maxRow = Math.max(...rows.map(r => String(r[i] || '').length));
            return Math.max(h.length, maxRow);
        });

        const separator = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
        const formatRow = row => '| ' + row.map((cell, i) =>
            String(cell || '').padEnd(colWidths[i])
        ).join(' | ') + ' |';

        let output = separator + '\n';
        output += formatRow(headers) + '\n';
        output += separator + '\n';
        for (const row of rows) {
            output += formatRow(row) + '\n';
        }
        output += separator;

        return output;
    }

    /**
     * Generate full benchmark report
     */
    generateReport() {
        const overall = this.runner.getOverallStats();
        const byType = this.runner.getStatsByType();
        const bestWorst = this.runner.getBestWorstCases();

        let report = '';

        // Header
        report += '=' .repeat(80) + '\n';
        report += '  FORMAT COMPARISON BENCHMARK REPORT\n';
        report += '  Generated: ' + new Date().toISOString() + '\n';
        report += '='.repeat(80) + '\n\n';

        // Summary
        report += '## SUMMARY\n\n';
        report += `Total test cases: ${overall.totalCases}\n`;
        report += `Formats compared: ${this.runner.formats.join(', ')}\n\n`;

        // Overall comparison table
        report += '## OVERALL TOKEN COMPARISON\n\n';
        const overallHeaders = ['Format', 'Mean Tokens', 'Median', 'Std Dev', 'Mean Savings', '95% CI'];
        const overallRows = this.runner.formats.map(f => {
            const stats = overall.formats[f];
            return [
                f.toUpperCase(),
                stats.meanTokens.toFixed(1),
                stats.medianTokens.toFixed(1),
                stats.stdTokens.toFixed(2),
                f === 'json' ? 'baseline' : stats.meanSavings.toFixed(1) + '%',
                f === 'json' ? '-' :
                    `[${stats.ci95Savings.lower.toFixed(1)}%, ${stats.ci95Savings.upper.toFixed(1)}%]`
            ];
        });
        report += ReportGenerator.table(overallHeaders, overallRows) + '\n\n';

        // Savings range
        report += '## SAVINGS RANGE\n\n';
        const rangeHeaders = ['Format', 'Min Savings', 'Max Savings', 'Round-Trip Failures'];
        const rangeRows = this.runner.formats.filter(f => f !== 'json').map(f => {
            const stats = overall.formats[f];
            return [
                f.toUpperCase(),
                stats.minSavings.toFixed(1) + '%',
                stats.maxSavings.toFixed(1) + '%',
                stats.roundTripFailures.toString()
            ];
        });
        report += ReportGenerator.table(rangeHeaders, rangeRows) + '\n\n';

        // By data type
        report += '## SAVINGS BY DATA TYPE\n\n';
        for (const type of Object.keys(byType)) {
            report += `### ${type.toUpperCase()} (n=${byType[type].count})\n\n`;
            const typeHeaders = ['Format', 'Mean Tokens', 'Mean Savings', '95% CI'];
            const typeRows = this.runner.formats.map(f => {
                const stats = byType[type].formats[f].stats;
                return [
                    f.toUpperCase(),
                    stats.meanTokens.toFixed(1),
                    f === 'json' ? 'baseline' : stats.meanSavings.toFixed(1) + '%',
                    f === 'json' ? '-' :
                        `[${stats.ci95Savings.lower.toFixed(1)}%, ${stats.ci95Savings.upper.toFixed(1)}%]`
                ];
            });
            report += ReportGenerator.table(typeHeaders, typeRows) + '\n\n';
        }

        // Best/worst cases
        report += '## BEST AND WORST CASES\n\n';
        for (const format of Object.keys(bestWorst)) {
            const bw = bestWorst[format];
            report += `### ${format.toUpperCase()}\n`;
            if (bw.best) {
                report += `  Best:  ${bw.best.name} (${bw.best.type}) - ${bw.best.savings}\n`;
            }
            if (bw.worst) {
                report += `  Worst: ${bw.worst.name} (${bw.worst.type}) - ${bw.worst.savings}\n`;
            }
            report += '\n';
        }

        // Conclusions
        report += '## CONCLUSIONS\n\n';

        // Find format with best average savings
        let bestFormat = null;
        let bestAvgSavings = -Infinity;
        for (const f of this.runner.formats) {
            if (f === 'json') continue;
            const savings = overall.formats[f].meanSavings;
            if (savings > bestAvgSavings) {
                bestAvgSavings = savings;
                bestFormat = f;
            }
        }

        if (bestFormat) {
            report += `- Best performing format: ${bestFormat.toUpperCase()} (${bestAvgSavings.toFixed(1)}% avg savings)\n`;
        }

        // Check which types benefit most from each format
        for (const format of this.runner.formats.filter(f => f !== 'json')) {
            let bestType = null;
            let bestTypeSavings = -Infinity;

            for (const type of Object.keys(byType)) {
                const savings = byType[type].formats[format].stats.meanSavings;
                if (savings > bestTypeSavings) {
                    bestTypeSavings = savings;
                    bestType = type;
                }
            }

            if (bestType) {
                report += `- ${format.toUpperCase()} works best for: ${bestType} (${bestTypeSavings.toFixed(1)}% savings)\n`;
            }
        }

        report += '\n' + '='.repeat(80) + '\n';

        return report;
    }

    /**
     * Generate JSON report for programmatic use
     */
    generateJSONReport() {
        return {
            generated: new Date().toISOString(),
            overall: this.runner.getOverallStats(),
            byType: this.runner.getStatsByType(),
            bestWorst: this.runner.getBestWorstCases(),
            results: this.runner.results
        };
    }
}

// ============================================================================
// SECTION 5: SAMPLE TEST CASES
// ============================================================================

/**
 * Generate sample test cases for demonstration
 */
function generateSampleTestCases() {
    return [
        // Flat data
        {
            name: 'simple_flat',
            type: 'flat',
            data: {
                id: 1,
                name: 'Alice',
                email: 'alice@example.com',
                active: true
            }
        },
        {
            name: 'config_flat',
            type: 'flat',
            data: {
                theme: 'dark',
                language: 'en',
                notifications: true,
                autoSave: false,
                fontSize: 14
            }
        },

        // Tabular data
        {
            name: 'users_table',
            type: 'tabular',
            data: {
                users: [
                    { id: 1, name: 'Alice', role: 'admin', score: 95 },
                    { id: 2, name: 'Bob', role: 'user', score: 82 },
                    { id: 3, name: 'Carol', role: 'user', score: 78 },
                    { id: 4, name: 'David', role: 'moderator', score: 88 }
                ]
            }
        },
        {
            name: 'products_table',
            type: 'tabular',
            data: {
                products: [
                    { sku: 'A001', name: 'Widget', price: 9.99, stock: 100 },
                    { sku: 'A002', name: 'Gadget', price: 19.99, stock: 50 },
                    { sku: 'B001', name: 'Doodad', price: 4.99, stock: 200 }
                ]
            }
        },

        // Nested data
        {
            name: 'nested_org',
            type: 'nested',
            data: {
                company: {
                    name: 'TechCorp',
                    departments: {
                        engineering: {
                            head: 'Alice',
                            budget: 1000000,
                            teams: ['frontend', 'backend', 'devops']
                        },
                        sales: {
                            head: 'Bob',
                            budget: 500000,
                            regions: ['north', 'south', 'east', 'west']
                        }
                    }
                }
            }
        },
        {
            name: 'nested_config',
            type: 'nested',
            data: {
                database: {
                    primary: {
                        host: 'db1.example.com',
                        port: 5432,
                        ssl: true
                    },
                    replica: {
                        host: 'db2.example.com',
                        port: 5432,
                        ssl: true
                    }
                },
                cache: {
                    redis: {
                        host: 'cache.example.com',
                        port: 6379
                    }
                }
            }
        },

        // Mixed data
        {
            name: 'api_response',
            type: 'mixed',
            data: {
                status: 'success',
                code: 200,
                data: {
                    users: [
                        { id: 1, name: 'Alice', email: 'alice@test.com' },
                        { id: 2, name: 'Bob', email: 'bob@test.com' }
                    ],
                    pagination: {
                        page: 1,
                        perPage: 20,
                        total: 42
                    }
                },
                meta: {
                    requestId: 'abc123',
                    timestamp: '2024-01-15T10:30:00Z'
                }
            }
        },
        {
            name: 'dashboard_data',
            type: 'mixed',
            data: {
                summary: {
                    totalUsers: 1542,
                    activeToday: 234,
                    revenue: 45678.90
                },
                topProducts: [
                    { name: 'Pro Plan', sales: 89, revenue: 8900 },
                    { name: 'Basic Plan', sales: 156, revenue: 4680 },
                    { name: 'Enterprise', sales: 12, revenue: 36000 }
                ],
                alerts: [
                    { level: 'warning', message: 'High CPU usage' },
                    { level: 'info', message: 'Backup completed' }
                ]
            }
        },

        // Edge cases
        {
            name: 'special_chars',
            type: 'edge',
            data: {
                message: 'Hello, "World"!',
                path: '/path/to/file',
                regex: '^[a-z]+$',
                url: 'https://example.com?foo=bar&baz=qux'
            }
        },
        {
            name: 'nulls_and_empty',
            type: 'edge',
            data: {
                nullValue: null,
                emptyString: '',
                emptyArray: [],
                emptyObject: {},
                zero: 0,
                falseValue: false
            }
        },

        // Large tabular (stress test)
        {
            name: 'large_table',
            type: 'tabular',
            data: {
                records: Array.from({ length: 20 }, (_, i) => ({
                    id: i + 1,
                    timestamp: `2024-01-${String(i + 1).padStart(2, '0')}`,
                    value: Math.round(Math.random() * 1000),
                    status: ['active', 'pending', 'done'][i % 3]
                }))
            }
        }
    ];
}

// ============================================================================
// SECTION 6: CLI INTERFACE
// ============================================================================

/**
 * Main CLI entry point
 */
async function main() {
    const args = process.argv.slice(2);

    console.log('');
    console.log('='.repeat(60));
    console.log('  BENCHMARK ENGINE - Format Comparison Testing Framework');
    console.log('='.repeat(60));
    console.log('');

    // Parse arguments
    const options = {
        testFile: null,
        outputFile: null,
        jsonOutput: false,
        generateSamples: false,
        verbose: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-f':
            case '--file':
                options.testFile = args[++i];
                break;
            case '-o':
            case '--output':
                options.outputFile = args[++i];
                break;
            case '--json':
                options.jsonOutput = true;
                break;
            case '--generate-samples':
                options.generateSamples = true;
                break;
            case '-v':
            case '--verbose':
                options.verbose = true;
                break;
            case '-h':
            case '--help':
                printHelp();
                return;
        }
    }

    // Generate sample test cases if requested
    if (options.generateSamples) {
        const samples = generateSampleTestCases();
        const samplePath = path.join(path.dirname(process.argv[1] || '.'), 'test-cases.json');
        fs.writeFileSync(samplePath, JSON.stringify(samples, null, 2));
        console.log(`Generated sample test cases: ${samplePath}`);
        console.log(`Run benchmark with: node benchmark-engine.js -f test-cases.json`);
        return;
    }

    // Load or generate test cases
    let testCases;
    if (options.testFile) {
        console.log(`Loading test cases from: ${options.testFile}`);
        testCases = JSON.parse(fs.readFileSync(options.testFile, 'utf-8'));
    } else {
        console.log('Using built-in sample test cases');
        console.log('(Use --generate-samples to create a test file, or -f to load one)');
        console.log('');
        testCases = generateSampleTestCases();
    }

    console.log(`Loaded ${testCases.length} test cases`);
    console.log('');

    // Initialize and run benchmark
    const runner = new BenchmarkRunner({ useApproximate: true });

    console.log('Running benchmarks...');
    runner.runBenchmarks(testCases);
    console.log('Done!\n');

    // Generate report
    const reportGen = new ReportGenerator(runner);

    if (options.jsonOutput) {
        const jsonReport = reportGen.generateJSONReport();
        if (options.outputFile) {
            fs.writeFileSync(options.outputFile, JSON.stringify(jsonReport, null, 2));
            console.log(`JSON report saved to: ${options.outputFile}`);
        } else {
            console.log(JSON.stringify(jsonReport, null, 2));
        }
    } else {
        const textReport = reportGen.generateReport();
        if (options.outputFile) {
            fs.writeFileSync(options.outputFile, textReport);
            console.log(`Report saved to: ${options.outputFile}`);
        } else {
            console.log(textReport);
        }
    }

    // Verbose output
    if (options.verbose) {
        console.log('\n## DETAILED RESULTS\n');
        for (const result of runner.results) {
            console.log(`--- ${result.name} (${result.type}) ---`);
            for (const format of runner.formats) {
                const f = result.formats[format];
                if (f.error) {
                    console.log(`  ${format}: ERROR - ${f.error}`);
                } else {
                    const savings = f.savingsPercent !== undefined
                        ? ` (${f.savingsPercent.toFixed(1)}% savings)`
                        : '';
                    console.log(`  ${format}: ${f.tokens} tokens, ${f.characters} chars${savings}`);
                }
            }
            console.log('');
        }
    }
}

function printHelp() {
    console.log(`
BENCHMARK ENGINE - Format Comparison Testing Framework

Usage: node benchmark-engine.js [options]

Options:
  -f, --file <path>      Load test cases from JSON file
  -o, --output <path>    Save report to file
  --json                 Output report as JSON
  --generate-samples     Generate sample test cases file
  -v, --verbose          Show detailed results
  -h, --help             Show this help message

Examples:
  node benchmark-engine.js                     # Run with sample data
  node benchmark-engine.js --generate-samples  # Create test-cases.json
  node benchmark-engine.js -f test-cases.json  # Run with custom tests
  node benchmark-engine.js -o report.txt       # Save report to file
  node benchmark-engine.js --json -o data.json # Save JSON report

Test Case Format:
  [
    {
      "name": "test_name",
      "type": "flat|tabular|nested|mixed|edge",
      "data": { ... your JSON data ... }
    }
  ]
`);
}

// ============================================================================
// EXPORTS AND EXECUTION
// ============================================================================

// Export for module use
module.exports = {
    TokenCounter,
    YAMLConverter,
    TOONConverter,
    SEMTOKConverter,
    FormatConverter,
    Statistics,
    BenchmarkRunner,
    ReportGenerator,
    generateSampleTestCases
};

// Run CLI if executed directly
if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}
