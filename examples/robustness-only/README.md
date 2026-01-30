# Robustness-Only Evaluation Example

> **Reference only.** Robustness evaluation requires raw results that include perturbation metadata (perturbation type, intensity level). The config in this directory demonstrates the schema but cannot be run against the string-length example output, which does not include perturbation runs. Metric and perturbation names in `eval-config.json` are illustrative placeholders.

This example demonstrates how to use PPEF's robustness evaluation to analyze how algorithms behave under perturbations (noise, structural changes, etc.).

## Usage

```bash
# Run your experiment with perturbations (if not already done)
ppef run experiment-config.json

# The experiment should include perturbed runs
# See your experiment config for perturbation configuration

# Aggregate results
ppef aggregate results/*.json -o results/aggregates.json

# Evaluate robustness
ppef evaluate results/aggregates.json \
  --type robustness \
  --config examples/robustness-only/eval-config.json \
  --format latex \
  --verbose
```

## Configuration

The `eval-config.json` file specifies:

- **metrics**: Which metrics to analyze (executionTime, accuracy, f1Score)
- **perturbations**: Which perturbations were applied (edge-removal, noise, seed-shift)
- **intensityLevels**: Perturbation intensity levels tested (0.1 to 0.5)
- **runsPerLevel**: How many runs per perturbation level (10)

## Output

The robustness evaluation produces:
- **Variance under perturbation** - How much the metric changes
- **Standard deviation** - Spread of values under perturbation
- **Coefficient of variation** - Relative variance (normalized by mean)
- **Baseline value** - Metric value without perturbation
- **Run count** - Number of perturbed runs analyzed

## Understanding Robustness Metrics

| Metric | Interpretation |
|--------|---------------|
| Low variance | Algorithm is stable under perturbation |
| High variance | Algorithm is sensitive to input changes |
| Low CV | Robust (variance is small relative to mean) |
| High CV | Brittle (variance is large relative to mean) |

## When to Use Robustness Evaluation

Use this approach when you want to:
1. Compare algorithm stability under noise or input changes
2. Find "breakpoints" where algorithms degrade significantly
3. Select algorithms that are robust to real-world variations
4. Understand failure modes under adverse conditions

## Example Interpretation

If `algorithm-a` has lower variance under perturbation than `algorithm-b`:
- `algorithm-a` is **more robust** - it produces consistent results even when inputs change
- `algorithm-a` may be preferable for production use where inputs are unpredictable

However, if `algorithm-b` has much better baseline accuracy:
- You may accept higher variance for better average performance
- This trade-off is domain-specific
