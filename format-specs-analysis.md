# Comparative Analysis of Data Format Specifications

## Executive Summary

This document provides a comprehensive analysis of existing data format specifications with a focus on design decisions that can inform the development of new LLM-optimized formats. The formats analyzed include TOON (Token-Oriented Object Notation), YAML 1.2, TOML, JSON5, and related technologies including BAML and constrained decoding approaches.

---

## 1. TOON (Token-Oriented Object Notation)

### Overview
TOON is a compact, human-readable encoding of the JSON data model specifically designed for LLM prompts. It claims 30-60% token reduction compared to JSON while maintaining lossless serialization.

**Specification Repository**: [github.com/toon-format/spec](https://github.com/toon-format/spec)
**Current Version**: 2.0 (working draft), 1.3 (stable)

### Core Syntax Rules

1. **Object Representation**
   - Key-value pairs separated by colons (`:`)
   - Each pair on its own line
   - Nested objects use indentation (default 2 spaces)

2. **Tabular Arrays** (Key Innovation)
   - Uniform arrays of objects collapse into header + row format
   - Syntax: `array_key[count]{field1,field2}:` followed by rows
   - Similar to CSV but with explicit structure
   - Example:
     ```
     users[3]{id,name,email}:
     1|Alice|alice@example.com
     2|Bob|bob@example.com
     3|Carol|carol@example.com
     ```

3. **Delimiter Options**
   - Comma (`,`), tab (`\t`), or pipe (`|`)
   - Configurable per document/context

### Escaping Mechanisms

| Character | Escape Sequence |
|-----------|-----------------|
| Pipe (`\|`) | `\|` |
| Backslash (`\`) | `\\` |
| Newline | `\\n` |
| Quote (`"`) | `\"` |
| Tab | `\t` |
| Carriage Return | `\r` |

**Quoting Rules**: Strings must be quoted if they contain:
- Colons (`:`)
- Quotes (`"`)
- Backslashes (`\`)
- Brackets/braces
- Control characters
- The active delimiter
- Equal to `-` or start with `-`
- Boolean/null keywords (`true`, `false`, `null`)
- Numeric-looking values intended as strings

### Type Representation

- **All values stored as strings** - parsers infer types contextually
- **Booleans**: Must be lowercase `true` or `false`
- **Null**: Must be lowercase `null`
- **Numbers**: Canonical decimal form (no exponent notation, no trailing zeros)
  - Leading zeros (e.g., `05`) treated as strings, not numbers
  - Decoders accept both decimal and exponent forms on input

### Error Handling

- Strict mode rejects invalid escape sequences
- Custom error types (e.g., `ConversionError`, `ValueError`)
- Try/catch patterns with detailed error messages
- Option for lenient parsing of slightly malformed data

### Design Decisions Worth Learning From

1. **Schema-awareness**: Explicit declaration of array lengths and field names helps LLMs parse reliably
2. **Tabular optimization**: CSV-like compactness for uniform data structures
3. **Minimal quoting**: Reduces visual noise and token count
4. **Single encoding**: Always UTF-8, no ambiguity
5. **Delimiter flexibility**: Adapts to content characteristics

### Limitations

- Not ideal for highly nested or non-uniform structures
- Pure tabular data is still more compact in raw CSV
- Adds 5-10% overhead vs CSV for structure declarations

---

## 2. YAML 1.2

### Overview
YAML (YAML Ain't Markup Language) is a human-friendly data serialization standard that uses indentation for structure.

**Specification**: [yaml.org/spec/1.2.2](https://yaml.org/spec/1.2.2/)

### Core Syntax Rules

1. **Structure via Indentation**
   - Whitespace-sensitive (spaces only, no tabs)
   - Each indentation level defines nesting

2. **Multiple String Styles**
   - Unquoted (plain scalars)
   - Single-quoted (literal, only `'` needs escaping via `''`)
   - Double-quoted (supports escape sequences)
   - Block scalars (`|` for literal, `>` for folded)

3. **Collections**
   - Sequences: `- item` syntax
   - Mappings: `key: value` syntax
   - Flow style: `[a, b]` and `{key: value}`

### Escaping Mechanisms (Double-Quoted Strings)

| Escape | Character |
|--------|-----------|
| `\"` | Double quote |
| `\\` | Backslash |
| `\/` | Forward slash |
| `\b` | Backspace |
| `\f` | Form feed |
| `\n` | Newline |
| `\r` | Carriage return |
| `\t` | Tab |
| `\xNN` | 8-bit Unicode |
| `\uNNNN` | 16-bit Unicode |
| `\UNNNNNNNN` | 32-bit Unicode |

**Note**: In YAML 1.1, escaping forward slash (`\/`) is forbidden.

### Type Representation (The Norway Problem)

**YAML 1.1** (still common in many parsers):
- Boolean values: `y`, `Y`, `yes`, `Yes`, `YES`, `n`, `N`, `no`, `No`, `NO`, `true`, `True`, `TRUE`, `false`, `False`, `FALSE`, `on`, `On`, `ON`, `off`, `Off`, `OFF`
- This causes the infamous "Norway Problem" where country code `NO` becomes `false`

**YAML 1.2** (current spec):
- Only `true`, `True`, `TRUE`, `false`, `False`, `FALSE` recognized as booleans
- Many parsers still default to 1.1 behavior

### Edge Cases and Gotchas

1. **Implicit Typing Surprises**
   ```yaml
   # These become booleans in YAML 1.1:
   norway: NO      # false
   switch: on      # true
   answer: yes     # true
   ```

2. **Version Number Ambiguity**
   ```yaml
   versions:
     - 9.5.25   # string
     - 10.23    # number!
   ```

3. **Hexadecimal in Arrays**
   ```yaml
   hexChars: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, A, B, C, D, E, F]
   # Results in 10 integers and 6 strings
   ```

4. **GitHub Actions `on` Keyword**
   - `on:` is a reserved trigger keyword
   - In some contexts parsed as boolean `true`

### Security Concerns

1. **Anchors and Aliases**
   - Can create denial-of-service via recursive references
   - Memory exhaustion attacks
   - Cascading insecure configurations in CI/CD

2. **Arbitrary Object Instantiation**
   - Language-specific tags can execute code
   - Use `safe_load()` functions when available

### Error Handling

- Errors from invalid whitespace
- Ambiguous type coercion failures
- Reference cycle detection in some parsers

### Design Decisions to Learn From

1. **Block scalars** for multiline strings are elegant
2. **Comments** are well-supported with `#`
3. **Anchors/aliases** for DRY (but dangerous)

### Design Decisions to Avoid

1. **Implicit typing** causes too many surprises
2. **Whitespace sensitivity** leads to invisible bugs
3. **Multiple ways to do the same thing** increases complexity
4. **Security attack surface** from advanced features

---

## 3. TOML

### Overview
TOML (Tom's Obvious Minimal Language) is a configuration file format designed to be easy to read due to obvious semantics.

**Specification**: [toml.io/en/v1.0.0](https://toml.io/en/v1.0.0)

### Core Design Philosophy

> "TOML aims to be a minimal configuration file format that's easy to read due to obvious semantics. TOML is designed to map unambiguously to a hash table."

### Core Syntax Rules

1. **Explicit Key-Value Pairs**
   ```toml
   key = "value"
   number = 42
   ```

2. **Tables (Sections)**
   ```toml
   [section]
   key = "value"

   [section.subsection]
   nested = true
   ```

3. **Arrays of Tables**
   ```toml
   [[products]]
   name = "Widget"

   [[products]]
   name = "Gadget"
   ```

4. **Inline Tables**
   ```toml
   point = { x = 1, y = 2 }
   ```

### String Types

1. **Basic Strings** (double-quoted): Support escape sequences
2. **Literal Strings** (single-quoted): No escaping, raw content
3. **Multi-line Basic Strings** (triple double-quotes)
4. **Multi-line Literal Strings** (triple single-quotes)

### Escaping Mechanisms (Basic Strings Only)

| Escape | Character |
|--------|-----------|
| `\b` | Backspace |
| `\t` | Tab |
| `\n` | Newline |
| `\f` | Form feed |
| `\r` | Carriage return |
| `\"` | Quote |
| `\\` | Backslash |
| `\uXXXX` | Unicode (4 hex) |
| `\UXXXXXXXX` | Unicode (8 hex) |

### Type Representation

TOML supports explicit types:

| Type | Example |
|------|---------|
| String | `"hello"` or `'hello'` |
| Integer | `42`, `+42`, `-17` |
| Float | `3.14`, `-0.01`, `5e+22` |
| Boolean | `true`, `false` (lowercase only) |
| Datetime | `1979-05-27T07:32:00Z` |
| Array | `[1, 2, 3]` |
| Table | `{ key = "value" }` |

**Key Feature**: Underscores allowed in numbers for readability:
```toml
large_number = 1_000_000
```

### Error Handling

- Case-sensitive parsing
- UTF-8 required
- Clear syntax errors for malformed input
- No implicit type coercion
- ABNF grammar for formal specification

### Design Decisions to Learn From

1. **Explicit typing** eliminates YAML-style surprises
2. **Literal strings** (no escaping) for regex, paths
3. **Clear datetime support** with RFC 3339
4. **Underscore separators** in numbers for readability
5. **No implicit behavior** - what you write is what you get
6. **Formal ABNF grammar** ensures unambiguous parsing

### Limitations

1. **Arrays of Tables** syntax can be confusing
2. **Verbose for deeply nested data**
3. **Smaller ecosystem** than JSON/YAML
4. **No top-level arrays** (always starts with hash table)

---

## 4. JSON5

### Overview
JSON5 is a superset of JSON that adds features from ECMAScript 5.1 to make it more human-friendly while maintaining compatibility.

**Specification**: [spec.json5.org](https://spec.json5.org/)

### Extensions Over JSON

1. **Comments**
   ```json5
   {
     // Single-line comment
     /* Multi-line
        comment */
     key: "value"
   }
   ```

2. **Trailing Commas**
   ```json5
   {
     a: 1,
     b: 2,  // trailing comma allowed
   }
   ```

3. **Unquoted Keys**
   ```json5
   {
     unquotedKey: "value",
     default: "even reserved words work"
   }
   ```

4. **Single-Quoted Strings**
   ```json5
   { message: 'single quotes work' }
   ```

5. **Multi-line Strings**
   ```json5
   {
     text: "line one \
   line two"
   }
   ```

6. **Extended Numbers**
   ```json5
   {
     hex: 0xFF,
     leadingDecimal: .5,
     trailingDecimal: 5.,
     positiveSign: +1,
     infinity: Infinity,
     negInfinity: -Infinity,
     notANumber: NaN
   }
   ```

### Escaping Mechanisms

Same as JSON, with additional character escapes from ES5:
- All JSON escape sequences
- Additional ES5 escapes in strings

### Type Representation

Same as JSON:
- String
- Number (extended with hex, Infinity, NaN)
- Boolean (`true`, `false`)
- Null (`null`)
- Object
- Array

### Error Handling

- Stricter than ES5 (subset compliance)
- Clear parsing errors
- Well-defined grammar

### Design Decisions to Learn From

1. **Backward compatibility** with JSON
2. **Comments** greatly improve maintainability
3. **Trailing commas** reduce diff noise
4. **Unquoted keys** reduce visual clutter
5. **Wide adoption** (65M+ npm downloads/week)

### Design Decisions to Consider

1. **ES5 alignment** limits innovation
2. **Still requires significant quoting** for strings
3. **No multiline strings** without escaping

---

## 5. StrictYAML

### Overview
StrictYAML is a type-safe YAML parser that removes dangerous and confusing YAML features.

**Repository**: [github.com/crdoconnor/strictyaml](https://github.com/crdoconnor/strictyaml)

### Removed Features

1. **Implicit typing** - All values are strings unless schema says otherwise
2. **Binary data**
3. **Explicit tags**
4. **Anchors and aliases**
5. **Flow style**
6. **Node references**

### Design Philosophy

> "StrictYAML sidesteps this problem by ignoring key parts of the spec, in an attempt to create a 'zero surprises' parser."

### Key Innovations

1. **Schema-driven typing**: Types defined in code, not in data
2. **Clear error messages**: With code snippets and line numbers
3. **Comment preservation**: Round-trip editing maintains comments
4. **Drop-in replacement**: Compatible API with PyYAML

### Design Decisions to Learn From

1. **Explicit is better than implicit**
2. **Security by removing features**
3. **Separate type information from data**
4. **Predictable, boring parsing**

---

## 6. LLM-Focused Formats and Technologies

### BAML (Boundary AI Markup Language)

**Repository**: [github.com/BoundaryML/baml](https://github.com/BoundaryML/baml)

A domain-specific language for LLM functions with:

1. **Typed Prompts**: Functions in `.baml` files with explicit types
2. **Schema-Aligned Parsing**: Rust-based parser that repairs LLM output
3. **Multi-language Support**: Python, TypeScript, Ruby, Go
4. **Runtime Validation**: Enforces contracts at runtime

**Key Innovation**: Schema-Aligned Parsing (SAP)
- LLM generates natural responses
- Parser applies error correction to conform to schema
- Achieves ~10ms parsing time via Rust implementation

### Constrained Decoding (Outlines, SGLang)

Technologies that ensure structured LLM output:

1. **Token Masking**: Invalid tokens zeroed out during generation
2. **Grammar-Guided Generation**: FSM-based constraint checking
3. **JSON Schema Compilation**: Schemas compiled to efficient state machines

**Key Frameworks**:
- Outlines
- SGLang
- Guidance
- XGrammar
- llama.cpp grammar module

### GGUF Format

While primarily a model format (not data interchange), GGUF shows:
- Importance of extensibility
- Backward compatibility
- Efficient binary encoding
- Metadata alongside content

---

## 7. Comparative Analysis Matrix

| Feature | JSON | JSON5 | YAML | TOML | TOON | StrictYAML |
|---------|------|-------|------|------|------|------------|
| Comments | No | Yes | Yes | Yes | No* | Yes |
| Trailing Commas | No | Yes | N/A | No | N/A | N/A |
| Unquoted Keys | No | Yes | Yes | Yes | Yes | Yes |
| Unquoted Strings | No | No | Yes | No** | Yes | Yes |
| Multiline Strings | No | Via escape | Yes | Yes | No | Yes |
| Implicit Typing | No | No | Yes | No | Partial | No |
| Datetime Type | No | No | Yes | Yes | No | No |
| Explicit Structure | No | No | No | Yes | Yes | No |
| Token Efficient | No | No | Medium | No | Yes | Medium |
| LLM Optimized | No | No | No | No | Yes | No |

*TOON focuses on data transmission, not human editing
**TOML has literal strings with single quotes

---

## 8. Key Lessons for New Format Design

### What Works Well

1. **Explicit Typing** (TOML, JSON)
   - Eliminates ambiguity
   - Predictable parsing
   - Better error messages

2. **Minimal Quoting** (TOON, YAML)
   - Reduces visual noise
   - Fewer tokens for LLMs
   - Must have clear rules for when required

3. **Schema Awareness** (TOON, BAML)
   - Helps LLMs understand structure
   - Enables validation
   - Supports tabular optimization

4. **Literal String Option** (TOML)
   - No escaping needed
   - Perfect for regex, paths, code
   - Clear delimiter

5. **Comments** (YAML, TOML, JSON5)
   - Essential for human-edited files
   - Can be stripped for LLM transmission

6. **Single Encoding** (All modern formats)
   - UTF-8 everywhere
   - No charset confusion

### What to Avoid

1. **Implicit Type Coercion** (YAML 1.1)
   - Norway problem
   - Version number confusion
   - Boolean keyword proliferation

2. **Whitespace Significance** (YAML)
   - Invisible bugs
   - Copy-paste issues
   - Tab/space confusion

3. **Complex Features** (YAML anchors/aliases)
   - Security vulnerabilities
   - DoS attack vectors
   - Rarely needed

4. **Multiple Ways to Do Same Thing** (YAML)
   - Increases learning curve
   - Parser complexity
   - Inconsistent codebases

5. **Implicit Behavior**
   - "Magic" is the enemy of predictability
   - Explicit is always better

### LLM-Specific Considerations

1. **Token Efficiency**
   - Every character counts
   - Structure declarations can aid accuracy
   - Tabular format for uniform data

2. **Parseability**
   - Clear delimiters
   - Unambiguous syntax
   - Error recovery possible

3. **Schema Integration**
   - Inline structure hints
   - Length declarations
   - Type indicators

4. **Generation Constraints**
   - Compatible with FSM-based decoding
   - Regular grammar preferred
   - Avoid context-sensitive features

---

## 9. Recommendations for New Format Development

### Core Principles

1. **Explicit over implicit** - No surprises
2. **Simple over clever** - Easy to parse and generate
3. **Compact over verbose** - Token efficiency matters
4. **Structured over flexible** - Schema-awareness helps
5. **Secure by default** - No dangerous features

### Suggested Features

1. **Tabular arrays** (from TOON) for uniform data
2. **Literal strings** (from TOML) for raw content
3. **Explicit typing** with minimal syntax
4. **Configurable delimiters** for content adaptation
5. **Length/field declarations** for structure clarity
6. **UTF-8 only** encoding

### Features to Omit

1. Implicit type coercion
2. Anchors/aliases/references
3. Multiple string styles
4. Whitespace-based structure
5. Complex escape sequences beyond basics
6. Comments in LLM-transmitted data (strip in serialization)

---

## 10. References

### Official Specifications
- [TOON Specification](https://github.com/toon-format/spec)
- [YAML 1.2.2](https://yaml.org/spec/1.2.2/)
- [TOML v1.0.0](https://toml.io/en/v1.0.0)
- [JSON5](https://spec.json5.org/)
- [JSON (RFC 8259)](https://www.rfc-editor.org/rfc/rfc8259)

### Related Tools and Frameworks
- [BAML](https://github.com/BoundaryML/baml)
- [Outlines](https://github.com/outlines-dev/outlines)
- [StrictYAML](https://github.com/crdoconnor/strictyaml)
- [jsonschema (Python)](https://python-jsonschema.readthedocs.io/)

### Further Reading
- [The YAML Document from Hell](https://ruudvanasseldonk.com/2023/01/11/the-yaml-document-from-hell)
- [The Norway Problem](https://hitchdev.com/strictyaml/why/implicit-typing-removed/)
- [Constrained Decoding Guide](https://www.aidancooper.co.uk/constrained-decoding/)
- [YAML Anchors Attack Surface](https://xygeni.io/blog/yaml-anchors-and-aliases-the-overlooked-attack-surface-in-cicd/)

---

*Document generated: 2026-01-31*
*Purpose: Format specification research for LLM-optimized data format development*
