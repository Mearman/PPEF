"""
Unit tests for Aggregator module.
"""

import pytest
from src.ppef.aggregator import Aggregator


def test_aggregate_results_empty():
    """Test aggregating empty results."""
    results = Aggregator.aggregate_results([])
    
    assert results['total'] == 0
    assert results['passed'] == 0
    assert results['failed'] == 0
    assert results['success_rate'] == 0.0


def test_aggregate_results_all_pass():
    """Test aggregating all passing results."""
    test_results = [
        {'success': True},
        {'success': True},
        {'success': True}
    ]
    
    results = Aggregator.aggregate_results(test_results)
    
    assert results['total'] == 3
    assert results['passed'] == 3
    assert results['failed'] == 0
    assert results['success_rate'] == 1.0


def test_aggregate_results_mixed():
    """Test aggregating mixed results."""
    test_results = [
        {'success': True},
        {'success': False},
        {'success': True},
        {'success': False}
    ]
    
    results = Aggregator.aggregate_results(test_results)
    
    assert results['total'] == 4
    assert results['passed'] == 2
    assert results['failed'] == 2
    assert results['success_rate'] == 0.5


def test_compute_statistics_empty():
    """Test computing statistics on empty list."""
    stats = Aggregator.compute_statistics([])
    
    assert stats['count'] == 0
    assert stats['mean'] == 0.0
    assert stats['median'] == 0.0
    assert stats['stdev'] == 0.0
    assert stats['min'] == 0.0
    assert stats['max'] == 0.0


def test_compute_statistics_single_value():
    """Test computing statistics on single value."""
    stats = Aggregator.compute_statistics([5.0])
    
    assert stats['count'] == 1
    assert stats['mean'] == 5.0
    assert stats['median'] == 5.0
    assert stats['stdev'] == 0.0
    assert stats['min'] == 5.0
    assert stats['max'] == 5.0


def test_compute_statistics_multiple_values():
    """Test computing statistics on multiple values."""
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    stats = Aggregator.compute_statistics(values)
    
    assert stats['count'] == 5
    assert stats['mean'] == 3.0
    assert stats['median'] == 3.0
    assert stats['min'] == 1.0
    assert stats['max'] == 5.0
    assert stats['stdev'] > 0  # Should have some standard deviation


def test_aggregate_by_metadata():
    """Test aggregating by metadata key."""
    test_results = [
        {'success': True, 'metadata': {'category': 'unit'}},
        {'success': False, 'metadata': {'category': 'unit'}},
        {'success': True, 'metadata': {'category': 'integration'}},
        {'success': True, 'metadata': {'category': 'integration'}}
    ]
    
    grouped = Aggregator.aggregate_by_metadata(test_results, 'category')
    
    assert 'unit' in grouped
    assert 'integration' in grouped
    assert grouped['unit']['total'] == 2
    assert grouped['unit']['passed'] == 1
    assert grouped['integration']['total'] == 2
    assert grouped['integration']['passed'] == 2


def test_aggregate_by_metadata_missing_key():
    """Test aggregating when some results don't have the metadata key."""
    test_results = [
        {'success': True, 'metadata': {'category': 'unit'}},
        {'success': False, 'metadata': {}},
        {'success': True}
    ]
    
    grouped = Aggregator.aggregate_by_metadata(test_results, 'category')
    
    assert 'unit' in grouped
    assert 'unknown' in grouped
    assert grouped['unknown']['total'] == 2


def test_aggregate_claims_empty():
    """Test aggregating empty claims."""
    result = Aggregator.aggregate_claims([])
    
    assert result['total'] == 0
    assert result['supported'] == 0
    assert result['refuted'] == 0
    assert result['inconclusive'] == 0
    assert result['avg_confidence'] == 0.0


def test_aggregate_claims_mixed():
    """Test aggregating mixed claim results."""
    claims = [
        {'status': 'supported', 'confidence': 1.0},
        {'status': 'refuted', 'confidence': 0.0},
        {'status': 'supported', 'confidence': 0.9},
        {'status': 'inconclusive', 'confidence': 0.0}
    ]
    
    result = Aggregator.aggregate_claims(claims)
    
    assert result['total'] == 4
    assert result['supported'] == 2
    assert result['refuted'] == 1
    assert result['inconclusive'] == 1
    assert result['avg_confidence'] == (1.0 + 0.0 + 0.9 + 0.0) / 4


def test_compare_evaluators():
    """Test comparing multiple evaluators."""
    eval_results = [
        {
            'evaluator': 'eval1',
            'test_results': {'total': 10, 'passed': 8},
            'claim_evaluation': {'total': 3, 'supported': 2}
        },
        {
            'evaluator': 'eval2',
            'test_results': {'total': 20, 'passed': 18},
            'claim_evaluation': {'total': 5, 'supported': 4}
        }
    ]
    
    comparison = Aggregator.compare_evaluators(eval_results)
    
    assert comparison['evaluator_count'] == 2
    assert len(comparison['evaluators']) == 2
    assert comparison['evaluators'][0]['name'] == 'eval1'
    assert comparison['evaluators'][0]['test_success_rate'] == 0.8
    assert comparison['evaluators'][0]['claim_support_rate'] == 2/3
    assert comparison['evaluators'][1]['name'] == 'eval2'
    assert comparison['evaluators'][1]['test_success_rate'] == 0.9


def test_compare_evaluators_empty():
    """Test comparing no evaluators."""
    comparison = Aggregator.compare_evaluators([])
    
    assert comparison['evaluator_count'] == 0
    assert comparison['evaluators'] == []
