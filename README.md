# PPEF - Portable Programmatic Evaluation Framework

A claim-driven, deterministic evaluation framework for experiments. PPEF provides a structured approach to testing and validating software components through reusable test cases, statistical aggregation, and claim-based evaluation.

Published npm package with dual ESM/CJS output. Single runtime dependency: `commander`.

## Features

- **Type-safe**: Strict TypeScript with generic SUT, Case, and Evaluator abstractions
- **Registry**: Centralized registries for Systems Under Test (SUTs) and evaluation cases with role/tag filtering
- **Execution**: Deterministic execution with worker threads, checkpointing, memory monitoring, and binary SUT support
- **Statistical**: Mann-Whitney U test, Cohen's d, confidence intervals
- **Aggregation**: Summary stats, pairwise comparisons, and rankings across runs
- **Evaluation**: Four built-in evaluators — claims, robustness, metrics, and exploratory
- **Rendering**: LaTeX table generation for thesis integration
- **CLI**: Five commands for running, validating, planning, aggregating, and evaluating experiments

## Installation

```bash
# Install as a dependency
pnpm add ppef

# Or use locally for development
git clone https://github.com/Mearman/ppef.git
cd ppef
pnpm install
pnpm build
```

## Development

```bash
pnpm install              # Install dependencies
pnpm build                # TypeScript compile + CJS wrapper generation
pnpm typecheck            # Type-check only (tsc --noEmit)
pnpm lint                 # ESLint + Prettier with auto-fix
pnpm test                 # Run all tests with coverage (c8 + tsx + Node native test runner)
```

Run a single test file:
```bash
npx tsx --test src/path/to/file.test.ts
```

CLI (after build):
```bash
ppef experiment.json   # Run experiment (default command)
ppef run config.json   # Explicit run command
ppef validate          # Validate configuration
ppef plan              # Dry-run execution plan
ppef aggregate         # Post-process results
ppef evaluate          # Run evaluators on results
```

## Quick Start

Create a minimal experiment with three files and a config:

**experiment.json**
```json
{
  "experiment": {
    "name": "string-length",
    "description": "Compare string length implementations"
  },
  "executor": {
    "repetitions": 3
  },
  "suts": [
    {
      "id": "builtin-length",
      "module": "./sut.mjs",
      "exportName": "createSut",
      "registration": {
        "name": "Built-in .length",
        "version": "1.0.0",
        "role": "primary"
      }
    }
  ],
  "cases": [
    {
      "id": "hello-world",
      "module": "./case.mjs",
      "exportName": "createCase"
    }
  ],
  "metricsExtractor": {
    "module": "./metrics.mjs",
    "exportName": "extract"
  },
  "output": {
    "path": "./results"
  }
}
```

**sut.mjs** — System Under Test factory
```js
export function createSut() {
  return {
    id: "builtin-length",
    config: {},
    run: async (input) => ({ length: input.text.length }),
  };
}
```

**case.mjs** — Test case definition
```js
export function createCase() {
  return {
    case: {
      caseId: "hello-world",
      caseClass: "basic",
      name: "Hello World",
      version: "1.0.0",
      inputs: { text: "hello world" },
    },
    getInput: async () => ({ text: "hello world" }),
    getInputs: () => ({ text: "hello world" }),
  };
}
```

**metrics.mjs** — Metrics extractor
```js
export function extract(result) {
  return { length: result.length ?? 0 };
}
```

Run it:
```bash
npx ppef experiment.json
```

## Workflows

The typical pipeline chains CLI commands: validate, run, aggregate, then evaluate.

```
ppef validate config.json
    → ppef run config.json
        → ppef aggregate results.json
            → ppef evaluate aggregates.json -t claims -c claims.json
```

### 1. Validate Configuration

Check an experiment config for errors before running:

```bash
ppef validate experiment.json
```

### 2. Preview Execution Plan

See what would run without executing (SUTs x cases x repetitions):

```bash
ppef plan experiment.json
```

### 3. Run an Experiment

Execute all SUTs against all cases with worker thread isolation:

```bash
ppef run experiment.json
ppef run experiment.json -o ./output -j 4 --verbose
ppef run experiment.json --unsafe-in-process  # No worker isolation (debugging only)
```

