"""Already Sorted Array case — [0..999]."""

_data = list(range(1000))


def create_case():
    return {
        "case": {
            "caseId": "already-sorted",
            "caseClass": "sorted",
            "name": "Already Sorted Array",
            "version": "1.0.0",
            "inputs": {"data": _data},
        },
        "getInput": lambda: {"data": _data},
        "getInputs": lambda: {"data": _data},
    }
