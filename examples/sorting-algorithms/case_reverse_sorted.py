"""Reverse Sorted Array case — [999..0]."""

_data = list(range(999, -1, -1))


def create_case():
    return {
        "case": {
            "caseId": "reverse-sorted",
            "caseClass": "sorted",
            "name": "Reverse Sorted Array",
            "version": "1.0.0",
            "inputs": {"data": _data},
        },
        "getInput": lambda: {"data": _data},
        "getInputs": lambda: {"data": _data},
    }
