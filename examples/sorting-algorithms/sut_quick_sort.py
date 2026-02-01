"""Quick Sort SUT — Lomuto partition scheme."""

import time


def create_sut():
    def run(input):
        arr = list(input["data"])
        counters = {"comparisons": 0, "swaps": 0}

        def swap(a, i, j):
            a[i], a[j] = a[j], a[i]

        def partition(a, lo, hi):
            pivot = a[hi]
            i = lo
            for j in range(lo, hi):
                counters["comparisons"] += 1
                if a[j] <= pivot:
                    if i != j:
                        swap(a, i, j)
                        counters["swaps"] += 1
                    i += 1
            if i != hi:
                swap(a, i, hi)
                counters["swaps"] += 1
            return i

        def quick_sort(a, lo, hi):
            if lo < hi:
                p = partition(a, lo, hi)
                quick_sort(a, lo, p - 1)
                quick_sort(a, p + 1, hi)

        start = time.perf_counter()
        if len(arr) > 1:
            quick_sort(arr, 0, len(arr) - 1)
        execution_time_ms = (time.perf_counter() - start) * 1000

        return {
            "sorted": arr,
            "comparisons": counters["comparisons"],
            "swaps": counters["swaps"],
            "executionTimeMs": execution_time_ms,
        }

    return {"id": "quick-sort", "config": {}, "run": run}
