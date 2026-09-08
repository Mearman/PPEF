# Sorting Algorithms Example

Compares four sorting algorithms across six input distributions: small/medium/large random arrays, already-sorted, reverse-sorted, and nearly-sorted.

Requires **Node >= 23** for native TypeScript module support (`.ts` files loaded via dynamic `import()`).

## SUTs

| SUT              | Algorithm                                   | Role     |
| ---------------- | ------------------------------------------- | -------- |
| `bubble-sort`    | Adjacent swaps with early-exit optimisation | baseline |
| `insertion-sort` | Shift-insert into sorted prefix             | baseline |
| `merge-sort`     | Recursive divide-merge                      | primary  |
| `quick-sort`     | Lomuto partition, recursive                 | primary  |

All SUTs return `{ sorted, comparisons, swaps, executionTimeMs }`.

## Cases

| Case             | Size  | Distribution          | Class    |
| ---------------- | ----- | --------------------- | -------- |
| `small-random`   | 20    | LCG seed 42           | `small`  |
| `medium-random`  | 1000  | LCG seed 123          | `medium` |
| `large-random`   | 10000 | LCG seed 456          | `large`  |
| `already-sorted` | 1000  | `[0..999]`            | `sorted` |
| `reverse-sorted` | 1000  | `[999..0]`            | `sorted` |
| `nearly-sorted`  | 1000  | Sorted + 50 LCG swaps | `sorted` |

## Run

```bash
ppef validate examples/sorting-algorithms/experiment.json
ppef plan examples/sorting-algorithms/experiment.json
ppef run examples/sorting-algorithms/experiment.json
```

## Evaluate

```bash
# Claims: statistical hypothesis tests
ppef evaluate examples/sorting-algorithms/results/aggregates.json \
  -t claims -c examples/sorting-algorithms/eval-claims.json

# Metrics: threshold and baseline checks
ppef evaluate examples/sorting-algorithms/results/aggregates.json \
  -t metrics -c examples/sorting-algorithms/eval-metrics.json

# Exploratory: rankings, pairwise, case-class effects
ppef evaluate examples/sorting-algorithms/results/aggregates.json \
  -t exploratory -c examples/sorting-algorithms/eval-exploratory.json
```

## Notes

- **Quick sort worst case**: Lomuto partition degrades to O(n^2) on already-sorted and reverse-sorted inputs because the last element is always the min or max. This is visible in the `sorted` case class results.
- **Insertion sort on sorted data**: Performs O(n) comparisons and 0 swaps on already-sorted input, making it the fastest algorithm for that distribution.
- **Merge sort stability**: Comparison count is O(n log n) regardless of input distribution.
