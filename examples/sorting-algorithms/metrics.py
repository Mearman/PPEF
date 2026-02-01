"""Sorting Algorithms Metrics Extractor."""


def extract(result):
    r = result if isinstance(result, dict) else {}
    return {
        "comparisons": r.get("comparisons", 0),
        "swaps": r.get("swaps", 0),
        "executionTimeMs": r.get("executionTimeMs", 0),
    }
