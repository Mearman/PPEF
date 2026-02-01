"""Bubble Sort SUT — with early exit optimization."""

import time


def create_sut():
    def run(input):
        arr = list(input["data"])
        comparisons = 0
        swaps = 0

        start = time.perf_counter()

        n = len(arr)
        for i in range(n - 1):
            swapped = False
            for j in range(n - 1 - i):
                comparisons += 1
                if arr[j] > arr[j + 1]:
                    arr[j], arr[j + 1] = arr[j + 1], arr[j]
                    swaps += 1
                    swapped = True
            if not swapped:
                break

        execution_time_ms = (time.perf_counter() - start) * 1000

        return {
            "sorted": arr,
            "comparisons": comparisons,
            "swaps": swaps,
            "executionTimeMs": execution_time_ms,
        }

    return {"id": "bubble-sort", "config": {}, "run": run}
