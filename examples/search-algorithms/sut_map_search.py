"""Map Search SUT — dict lookup (construction time included)."""

import time


def create_sut():
    def run(input):
        data = input["data"]
        target = input["target"]
        start = time.perf_counter()

        lookup = {}
        for i in range(len(data)):
            lookup[data[i]] = i

        result = lookup.get(target)
        found = result is not None
        index = result if found else -1

        execution_time_ms = (time.perf_counter() - start) * 1000

        return {
            "found": found,
            "index": index,
            "comparisons": 1,
            "executionTimeMs": execution_time_ms,
        }

    return {"id": "map-search", "config": {}, "run": run}
