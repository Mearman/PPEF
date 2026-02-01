# PPEF Cross-Language Specification

**Version:** 2.0.0-draft
**Status:** Draft
**Date:** 2026-02-01

## 1. Introduction

PPEF (Portable Programmatic Evaluation Framework) is a deterministic, claim-driven framework for evaluating systems under test (SUTs) against structured test cases. This specification defines the behaviour that any conforming implementation must exhibit, regardless of programming language.

The specification comprises three layers:

1. **JSON Schema** (`ppef.schema.json`) -- machine-readable type definitions
2. **Conformance Vectors** (`spec/conformance/*.json`) -- pinned input/output pairs
3. **This document** -- prose semantics that schemas and vectors cannot express

Keywords: The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" are to be interpreted as described in RFC 2119.

## 2. Execution Semantics

### 2.1 Execution Loop

An experiment consists of a set of SUTs, a set of Cases, and a repetition count N. Execution proceeds as a triple loop:

```
for each SUT in suts:
    for each Case in cases:
        for repetition in 0..N-1:
            seed = seedBase + repetition
            runId = generateRunId({sutId, caseId, seed, configHash?, repetition})
            result = SUT.run(Case.getInputs())
            collect(result)
```

The iteration order MUST be SUT-major, Case-middle, Repetition-minor. Implementations MAY parallelise execution within this loop provided the set of (SUT, Case, Repetition) triples is identical.

### 2.2 Seed Derivation

For repetition index `i` (0-based), the seed is:

```
seed = seedBase + i
```

where `seedBase` is from the executor configuration (default: 42).

### 2.3 Run ID Generation

Each run is identified by a deterministic 16-character hex string derived from:

1. Construct a `RunIdInputs` object with fields: `sutId`, `caseId`, and optionally `seed`, `configHash`, `repetition`
2. Canonicalize using RFC 8785 (JSON Canonicalization Scheme)
3. Compute SHA-256 of the UTF-8 encoded canonical string
4. Hex-encode the hash and truncate to 16 characters

**Canonicalization rules (RFC 8785 / JCS):**

- Object keys MUST be sorted lexicographically by UTF-16 code units
- Sorting MUST be applied recursively to nested objects
- Properties with value `undefined` MUST be omitted entirely
- Numbers MUST use the ECMAScript `Number.toString()` representation (no trailing zeros, exponential notation when shorter)
- Negative zero (`-0`) MUST be serialized as `0`
- Non-finite numbers (`Infinity`, `-Infinity`, `NaN`) MUST be serialized as `null`
- No whitespace between tokens
- Strings MUST use standard JSON escaping (RFC 8259)

**Example:**

```
Input:  { sutId: "sut-a", caseId: "case-1", seed: 42 }
Canonical: {"caseId":"case-1","seed":42,"sutId":"sut-a"}
SHA-256:   0728aed005d1fc42... (first 16 hex chars)
RunId:     (see conformance vectors for exact values)
```

See `spec/conformance/run-id-vectors.json` for pinned test vectors.

### 2.4 Configuration Hash

Configuration objects are hashed identically to run IDs, except the output is truncated to 8 hex characters instead of 16.

## 3. Module Contracts

### 3.1 SUT (System Under Test)

A SUT is a callable that, given optional configuration, returns an object with:

- `id: string` -- unique identifier
- `config: object` -- resolved configuration
- `run(inputs) -> result` -- execute the SUT on given inputs, returning an arbitrary result object

In TypeScript: `SUT<TInputs, TResult>`
In Python: any callable returning an object with `id`, `config`, and `run` attributes

### 3.2 Case Definition

A Case is a callable returning an object with:

- `case: EvaluationCase` -- case metadata (caseId, name, caseClass, inputs)
- `getInput() -> resource` -- load the primary resource once (graph, dataset, etc.)
- `getInputs() -> inputs` -- return algorithm-specific inputs

The two-phase design separates expensive resource loading (`getInput`) from lightweight input assembly (`getInputs`).

### 3.3 Metrics Extractor

A metrics extractor is a function:

```
(result: unknown) -> Record<string, number>
```

It receives the raw SUT result and returns a flat dictionary of named numeric metrics.

### 3.4 Binary SUT (Cross-Language Integration)

Binary SUTs are the recommended path for cross-language integration. They communicate via stdin/stdout:

**Invocation:**
1. Spawn the configured `binaryCommand` with `binaryArgs`
2. Write input to stdin in the configured format
3. Wait for process exit (up to `binaryTimeout` ms, default 30000)
4. Read stdout and parse in the configured format
5. Exit code 0 = success; non-zero = failure

**Input formats (`binaryInputFormat`):**

