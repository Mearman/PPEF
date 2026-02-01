"""Merge Sort SUT — recursive divide-and-merge."""

import time


def create_sut():
    def run(input):
        arr = list(input["data"])
        counters = {"comparisons": 0, "swaps": 0}

        def merge(left, right):
            result = []
            i = j = 0
            while i < len(left) and j < len(right):
                counters["comparisons"] += 1
                if left[i] <= right[j]:
                    result.append(left[i])
                    i += 1
                else:
                    result.append(right[j])
                    counters["swaps"] += 1
                    j += 1
            result.extend(left[i:])
            result.extend(right[j:])
            return result

        def merge_sort(a):
            if len(a) <= 1:
                return a
            mid = len(a) // 2
            left = merge_sort(a[:mid])
            right = merge_sort(a[mid:])
            return merge(left, right)

        start = time.perf_counter()
        sorted_arr = merge_sort(arr)
        execution_time_ms = (time.perf_counter() - start) * 1000

        return {
            "sorted": sorted_arr,
            "comparisons": counters["comparisons"],
            "swaps": counters["swaps"],
            "executionTimeMs": execution_time_ms,
        }

    return {"id": "merge-sort", "config": {}, "run": run}
