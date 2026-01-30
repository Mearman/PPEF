# Custom Evaluator Guide

> **Documentation guide.** Custom evaluators require programmatic registration before they can be used via the CLI. This directory contains no runnable files — the code snippets below show how to implement and register your own evaluator.

This guide demonstrates how to create and register a custom evaluator for PPEF. The `EnergyEfficiencyEvaluator` example evaluates algorithms based on energy consumption metrics.

## Usage

### 1. Register the Custom Evaluator

```typescript
// In your code, before running ppef evaluate
import { registerEnergyEfficiencyEvaluator } from "./energy-efficiency-evaluator.js";

registerEnergyEfficiencyEvaluator();
```

### 2. Create Configuration

Create `energy-config.json`:

```json
{
  "name": "Energy Efficiency Evaluation",
  "maxEnergyConsumption": 1000,
  "maxEnergyPerOperation": 0.001,
  "minOperationsPerJoule": 1000
}
```

### 3. Run Evaluation

```bash
# After registering the evaluator
ppef evaluate results/aggregates.json \
  --type energy-efficiency \
  --config energy-config.json \
  --format json-pretty
```

## How Custom Evaluators Work

Custom evaluators in PPEF follow the **plugin architecture**:

1. **Implement the Evaluator interface** - Define `type`, `validateConfig()`, `evaluate()`, and `summarize()`
2. **Register with EvaluatorRegistry** - Call `EvaluatorRegistry.register()` to make it available
3. **Use via CLI** - Reference by type name in `ppef evaluate --type <your-type>`

## Key Components

### 1. Type Identification

```typescript
readonly type = "custom" as const;
static readonly CUSTOM_TYPE = "energy-efficiency";
```

### 2. Configuration Validation

```typescript
validateConfig(config: YourConfig): ValidationResult {
  // Validate configuration before evaluation
  return { valid: true, errors: [], warnings: [] };
}
```

### 3. Evaluation Logic

```typescript
evaluate(config: YourConfig, input: YourInput): EvaluationOutput<YourData> {
  // Perform evaluation
  return {
    type: "your-type",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    data: yourResults,
    metadata: { ... }
  };
}
```

### 4. Summary Statistics

```typescript
summarize(output: EvaluationOutput<YourData>): EvaluationSummary {
  return {
    total: output.data.results.length,
    passed: ...,
    failed: ...,
    passRate: ...
  };
}
```

## Registering Custom Evaluators

There are several ways to register custom evaluators:

### Option 1: Manual Registration (Code)

```typescript
import { EvaluatorRegistry } from "ppef";
import { MyCustomEvaluator } from "./my-custom-evaluator.js";

EvaluatorRegistry.register(new MyCustomEvaluator());
```

### Option 2: Module Auto-Registration (as shown in example)

```typescript
// In your custom evaluator file
if (import.meta.url === `file://${process.argv[1]}`) {
  registerMyCustomEvaluator();
}
```

### Option 3: Plugin File (recommended for production)

Create `ppef-plugins.ts`:

```typescript
import { EvaluatorRegistry } from "ppef";
import { EnergyEfficiencyEvaluator } from "./evaluators/energy-efficiency.js";
import { CostEvaluator } from "./evaluators/cost.js";

EvaluatorRegistry.register(new EnergyEfficiencyEvaluator());
EvaluatorRegistry.register(new CostEvaluator());

console.log("PPEF plugins loaded!");
```

Then load before running PPEF:

```bash
node -e "import('./ppef-plugins.js').then(() => import('ppef/cli'))"
```

## Use Cases for Custom Evaluators

- **Domain-specific metrics** (e.g., energy, cost, latency percentiles)
- **Business logic evaluation** (e.g., ROI, customer satisfaction)
- **Compliance checking** (e.g., regulatory requirements)
- **Custom aggregation logic** (e.g., weighted scores, composite metrics)
- **Integration with external systems** (e.g., A/B testing platforms)

## Extending PPEF

The evaluator abstraction enables PPEF to be extended for:

- New evaluation types without modifying core code
- Organization-specific evaluation criteria
- Integration with existing evaluation pipelines
- Custom output formats and reporting

This makes PPEF a **framework** for evaluation rather than just a tool for specific evaluation types.
