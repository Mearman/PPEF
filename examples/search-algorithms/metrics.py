"""Search Algorithms Metrics Extractor."""


def extract(result):
    r = result if isinstance(result, dict) else {}
    return {
        "comparisons": r.get("comparisons", 0),
        "found": 1 if r.get("found") else 0,
        "executionTimeMs": r.get("executionTimeMs", 0),
    }
