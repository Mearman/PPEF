"""Spread Length SUT — list() to count Unicode code points."""


def create_sut():
    return {
        "id": "spread-length",
        "config": {},
        "run": lambda input: {"length": len(list(input["text"]))},
    }
