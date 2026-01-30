# PPEF Examples

## Runnable Examples

These examples include all modules needed to execute end-to-end.

| Directory | Description |
|-----------|-------------|
| [`string-length/`](string-length/) | Minimal experiment comparing two string-length SUTs. Start here. |
| [`sorting-algorithms/`](sorting-algorithms/) | 4 sorting SUTs x 6 cases with claims, metrics, and exploratory evaluation. Node >= 23. |
| [`search-algorithms/`](search-algorithms/) | 4 search SUTs x 6 cases with claims, metrics, and exploratory evaluation. Node >= 23. |
| [`metrics-only/`](metrics-only/) | Metrics evaluator config designed for string-length output. |

Run the string-length experiment (minimal):

```bash
ppef run examples/string-length/experiment-two-suts.json
ppef evaluate results/aggregates.json -t metrics -c examples/metrics-only/eval-config.json
```

Run the sorting or search experiments (Node >= 23 required for `.ts` modules):

```bash
ppef run examples/sorting-algorithms/experiment.json
ppef run examples/search-algorithms/experiment.json
```

## Reference Templates

These examples demonstrate configuration schemas and patterns but are not directly runnable against the string-length data.

| Directory / File | Description |
|-----------------|-------------|
| [`experiment-config.example.json`](experiment-config.example.json) | Full experiment config template with all executor options. |
| [`robustness-only/`](robustness-only/) | Robustness evaluator config (requires perturbation metadata in results). |
| [`custom/`](custom/) | Guide to implementing and registering custom evaluators programmatically. |

## Shared Modules

| Directory | Description |
|-----------|-------------|
| [`suts/`](suts/) | Reusable SUT factories. |
| [`cases/`](cases/) | Reusable case definitions. |
| [`metrics/`](metrics/) | Reusable metrics extractors. |
