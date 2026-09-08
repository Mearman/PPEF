# Metrics-Only Evaluation Example

This example demonstrates how to use PPEF's evaluation system **without using claims**. Instead of defining hypotheses about expected outcomes, you can evaluate metrics directly against:

1. **Threshold criteria** - Check if metrics meet absolute thresholds
2. **Baseline criteria** - Compare one SUT against another baseline
3. **Target-range criteria** - Verify metrics fall within acceptable ranges

## Usage

This config is designed for the string-length two-SUT experiment. Run the experiment first, then evaluate:

```bash
# Run the two-SUT string-length experiment
ppef run examples/string-length/experiment-two-suts.json

# Evaluate using metrics criteria
ppef evaluate results/aggregates.json \
  --type metrics \
  --config examples/metrics-only/eval-config.json \
  --format latex \
  --verbose
```

## Configuration

The `eval-config.json` file defines three evaluation criteria against the `length` metric:

- **length-threshold**: All SUTs must produce a measured length greater than zero
- **length-baseline**: `builtin-length` must return a length at least as large as `spread-length`
- **length-target-range**: All SUTs must produce a length in the range 1 to 100

## Output

The evaluation produces:

- Pass/fail status for each criterion
- Observed vs expected values
- Summary statistics including pass rate by SUT
- LaTeX table for inclusion in papers

## When to Use Metrics-Only Evaluation

Use this approach when you want to:

1. Verify basic quality thresholds (performance, memory)
2. Compare against baseline without formal hypothesis testing
3. Check if metrics fall within acceptable ranges
4. Generate pass/fail reports for continuous integration

## Compared to Claims

| Metrics-Only        | Claims                           |
| ------------------- | -------------------------------- |
| Absolute thresholds | Hypothesis-driven                |
| Direct comparisons  | Statistical significance testing |
| Pass/fail outcomes  | Satisfied/violated/inconclusive  |
| Quality gates       | Scientific evidence              |
