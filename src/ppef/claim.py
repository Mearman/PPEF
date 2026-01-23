"""
Claim module for PPEF framework.

Provides claim-based evaluation for test results.
"""

from typing import Any, Dict, List, Callable, Optional
from enum import Enum


class ClaimStatus(Enum):
    """Status of a claim evaluation."""
    SUPPORTED = "supported"
    REFUTED = "refuted"
    INCONCLUSIVE = "inconclusive"


class Claim:
    """
    Represents a claim that can be validated against test results.
    
    A Claim defines a hypothesis or assertion about the system under test
    that can be evaluated based on experimental results.
    """
    
    def __init__(self, 
                 claim_id: str,
                 statement: str,
                 predicate: Optional[Callable[[List[Dict[str, Any]]], bool]] = None):
        """
        Initialize a claim.
        
        Args:
            claim_id: Unique identifier for the claim
            statement: Human-readable claim statement
            predicate: Optional function that evaluates results to determine
                      if the claim is supported. Should return True if supported.
        """
        self.claim_id = claim_id
        self.statement = statement
        self.predicate = predicate
        self.status = ClaimStatus.INCONCLUSIVE
        self.evidence: List[Dict[str, Any]] = []
        self.confidence: float = 0.0
        
    def evaluate(self, results: List[Dict[str, Any]]) -> ClaimStatus:
        """
        Evaluate the claim against test results.
        
        Args:
            results: List of test case results to evaluate
            
        Returns:
            ClaimStatus indicating if claim is supported, refuted, or inconclusive
        """
        self.evidence = results
        
        if not results:
            self.status = ClaimStatus.INCONCLUSIVE
            self.confidence = 0.0
            return self.status
        
        if self.predicate is None:
            # Default evaluation: claim is supported if all tests pass
            all_success = all(r.get('success', False) for r in results)
            self.status = ClaimStatus.SUPPORTED if all_success else ClaimStatus.REFUTED
            self.confidence = sum(1 for r in results if r.get('success', False)) / len(results)
        else:
            # Use custom predicate
            try:
                is_supported = self.predicate(results)
                self.status = ClaimStatus.SUPPORTED if is_supported else ClaimStatus.REFUTED
                self.confidence = 1.0 if is_supported else 0.0
            except Exception:
                # If predicate raises an exception, mark claim as inconclusive
                # Exception details are intentionally not logged to keep the framework
                # lightweight and allow users to implement their own logging if needed
                self.status = ClaimStatus.INCONCLUSIVE
                self.confidence = 0.0
        
        return self.status
    
    def get_summary(self) -> Dict[str, Any]:
        """
        Get a summary of the claim evaluation.
        
        Returns:
            Dictionary containing claim evaluation summary
        """
        return {
            'claim_id': self.claim_id,
            'statement': self.statement,
            'status': self.status.value,
            'confidence': self.confidence,
            'evidence_count': len(self.evidence)
        }
    
    def is_supported(self) -> bool:
        """Check if the claim is supported by evidence."""
        return self.status == ClaimStatus.SUPPORTED
    
    def is_refuted(self) -> bool:
        """Check if the claim is refuted by evidence."""
        return self.status == ClaimStatus.REFUTED
    
    def is_inconclusive(self) -> bool:
        """Check if the claim evaluation is inconclusive."""
        return self.status == ClaimStatus.INCONCLUSIVE
