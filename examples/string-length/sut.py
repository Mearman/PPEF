"""String Length SUT — Built-in len()."""


def create_sut():
    return {
        "id": "builtin-length",
        "config": {},
        "run": lambda input: {"length": len(input["text"])},
    }
