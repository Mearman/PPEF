"""Binary Search SUT — iterative binary search on sorted data."""

import time


def create_sut():
    def run(input):
        sorted_data = input["sortedData"]
        target = input["target"]
        start = time.perf_counter()

        comparisons = 0
        index = -1
        low = 0
        high = len(sorted_data) - 1

        while low <= high:
            mid = (low + high) // 2
            comparisons += 1

            if sorted_data[mid] == target:
                index = mid
                break
            elif sorted_data[mid] < target:
                low = mid + 1
            else:
                high = mid - 1

        execution_time_ms = (time.perf_counter() - start) * 1000

        return {
            "found": index != -1,
            "index": index,
            "comparisons": comparisons,
            "executionTimeMs": execution_time_ms,
        }

    return {"id": "binary-search", "config": {}, "run": run}
