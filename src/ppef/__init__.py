"""
PPEF - Portable Programmatic Evaluation Framework

A claim-driven, deterministic evaluation framework for experiments.
"""

from .test_case import TestCase, FunctionTestCase
from .claim import Claim
from .evaluator import Evaluator
from .aggregator import Aggregator

__version__ = "0.1.0"
__all__ = ["TestCase", "FunctionTestCase", "Claim", "Evaluator", "Aggregator"]
