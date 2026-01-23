# PPEF - Portable Programmatic Evaluation Framework

A claim-driven, deterministic evaluation framework for experiments. PPEF provides a structured approach to testing and validating software components through reusable test cases, statistical aggregation, and claim-based evaluation.

## Features

- **Core**: Type-safe foundation with zero external dependencies
- **Store**: Centralized registry for Systems Under Test (SUTs)
- **Case**: Reusable test case infrastructure with setup/teardown
- **Execute**: Deterministic test execution with snapshot capture
- **Aggregate**: Statistical aggregation across test runs (mean, median, mode, min, max, stdDev)
- **Evaluate**: Claim-driven validation with custom predicates
- **Render**: Report generation in multiple formats (console, Markdown, JSON)
- **Monitor**: Built-in memory and CPU monitoring for resource tracking

## Installation

```bash
# Install as a dependency
pnpm add ppef

# Or use locally for development
git clone <repository-url>
cd ppef
pnpm install
pnpm build
```

## Quick Start

```typescript
import { Store, Case, Execute, Aggregate, Evaluate, Render } from 'ppef';

// 1. Register your System Under Test (SUT)
Store.register('sort-algo', {
  name: 'QuickSort',
  execute: (input: number[]) => input.sort((a, b) => a - b)
});

// 2. Define test cases
const ascendingCase = new Case({
  name: 'ascending-order',
  setup: () => [1, 2, 3, 4, 5],
  teardown: (result) => console.log('Result:', result)
});

const descendingCase = new Case({
  name: 'descending-order',
  setup: () => [5, 4, 3, 2, 1],
  teardown: (result) => console.log('Result:', result)
});

// 3. Execute tests
const results = Execute.run('sort-algo', [ascendingCase, descendingCase]);

// 4. Aggregate metrics across multiple runs
const aggregated = Aggregate.mean(results);

// 5. Evaluate claims
const claims = Evaluate.claims(aggregated, {
  'always-sorted': (result) => {
    const arr = result.output;
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] > arr[i + 1]) return false;
    }
    return true;
  }
});

// 6. Render reports
Render.console(claims);
Render.markdown(claims, './results.md');
Render.json(claims, './results.json');
```

## Modules

### Core
Type-safe foundation providing primitive types and interfaces. Zero external dependencies - pure TypeScript utilities for the entire framework.

### Store
Centralized registry for managing Systems Under Test (SUTs). Register implementations with unique identifiers and retrieve them for execution.

```typescript
Store.register('my-sut', {
  name: 'My Implementation',
  version: '1.0.0',
  execute: (input) => { /* implementation */ }
});

const sut = Store.get('my-sut');
```

### Case
Reusable test case infrastructure with lifecycle management. Each case includes setup, execution, and teardown phases with automatic resource cleanup.

```typescript
const testCase = new Case({
  name: 'test-case-1',
  setup: () => ({ data: [1, 2, 3] }),
  teardown: (result) => console.log('Cleanup:', result)
});
```

### Execute
Deterministic test execution engine. Runs SUTs against test cases and captures snapshots of inputs, outputs, and execution metadata.

```typescript
const results = Execute.run('my-sut', [testCase]);
const snapshot = Execute.capture('my-sut', testCase);
```

### Aggregate
Statistical aggregation utilities for analyzing test results across multiple runs. Compute mean, median, mode, min, max, and standard deviation.

```typescript
const stats = Aggregate.mean(results);
const median = Aggregate.median(results);
const deviation = Aggregate.stdDev(results);
```

### Evaluate
Claim-driven validation framework. Define custom predicates to validate test results against expected properties and behaviors.

```typescript
const claims = Evaluate.claims(results, {
  'performance': (r) => r.duration < 100,
  'correctness': (r) => r.output === expected,
  'memory-safe': (r) => r.memoryUsage < 1024 * 1024
});
```

### Render
Multi-format report generation. Output results to console, Markdown files, or JSON for documentation and CI/CD integration.

```typescript
Render.console(results);
Render.markdown(results, './report.md');
Render.json(results, './report.json');
```

### Monitor
Built-in resource tracking for performance profiling. Monitor memory usage and CPU consumption during test execution.

```typescript
const monitor = new Monitor();
monitor.start();
// ... run tests ...
const metrics = monitor.stop();
console.log('Memory used:', metrics.memoryUsage);
```

## API Reference

Detailed type definitions and API documentation are available in the source files:

- `src/core/` - Core types and interfaces
- `src/store.ts` - SUT registry API
- `src/case.ts` - Test case API
- `src/execute.ts` - Execution engine API
- `src/aggregate.ts` - Statistical functions
- `src/evaluate.ts` - Claim evaluation API
- `src/render.ts` - Report generation API
- `src/monitor.ts` - Resource monitoring API

## License

MIT

---

**PPEF** - Making experiments reproducible, evaluable, and documentable.
