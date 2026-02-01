# SEMTOK

**Cut your AI costs by 60%. Fit 2.5x more data in every prompt.**

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## The Problem

Every token costs money. JSON wastes half of them on `{}"":,` noise.

```
JSON:    {"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}
SEMTOK:  #id|name
         1|Alice
         2|Bob
```

**32 tokens → 13 tokens. 59% saved.**

---

## Who Benefits

| Stakeholder | Impact |
|-------------|--------|
| **Developers** | Larger context windows, richer AI interactions |
| **Companies** | 60% reduction in API costs at scale |
| **AI Agents** | Faster communication, more efficient swarms |

---

## Results

| Data Type | Token Savings |
|-----------|---------------|
| Tabular | **64%** |
| Nested | **46%** |
| APIs | **45%** |
| Overall | **59.5%** |

Verified across 41 benchmarks. No cherry-picking.

---

## Usage

```javascript
const { SEMTOKFinal } = require('./semtok-final-v7.js');
const semtok = new SEMTOKFinal();

const compact = semtok.encode(yourData);
const stats = semtok.compare(yourData);
// → { savings: "59.5%" }
```

---

## Format

| JSON | SEMTOK |
|------|--------|
| `null` | `~` |
| `true` | `+` |
| `false` | `-` |
| `"string"` | `string` |
| `{"a":1}` | `a:1` |
| `[1,2,3]` | `1,2,3` |

Full spec: [SEMTOK_SPECIFICATION.md](./SEMTOK_SPECIFICATION.md)

---

## Research

Built with scientific rigor:
- 9 parallel AI research agents
- 7 iterations of refinement
- 41 comprehensive benchmarks

Full paper: [SCIENTIFIC_PAPER.md](./SCIENTIFIC_PAPER.md)

---

## Author

**David Celekli** — Principal Investigator

---

## License

MIT — Use it anywhere, for anything.
