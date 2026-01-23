"""
Integration tests for PPEF framework.
"""

import pytest
from src.ppef import TestCase, Claim, Evaluator, Aggregator, FunctionTestCase


def test_end_to_end_simple():
    """Test simple end-to-end workflow."""
    
    # Define a simple function to test
    def add(a, b):
        return a + b
    
    # Create test cases
    test1 = FunctionTestCase("test_add_positive", add)
    test1.set_inputs(a=2, b=3).set_expected(5)
    
    test2 = FunctionTestCase("test_add_negative", add)
    test2.set_inputs(a=-1, b=-2).set_expected(-3)
    
    # Create a claim
    claim = Claim("addition_correctness", "Addition works correctly")
    
    # Create evaluator and run
    evaluator = Evaluator("addition_evaluation")
    evaluator.add_test_case(test1).add_test_case(test2).add_claim(claim)
    
    results = evaluator.run()
    
    # Verify results
    assert results['test_results']['total'] == 2
    assert results['test_results']['passed'] == 2
    assert results['claim_evaluation']['supported'] == 1


def test_end_to_end_with_failures():
    """Test end-to-end with some failing tests."""
    
    # Define tests with one that will fail
    def multiply(x, y):
        return x * y
    
    test1 = FunctionTestCase("test_mult_1", multiply)
    test1.set_inputs(x=2, y=3).set_expected(6)
    
    test2 = FunctionTestCase("test_mult_2", multiply)
    test2.set_inputs(x=3, y=4).set_expected(100)  # Wrong expectation
    
    # Create claim with custom predicate
    def at_least_half_pass(results):
        return sum(1 for r in results if r['success']) >= len(results) / 2
    
    claim = Claim("partial_success", "At least half tests pass", at_least_half_pass)
    
    # Run evaluation
    evaluator = Evaluator("mult_evaluation")
    evaluator.add_test_case(test1).add_test_case(test2).add_claim(claim)
    
    results = evaluator.run()
    
    # Verify
    assert results['test_results']['passed'] == 1
    assert results['test_results']['failed'] == 1
    assert results['claim_evaluation']['supported'] == 1


def test_end_to_end_with_metadata():
    """Test end-to-end with metadata and aggregation."""
    
    def process(value):
        return value * 2
    
    # Create tests with metadata
    test1 = FunctionTestCase("test_1", process)
    test1.set_inputs(value=5).set_expected(10).add_metadata(category="unit", priority="high")
    
    test2 = FunctionTestCase("test_2", process)
    test2.set_inputs(value=3).set_expected(6).add_metadata(category="unit", priority="low")
    
    test3 = FunctionTestCase("test_3", process)
    test3.set_inputs(value=10).set_expected(20).add_metadata(category="integration", priority="high")
    
    # Run evaluation
    evaluator = Evaluator("metadata_test")
    evaluator.add_test_case(test1).add_test_case(test2).add_test_case(test3)
    
    results = evaluator.run()
    
    # Aggregate by category
    by_category = Aggregator.aggregate_by_metadata(
        results['test_results']['results'],
        'category'
    )
    
    assert 'unit' in by_category
    assert 'integration' in by_category
    assert by_category['unit']['total'] == 2
    assert by_category['integration']['total'] == 1


def test_end_to_end_multiple_claims():
    """Test with multiple claims."""
    
    def divide(a, b):
        if b == 0:
            return None
        return a / b
    
    # Create tests
    test1 = FunctionTestCase("test_div_1", divide)
    test1.set_inputs(a=10, b=2).set_expected(5.0)
    
    test2 = FunctionTestCase("test_div_2", divide)
    test2.set_inputs(a=9, b=3).set_expected(3.0)
    
    test3 = FunctionTestCase("test_div_3", divide)
    test3.set_inputs(a=10, b=0).set_expected(None)
    
    # Multiple claims
    claim1 = Claim("all_pass", "All tests pass")
    
    def no_crashes(results):
        return all('actual' in r for r in results)
    claim2 = Claim("no_crashes", "No crashes occur", no_crashes)
    
    # Run
    evaluator = Evaluator("division_test")
    evaluator.add_test_case(test1).add_test_case(test2).add_test_case(test3)
    evaluator.add_claim(claim1).add_claim(claim2)
    
    results = evaluator.run()
    
    # All tests should pass
    assert results['test_results']['passed'] == 3
    assert results['claim_evaluation']['supported'] == 2


def test_end_to_end_with_statistics():
    """Test end-to-end with statistical analysis."""
    
    # Create multiple test results
    test_results = []
    for i in range(10):
        result = {
            'success': i % 3 != 0,  # Fail when i % 3 == 0: 0, 3, 6, 9 fail
            'metadata': {'value': i}
        }
        test_results.append(result)
    
    # Aggregate
    stats = Aggregator.aggregate_results(test_results)
    
    assert stats['total'] == 10
    assert stats['passed'] == 6  # 1,2,4,5,7,8 pass (0,3,6,9 fail)
    assert stats['failed'] == 4
    assert abs(stats['success_rate'] - 0.6) < 0.01


def test_custom_test_case_integration():
    """Test custom TestCase subclass integration."""
    
    class StringLengthTest(TestCase):
        def execute(self):
            text = self.inputs.get('text', '')
            return len(text)
    
    # Create tests
    test1 = StringLengthTest("test_len_1")
    test1.set_inputs(text="hello").set_expected(5)
    
    test2 = StringLengthTest("test_len_2")
    test2.set_inputs(text="world!").set_expected(6)
    
    # Claim
    claim = Claim("length_correctness", "Length calculation is correct")
    
    # Evaluate
    evaluator = Evaluator("string_test")
    evaluator.add_test_case(test1).add_test_case(test2).add_claim(claim)
    
    results = evaluator.run()
    
    assert results['test_results']['passed'] == 2
    assert results['claim_evaluation']['supported'] == 1
