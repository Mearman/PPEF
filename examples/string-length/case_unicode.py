"""Unicode Emoji Test Case."""


def create_case():
    return {
        "case": {
            "caseId": "unicode-emoji",
            "caseClass": "unicode",
            "name": "Unicode Emoji",
            "version": "1.0.0",
            "inputs": {"text": "hello \U0001f30d\U0001f389"},
        },
        "getInput": lambda: {"text": "hello \U0001f30d\U0001f389"},
        "getInputs": lambda: {"text": "hello \U0001f30d\U0001f389"},
    }
