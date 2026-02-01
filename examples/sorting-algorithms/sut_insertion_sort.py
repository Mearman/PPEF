"""Insertion Sort SUT — shift-insert pattern."""

import time


def create_sut():
    def run(input):
        arr = list(input["data"])
        comparisons = 0
        swaps = 0

        start = time.perf_counter()

        for i in range(1, len(arr)):
            key = arr[i]
            j = i - 1

            while j >= 0:
                comparisons += 1
                if arr[j] > key:
                    arr[j + 1] = arr[j]
                    swaps += 1
                    j -= 1
                else:
                    break
            arr[j + 1] = key

        execution_time_ms = (time.perf_counter() - start) * 1000

        return {
            "sorted": arr,
            "comparisons": comparisons,
            "swaps": swaps,
            "executionTimeMs": execution_time_ms,
        }

    return {"id": "insertion-sort", "config": {}, "run": run}
