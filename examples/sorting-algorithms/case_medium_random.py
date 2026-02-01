"""Medium Random Array case — 1000 elements, LCG seed 123."""

import math


def _lcg(seed):
    state = seed

    def next_val():
        nonlocal state
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        return (state & 0xFFFFFFFF) / 0xFFFFFFFF

    return next_val


def _random_array(size, seed):
    rng = _lcg(seed)
    return [math.floor(rng() * size * 10) for _ in range(size)]


_data = _random_array(1000, 123)


def create_case():
    return {
        "case": {
            "caseId": "medium-random",
            "caseClass": "medium",
            "name": "Medium Random Array",
            "version": "1.0.0",
            "inputs": {"data": _data},
        },
        "getInput": lambda: {"data": _data},
        "getInputs": lambda: {"data": _data},
    }
