"""Hello World Test Case."""


def create_case():
    return {
        "case": {
            "caseId": "hello-world",
            "caseClass": "basic",
            "name": "Hello World",
            "version": "1.0.0",
            "inputs": {"text": "hello world"},
        },
        "getInput": lambda: {"text": "hello world"},
        "getInputs": lambda: {"text": "hello world"},
    }
