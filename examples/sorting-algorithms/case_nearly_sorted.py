"""Nearly Sorted Array case — sorted + 50 LCG(seed=789) swaps."""

import math


def _lcg(seed):
    state = seed

    def next_val():
        nonlocal state
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        return (state & 0xFFFFFFFF) / 0xFFFFFFFF

    return next_val


_data = list(range(1000))
_rng = _lcg(789)
for _s in range(50):
    _i = math.floor(_rng() * len(_data))
    _j = math.floor(_rng() * len(_data))
    _data[_i], _data[_j] = _data[_j], _data[_i]


def create_case():
    return {
        "case": {
            "caseId": "nearly-sorted",
            "caseClass": "sorted",
            "name": "Nearly Sorted Array",
            "version": "1.0.0",
            "inputs": {"data": _data},
        },
        "getInput": lambda: {"data": _data},
        "getInputs": lambda: {"data": _data},
    }
