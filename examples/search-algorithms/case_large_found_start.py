"""Large Array — Target Near Start (10000 elements, seed 123, target at index 5)."""

import math


def _lcg(seed):
    state = seed

    def next_val():
        nonlocal state
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        return (state & 0xFFFFFFFF) / 0xFFFFFFFF

    return next_val


def _shuffled_array(size, seed):
    arr = list(range(size))
    rng = _lcg(seed)
    for i in range(len(arr) - 1, 0, -1):
        j = math.floor(rng() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


_data = _shuffled_array(10000, 123)
_sorted_data = sorted(_data)
_target = _data[5]


def create_case():
    return {
        "case": {
            "caseId": "large-found-start",
            "caseClass": "large",
            "name": "Large Array \u2014 Target Near Start",
            "version": "1.0.0",
            "inputs": {"data": _data, "sortedData": _sorted_data, "target": _target},
        },
        "getInput": lambda: {"data": _data, "sortedData": _sorted_data, "target": _target},
        "getInputs": lambda: {"data": _data, "sortedData": _sorted_data, "target": _target},
    }