| Format | Encoding |
|--------|----------|
| `json` | `JSON.stringify(inputs)` followed by newline |
| `raw` | `String(inputs)` followed by newline |
| `lines` | One value per line (for array inputs) |

**Output formats (`binaryOutputFormat`):**

| Format | Decoding |
|--------|----------|
| `json` | `JSON.parse(stdout.trim())` |
| `raw` | `stdout.trim()` as string |
| `lines` | `stdout.trim().split('\n')` |

**Error handling:**
- Non-zero exit code: capture stderr as error message
- Timeout: send SIGKILL, report as `timeout` failure type
- Empty stdout with exit 0: report as `no_output` failure type

## 4. Output Schemas

All output types are defined as `$defs` in `ppef.schema.json` and can be referenced as:

```
ppef.schema.json#/$defs/EvaluationResult
ppef.schema.json#/$defs/ResultBatch
ppef.schema.json#/$defs/AggregationOutput
ppef.schema.json#/$defs/ClaimEvaluationSummary
ppef.schema.json#/$defs/MetricsEvaluationSummary
ppef.schema.json#/$defs/RobustnessAnalysisOutput
ppef.schema.json#/$defs/ExploratoryEvaluationSummary
```

### 4.1 EvaluationResult

The canonical per-run output. Fields:

- `run: RunContext` -- run identity (runId, sut, sutRole, caseId, seed, repetition)
- `correctness: CorrectnessResult` -- validity assessment
- `outputs: ResultOutputs` -- artefacts and summaries
- `metrics: ResultMetrics` -- numeric metrics (`numeric: Record<string, number>`)
- `provenance: Provenance` -- reproducibility metadata

### 4.2 Provenance

The `runtime` field requires only `platform` and `arch`. Additional fields are language-specific:

```json
{
  "runtime": {
    "platform": "darwin",
    "arch": "arm64",
    "nodeVersion": "22.0.0"
  }
}
```

```json
{
  "runtime": {
    "platform": "linux",
    "arch": "x64",
    "pythonVersion": "3.12.0",
    "interpreter": "cpython"
  }
}
```

Implementations MUST populate `platform` and `arch`. All other fields are optional.

### 4.3 ResultBatch

Envelope for multiple results:

```json
{
  "version": "2.0.0",
  "timestamp": "2026-02-01T12:00:00.000Z",
  "results": [ ... ]
}
```

## 5. Statistical Algorithms

### 5.1 Normal CDF (Abramowitz & Stegun)

```
function normalCDF(z):
    sign = z < 0 ? -1 : 1
    z = |z| / sqrt(2)
    a1 = 0.254829592
    a2 = -0.284496736
    a3 = 1.421413741
    a4 = -1.453152027
    a5 = 1.061405429
    p  = 0.3275911
    t  = 1 / (1 + p * z)
    y  = 1 - ((((a5*t + a4)*t + a3)*t + a2)*t + a1) * t * exp(-z*z)
    return 0.5 * (1 + sign * y)
```

See `spec/conformance/statistical-vectors.json` for pinned values.

### 5.2 Mann-Whitney U Test

```
function mannWhitneyUTest(sampleA, sampleB):
    combined = concat(sampleA, sampleB)
    sorted = sort(combined)

    // Assign ranks (1-based), averaging tied values
    for each unique value v in sorted:
        positions = indices where sorted[i] == v (1-based)
        avgRank[v] = mean(positions)

    rankSumA = sum(avgRank[v] for v in sampleA)
    rankSumB = sum(avgRank[v] for v in sampleB)

    n1 = len(sampleA)
    n2 = len(sampleB)
    u1 = rankSumA - n1*(n1+1)/2
    u2 = rankSumB - n2*(n2+1)/2
    u  = min(u1, u2)

    meanU = n1*n2 / 2
    stdU  = sqrt(n1*n2*(n1+n2+1) / 12)
    z     = stdU > 0 ? (u - meanU) / stdU : 0

    pValue = 2 * (1 - normalCDF(|z|))
    significant = pValue < 0.05

    return { u, pValue, significant }
```

### 5.3 Cohen's d

```
function cohensD(sampleA, sampleB):
    n1 = len(sampleA)
    n2 = len(sampleB)
    mean1 = mean(sampleA)
    mean2 = mean(sampleB)
    var1 = sampleVariance(sampleA)   // denominator: n1-1
    var2 = sampleVariance(sampleB)   // denominator: n2-1
    pooledStd = sqrt(((n1-1)*var1 + (n2-1)*var2) / (n1+n2-2))
    return pooledStd > 0 ? |mean1 - mean2| / pooledStd : 0
```

### 5.4 Confidence Interval

```
function confidenceInterval(values):
    n    = len(values)
    mean = mean(values)
    std  = sampleStdDev(values)       // denominator: n-1
    se   = std / sqrt(n)
    t    = 1.96                       // large-sample z approximation (95% CI)
    margin = t * se
    return { lower: mean - margin, upper: mean + margin }
```