The output directory contains a results JSON and (by default) an aggregates JSON.

### 4. Aggregate Results

Compute summary statistics, pairwise comparisons, and rankings from raw results:

```bash
ppef aggregate results.json
ppef aggregate results.json -o aggregates.json --compute-comparisons
```

### 5. Evaluate Results

Run evaluators against aggregated (or raw) results. Each evaluator type takes a JSON config file.

#### Claims — Test Explicit Hypotheses

Test whether SUT A outperforms baseline B on a given metric with statistical significance:

```bash
ppef evaluate aggregates.json -t claims -c claims.json -v
```

**claims.json**:
```json
{
  "claims": [
    {
      "claimId": "C001",
      "description": "Primary has greater accuracy than baseline",
      "sut": "primary-sut",
      "baseline": "baseline-sut",
      "metric": "accuracy",
      "direction": "greater",
      "scope": "global"
    }
  ],
  "significanceLevel": 0.05
}
```

#### Metrics — Threshold, Baseline, and Range Criteria

Evaluate metrics against fixed thresholds, baselines, or target ranges:

```bash
ppef evaluate aggregates.json -t metrics -c metrics-config.json
```

**metrics-config.json**:
```json
{
  "criteria": [
    {
      "criterionId": "exec-time",
      "description": "Execution time under 1000ms",
      "type": "threshold",
      "metric": "executionTime",
      "sut": "*",
      "threshold": { "operator": "lt", "value": 1000 }
    },
    {
      "criterionId": "f1-range",
      "description": "F1 score in [0.8, 1.0]",
      "type": "target-range",
      "metric": "f1Score",
      "sut": "*",
      "targetRange": { "min": 0.8, "max": 1.0, "minInclusive": true, "maxInclusive": true }
    }
  ]
}
```

#### Robustness — Sensitivity Under Perturbations

Measure how performance degrades under perturbations at varying intensity levels:

```bash
ppef evaluate results.json -t robustness -c robustness-config.json
```

**robustness-config.json**:
```json
{
  "metrics": ["executionTime", "accuracy"],
  "perturbations": ["edge-removal", "noise", "seed-shift"],
  "intensityLevels": [0.1, 0.2, 0.3, 0.4, 0.5],
  "runsPerLevel": 10
}
```

#### Output Formats

All evaluators support JSON and LaTeX output:

```bash
ppef evaluate aggregates.json -t claims -c claims.json -f latex
ppef evaluate aggregates.json -t metrics -c metrics.json -f json -o results.json
```

### Inline Evaluators

Evaluator configs can be embedded directly in the experiment config via the optional `evaluators` field, making the config self-contained:

```json
{
  "experiment": { "name": "my-experiment" },
  "executor": { "repetitions": 10 },
  "suts": [ ... ],
  "cases": [ ... ],
  "metricsExtractor": { ... },
  "output": { "path": "./results" },
  "evaluators": [
    {
      "type": "claims",
      "config": {
        "claims": [ ... ]
      }
    }
  ]
}
```

### JSON Schema Validation

Experiment configs can reference the generated schema for IDE autocompletion:

```json
{
  "$schema": "./ppef.schema.json",
  "experiment": { ... }
}
```

Standalone evaluator configs reference schema `$defs`:

```json
{
  "$schema": "./ppef.schema.json#/$defs/ClaimsEvaluatorConfig",
  "claims": [ ... ]
}
```

## Cross-Language Specification

PPEF is designed for cross-language interoperability. A Python runner can produce results consumable by the TypeScript aggregator, and vice versa.

The specification lives in [`spec/`](spec/) and comprises three layers:

| Layer | Location | Purpose |
|-------|----------|---------|
| JSON Schema | [`ppef.schema.json`](ppef.schema.json) | Machine-readable type definitions for all input and output types |
| Conformance Vectors | [`spec/conformance/`](spec/conformance/) | Pinned input/output pairs that any implementation must reproduce |
| Prose Specification | [`spec/README.md`](spec/README.md) | Execution semantics, module contracts, statistical algorithms |

All output types are available as `$defs` in the schema, enabling validation from any language:

