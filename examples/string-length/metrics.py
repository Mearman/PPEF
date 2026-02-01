"""String Length Metrics Extractor."""


def extract(result):
    return {"length": result.get("length", 0) if isinstance(result, dict) else 0}
