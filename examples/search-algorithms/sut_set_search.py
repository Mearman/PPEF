"""Set Search SUT — set membership (construction time included)."""

import time


def create_sut():
    def run(input):
        data = input["data"]
        target = input["target"]
        start = time.perf_counter()

        s = set(data)
        found = target in s

        execution_time_ms = (time.perf_counter() - start) * 1000

        index = data.index(target) if found else -1

        return {
            "found": found,
            "index": index,
            "comparisons": 1,
            "executionTimeMs": execution_time_ms,
        }

    return {"id": "set-search", "config": {}, "run": run}