### 5.5 Summary Statistics

```
function computeSummaryStats(values):
    if len(values) == 0:
        return { n: 0, mean: NaN, median: NaN, min: NaN, max: NaN }

    sorted = sort(values)
    n      = len(values)
    sum    = sum(values)
    mean   = sum / n
    min    = sorted[0]
    max    = sorted[n-1]

    mid = floor(n / 2)
    median = n % 2 == 0 ? (sorted[mid-1] + sorted[mid]) / 2 : sorted[mid]

    if n > 1:
        variance = sum((v - mean)^2 for v in values) / (n - 1)
        std = sqrt(variance)

    // 95% CI uses t-value lookup table for small samples
    // Falls back to 1.96 for large samples (df > 100)

    p25 = sorted[floor(n * 0.25)]
    p75 = sorted[floor(n * 0.75)]

    return { n, mean, median, min, max, std, confidence95, sum, p25, p75 }
```

## 6. Aggregation Pipeline

```
Raw Results (EvaluationResult[])
    -> Group by (sut, caseClass?)
    -> For each group:
        -> Extract metric values from results
        -> computeSummaryStats(values) per metric
        -> Compute correctness rates (validRate, producedOutputRate)
    -> For each (primary, baseline) pair:
        -> computeComparison(primaryResults, baselineResults, metric)
    -> Produce AggregatedResult[]
    -> Wrap in AggregationOutput { version, timestamp, aggregates, metadata }
```

## 7. Evaluator Pipeline

Four built-in evaluators, each with validate/evaluate/summarize phases:

### 7.1 Claims Evaluator

Tests explicit hypotheses: "SUT A has greater metric M than baseline B with p < alpha".

Input: `AggregatedResult[]` + `ClaimsEvaluatorConfig`
Output: `ClaimEvaluationSummary`

### 7.2 Metrics Evaluator

Evaluates metrics against thresholds, baselines, or target ranges.

Input: `AggregatedResult[]` + `MetricsEvaluatorConfig`
Output: `MetricsEvaluationSummary`

### 7.3 Robustness Evaluator

Measures sensitivity under perturbations at varying intensity levels.

Input: `EvaluationResult[]` + `RobustnessEvaluatorConfig`
Output: `RobustnessAnalysisOutput`

### 7.4 Exploratory Evaluator

Hypothesis-free analysis: rankings, pairwise comparisons, correlations.

Input: `AggregatedResult[]` + `ExploratoryEvaluatorConfig`
Output: `ExploratoryEvaluationSummary`

## 8. File Formats

All PPEF files are JSON. Implementations SHOULD support both compact and pretty-printed JSON.

| File | Schema Reference | Description |
|------|-----------------|-------------|
| `experiment.json` | `ppef.schema.json` (root) | Experiment configuration |
| `results.json` | `ppef.schema.json#/$defs/ResultBatch` | Raw execution results |
| `aggregates.json` | `ppef.schema.json#/$defs/AggregationOutput` | Aggregated statistics |
| `claims.json` | `ppef.schema.json#/$defs/ClaimsEvaluatorConfig` | Claims evaluator config |
| `eval-claims.json` | `ppef.schema.json#/$defs/ClaimEvaluationSummary` | Claims evaluation output |
| `eval-metrics.json` | `ppef.schema.json#/$defs/MetricsEvaluationSummary` | Metrics evaluation output |
| `eval-robustness.json` | `ppef.schema.json#/$defs/RobustnessAnalysisOutput` | Robustness analysis output |
| `eval-exploratory.json` | `ppef.schema.json#/$defs/ExploratoryEvaluationSummary` | Exploratory evaluation output |

## 9. Conformance

An implementation is conforming if:

1. It validates experiment configs against `ppef.schema.json`
2. It produces `EvaluationResult` objects that validate against `ppef.schema.json#/$defs/EvaluationResult`
3. Its `generateRunId` function produces identical output for all vectors in `spec/conformance/run-id-vectors.json`
4. Its statistical functions produce output within the specified tolerance for all vectors in `spec/conformance/statistical-vectors.json`
5. Its `computeSummaryStats` produces output within the specified tolerance for all vectors in `spec/conformance/aggregation-vectors.json`

Implementations MAY support a subset of evaluator types. Implementations MUST document which evaluators they support.

## 10. Versioning

The schema version follows Semantic Versioning:

- **Major:** Breaking changes to output schemas or canonicalization
- **Minor:** New optional fields, new evaluator types
- **Patch:** Documentation, conformance vector additions

The `version` field in `ResultBatch`, `AggregationOutput`, and evaluator summaries MUST match the schema version the implementation targets.
