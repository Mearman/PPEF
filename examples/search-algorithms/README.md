# Search Algorithms Example

Compares four search strategies across six cases varying array size, target position, and found/not-found scenarios.

Requires **Node >= 23** for native TypeScript module support (`.ts` files loaded via dynamic `import()`).

## SUTs

| SUT | Algorithm | Role |
|-----|-----------|------|
| `linear-search` | Sequential scan of unsorted `data` | baseline |
| `binary-search` | Iterative binary search on `sortedData` | primary |
| `map-search` | Build `Map(value -> index)` then `.get()` | primary |
| `set-search` | Build `Set` then `.has()` | primary |

All SUTs return `{ found, index, comparisons, executionTimeMs }`.

Map and Set SUTs include construction time in `executionTimeMs` to reflect the realistic cost of a single lookup when the data structure must be built first.

## Cases

| Case | Size | Target | Class |
|------|------|--------|-------|
| `small-found` | 100 | `data[50]` | `small` |
| `small-not-found` | 100 | `-1` | `small` |
| `large-found-start` | 10000 | `data[5]` | `large` |
| `large-found-middle` | 10000 | `data[5000]` | `large` |
| `large-found-end` | 10000 | `data[9990]` | `large` |
| `large-not-found` | 10000 | `-1` | `large` |

Large cases share seed 123 so they use the same shuffled array, differing only in target position.

## Run

```bash
ppef validate examples/search-algorithms/experiment.json
ppef plan examples/search-algorithms/experiment.json
ppef run examples/search-algorithms/experiment.json
```

## Evaluate

```bash
# Claims: statistical hypothesis tests
ppef evaluate examples/search-algorithms/results/aggregates.json \
  -t claims -c examples/search-algorithms/eval-claims.json

# Metrics: threshold, range, and baseline checks
ppef evaluate examples/search-algorithms/results/aggregates.json \
  -t metrics -c examples/search-algorithms/eval-metrics.json

# Exploratory: rankings, pairwise, case-class effects
ppef evaluate examples/search-algorithms/results/aggregates.json \
  -t exploratory -c examples/search-algorithms/eval-exploratory.json
```

## Notes

- **Claim C003 may be violated**: Map construction is O(n), so for a single lookup the total cost exceeds linear search. This is intentionally educational -- amortised O(1) lookup only pays off across many queries.
- **Binary search requires sorted input**: This SUT reads from `sortedData`, not `data`. The index returned is within the sorted array, not the original.
- **Comparison counts**: Map and Set SUTs report `comparisons: 1` as a convention since the hash-based lookup is a single operation.