```
ppef.schema.json#/$defs/EvaluationResult
ppef.schema.json#/$defs/ResultBatch
ppef.schema.json#/$defs/AggregationOutput
ppef.schema.json#/$defs/ClaimEvaluationSummary
ppef.schema.json#/$defs/MetricsEvaluationSummary
ppef.schema.json#/$defs/RobustnessAnalysisOutput
ppef.schema.json#/$defs/ExploratoryEvaluationSummary
```

Run ID generation uses [RFC 8785 (JSON Canonicalization Scheme)](https://www.rfc-editor.org/rfc/rfc8785) for deterministic cross-language hashing. Libraries exist for Python (`jcs`), Rust (`serde_jcs`), Go (`go-jcs`), and others.

## Architecture

### Data Flow Pipeline

```
SUTs + Cases (Registries)
    → Executor (runs SUTs against cases, deterministic runIds)
    → EvaluationResult (canonical schema)
    → ResultCollector (validates + filters)
    → Aggregation Pipeline (summary stats, comparisons, rankings)
    → Evaluators (claims, robustness, metrics, exploratory)
    → Renderers (LaTeX tables for thesis)
```

### Module Map (`src/`)

| Module | Purpose |
|--------|---------|
| `types/` | All canonical type definitions (result, sut, case, claims, evaluator, aggregate, perturbation) |
| `registry/` | `SUTRegistry` and `CaseRegistry` — generic registries with role/tag filtering |
| `executor/` | Orchestrator with worker threads, checkpointing, memory monitoring, binary SUT support |
| `collector/` | Result aggregation and JSON schema validation |
| `statistical/` | Mann-Whitney U test, Cohen's d, confidence intervals |
| `aggregation/` | `computeSummaryStats()`, `computeComparison()`, `computeRankings()`, pipeline |
| `evaluators/` | Four built-in evaluators + extensible registry (see below) |
| `claims/` | Claim type definitions |
| `robustness/` | Perturbation configs and robustness metric types |
| `renderers/` | LaTeX table renderer |
| `cli/` | Five commands with config loading, module loading, output writing |

### Key Abstractions

**SUT** (`SUT<TInputs, TResult>`): Generic System Under Test. Has `id`, `config`, and `run(inputs)`. Roles: `primary`, `baseline`, `oracle`.

**CaseDefinition** (`CaseDefinition<TInput, TInputs>`): Two-phase resource factory — `getInput()` loads a resource once, `getInputs()` returns algorithm-specific inputs.

**Evaluator** (`Evaluator<TConfig, TInput, TOutput>`): Extensible evaluation with `validateConfig()`, `evaluate()`, `summarize()`. Four built-in types:
- **ClaimsEvaluator** — tests explicit hypotheses with statistical significance
- **RobustnessEvaluator** — sensitivity analysis under perturbations
- **MetricsEvaluator** — multi-criterion threshold/baseline/target-range evaluation
- **ExploratoryEvaluator** — hypothesis-free analysis (rankings, pairwise comparisons, correlations, case-class effects)

**EvaluationResult**: Canonical output schema capturing run identity (deterministic SHA-256 `runId`), correctness, metrics, output artefacts, and provenance.

### Subpath Exports

Each module is independently importable:

```typescript
import { SUTRegistry } from 'ppef/registry';
import { EvaluationResult } from 'ppef/types';
import { computeSummaryStats } from 'ppef/aggregation';
```

Available subpaths: `ppef/types`, `ppef/registry`, `ppef/executor`, `ppef/collector`, `ppef/statistical`, `ppef/aggregation`, `ppef/evaluators`, `ppef/claims`, `ppef/robustness`, `ppef/renderers`.

## Conventions

- TypeScript strict mode, ES2023 target, ES modules
- Node.js native test runner (`node:test` + `node:assert`) — not Vitest/Jest
- Coverage via c8 (text + html + json-summary in `./coverage/`)
- Conventional commits enforced via commitlint + husky
- Semantic release from main branch
- No `any` types — use `unknown` with type guards
- Executor produces deterministic `runId` via SHA-256 hash of RFC 8785 (JCS) canonicalized inputs

## License

MIT
