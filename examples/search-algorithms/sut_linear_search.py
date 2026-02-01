"""Linear Search SUT — sequential scan."""

import time


def create_sut():
    def run(input):
        data = input["data"]
        target = input["target"]
        start = time.perf_counter()

        comparisons = 0
        index = -1

        for i in range(len(data)):
            comparisons += 1
            if data[i] == target:
                index = i
                break

        execution_time_ms = (time.perf_counter() - start) * 1000

        return {
            "found": index != -1,
            "index": index,
            "comparisons": comparisons,
            "executionTimeMs": execution_time_ms,
        }

    return {"id": "linear-search", "config": {}, "run": run}
