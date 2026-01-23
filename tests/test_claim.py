"""
Unit tests for Claim module.
"""

import pytest
from src.ppef.claim import Claim, ClaimStatus


def test_claim_initialization():
    """Test Claim initialization."""
    claim = Claim("claim1", "Test statement")
    assert claim.claim_id == "claim1"
    assert claim.statement == "Test statement"
    assert claim.status == ClaimStatus.INCONCLUSIVE
    assert claim.evidence == []
    assert claim.confidence == 0.0


def test_claim_evaluate_empty():
    """Test evaluating claim with no results."""
    claim = Claim("claim1", "Test statement")
    status = claim.evaluate([])
    
    assert status == ClaimStatus.INCONCLUSIVE
    assert claim.confidence == 0.0


def test_claim_evaluate_default_all_pass():
    """Test default evaluation with all passing tests."""
    claim = Claim("claim1", "All tests pass")
    results = [
        {'success': True},
        {'success': True},
        {'success': True}
    ]
    
    status = claim.evaluate(results)
    
    assert status == ClaimStatus.SUPPORTED
    assert claim.confidence == 1.0
    assert len(claim.evidence) == 3


def test_claim_evaluate_default_some_fail():
    """Test default evaluation with some failing tests."""
    claim = Claim("claim1", "All tests pass")
    results = [
        {'success': True},
        {'success': False},
        {'success': True}
    ]
    
    status = claim.evaluate(results)
    
    assert status == ClaimStatus.REFUTED
    assert claim.confidence == 2/3


def test_claim_evaluate_custom_predicate_supported():
    """Test evaluation with custom predicate that passes."""
    def predicate(results):
        return sum(1 for r in results if r['success']) >= 2
    
    claim = Claim("claim1", "At least 2 tests pass", predicate)
    results = [
        {'success': True},
        {'success': False},
        {'success': True}
    ]
    
    status = claim.evaluate(results)
    
    assert status == ClaimStatus.SUPPORTED
    assert claim.confidence == 1.0


def test_claim_evaluate_custom_predicate_refuted():
    """Test evaluation with custom predicate that fails."""
    def predicate(results):
        return all(r['success'] for r in results)
    
    claim = Claim("claim1", "All tests pass", predicate)
    results = [
        {'success': True},
        {'success': False},
        {'success': True}
    ]
    
    status = claim.evaluate(results)
    
    assert status == ClaimStatus.REFUTED
    assert claim.confidence == 0.0


def test_claim_evaluate_custom_predicate_exception():
    """Test evaluation with predicate that raises exception."""
    def bad_predicate(results):
        raise ValueError("Test error")
    
    claim = Claim("claim1", "Bad predicate", bad_predicate)
    results = [{'success': True}]
    
    status = claim.evaluate(results)
    
    assert status == ClaimStatus.INCONCLUSIVE
    assert claim.confidence == 0.0


def test_claim_get_summary():
    """Test getting claim summary."""
    claim = Claim("claim1", "Test statement")
    results = [{'success': True}, {'success': True}]
    claim.evaluate(results)
    
    summary = claim.get_summary()
    
    assert summary['claim_id'] == "claim1"
    assert summary['statement'] == "Test statement"
    assert summary['status'] == "supported"
    assert summary['confidence'] == 1.0
    assert summary['evidence_count'] == 2


def test_claim_status_checks():
    """Test status check methods."""
    claim = Claim("claim1", "Test")
    
    # Initially inconclusive
    assert claim.is_inconclusive() is True
    assert claim.is_supported() is False
    assert claim.is_refuted() is False
    
    # After evaluation with all passing
    claim.evaluate([{'success': True}])
    assert claim.is_supported() is True
    assert claim.is_refuted() is False
    assert claim.is_inconclusive() is False
    
    # After evaluation with failures
    claim.evaluate([{'success': False}])
    assert claim.is_refuted() is True
    assert claim.is_supported() is False
    assert claim.is_inconclusive() is False
