"""
Evaluator module for PPEF framework.

Provides deterministic evaluation engine for running test cases and validating claims.
"""

from typing import List, Dict, Any, Optional
from .test_case import TestCase
from .claim import Claim, ClaimStatus


class Evaluator:
    """
    Deterministic evaluation engine for running test cases and validating claims.
    
    The Evaluator orchestrates the execution of test cases and evaluation of claims,
    ensuring deterministic and reproducible results.
    """
    
    def __init__(self, name: str = "default"):
        """
        Initialize an evaluator.
        
        Args:
            name: Name for this evaluator instance
        """
        self.name = name
        self.test_cases: List[TestCase] = []
        self.claims: List[Claim] = []
        self.results: List[Dict[str, Any]] = []
        
    def add_test_case(self, test_case: TestCase) -> 'Evaluator':
        """
        Add a test case to the evaluator.
        
        Args:
            test_case: TestCase to add
            
        Returns:
            Self for method chaining
        """
        self.test_cases.append(test_case)
        return self
    
    def add_claim(self, claim: Claim) -> 'Evaluator':
        """
        Add a claim to validate.
        
        Args:
            claim: Claim to add
            
        Returns:
            Self for method chaining
        """
        self.claims.append(claim)
        return self
    
    def run_tests(self) -> List[Dict[str, Any]]:
        """
        Run all test cases deterministically.
        
        Returns:
            List of test results
        """
        self.results = []
        for test_case in self.test_cases:
            result = test_case.run()
            self.results.append(result)
        return self.results
    
    def evaluate_claims(self) -> Dict[str, Any]:
        """
        Evaluate all claims against test results.
        
        Returns:
            Dictionary containing claim evaluation results
        """
        if not self.results:
            self.run_tests()
        
        claim_results = []
        for claim in self.claims:
            status = claim.evaluate(self.results)
            claim_results.append(claim.get_summary())
        
        return {
            'evaluator': self.name,
            'total_tests': len(self.results),
            'total_claims': len(self.claims),
            'claims': claim_results
        }
    
    def run(self) -> Dict[str, Any]:
        """
        Run all tests and evaluate all claims.
        
        Returns:
            Complete evaluation report
        """
        test_results = self.run_tests()
        claim_evaluation = self.evaluate_claims()
        
        passed_tests = sum(1 for r in test_results if r.get('success', False))
        supported_claims = sum(1 for c in self.claims if c.is_supported())
        
        return {
            'evaluator': self.name,
            'test_results': {
                'total': len(test_results),
                'passed': passed_tests,
                'failed': len(test_results) - passed_tests,
                'results': test_results
            },
            'claim_evaluation': {
                'total': len(self.claims),
                'supported': supported_claims,
                'refuted': sum(1 for c in self.claims if c.is_refuted()),
                'inconclusive': sum(1 for c in self.claims if c.is_inconclusive()),
                'claims': claim_evaluation['claims']
            }
        }
    
    def get_summary(self) -> str:
        """
        Get a human-readable summary of evaluation results.
        
        Returns:
            Summary string
        """
        if not self.results:
            return f"Evaluator '{self.name}': No tests run yet."
        
        passed = sum(1 for r in self.results if r.get('success', False))
        supported = sum(1 for c in self.claims if c.is_supported())
        
        summary = f"Evaluator '{self.name}':\n"
        summary += f"  Tests: {passed}/{len(self.results)} passed\n"
        summary += f"  Claims: {supported}/{len(self.claims)} supported\n"
        
        return summary
