# Metrics-Only Evaluation Example

This example demonstrates how to use PPEF's evaluation system **without using claims**. Instead of defining hypotheses about expected outcomes, you can evaluate metrics directly against:

1. **Threshold criteria** - Check if metrics meet absolute thresholds
2. **Baseline criteria** - Compare one SUT against another baseline
3. **Target-range criteria** - Verify metrics fall within acceptable ranges

## Usage

```bash
# Run your experiment (if not already done)
ppef run experiment-config.json

# Aggregate results
ppef aggregate results/*.json -o results/aggregates.json

# Evaluate using metrics criteria
ppef evaluate results/aggregates.json \
  --type metrics \
  --config examples/metrics-only/eval-config.json \
  --format latex \
  --verbose
```

## Configuration

The `eval-config.json` file defines the evaluation criteria:

- **exec-time-threshold**: All SUTs must have execution time under 1000ms
- **memory-threshold**: All SUTs must use less than 100MB memory
- **accuracy-baseline**: `new-algorithm` must match or beat `baseline-algorithm` accuracy
- **f1-target-range**: All SUTs must have F1 scores between 0.8 and 1.0

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

| Metrics-Only | Claims |
|-------------|--------|
| Absolute thresholds | Hypothesis-driven |
| Direct comparisons | Statistical significance testing |
| Pass/fail outcomes | Satisfied/violated/inconclusive |
| Quality gates | Scientific evidence |
