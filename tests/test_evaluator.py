"""
Unit tests for Evaluator module.
"""

import pytest
from src.ppef.evaluator import Evaluator
from src.ppef.test_case import TestCase, FunctionTestCase
from src.ppef.claim import Claim, ClaimStatus


class DummyTest(TestCase):
    """Dummy test case for testing."""
    def execute(self):
        return self.inputs.get('result', True)


def test_evaluator_initialization():
    """Test Evaluator initialization."""
    evaluator = Evaluator("test_eval")
    assert evaluator.name == "test_eval"
    assert evaluator.test_cases == []
    assert evaluator.claims == []
    assert evaluator.results == []


def test_evaluator_add_test_case():
    """Test adding test cases."""
    evaluator = Evaluator()
    test = DummyTest("test1")
    
    evaluator.add_test_case(test)
    
    assert len(evaluator.test_cases) == 1
    assert evaluator.test_cases[0] == test


def test_evaluator_add_test_case_chaining():
    """Test method chaining for adding test cases."""
    evaluator = Evaluator()
    test1 = DummyTest("test1")
    test2 = DummyTest("test2")
    
    evaluator.add_test_case(test1).add_test_case(test2)
    
    assert len(evaluator.test_cases) == 2


def test_evaluator_add_claim():
    """Test adding claims."""
    evaluator = Evaluator()
    claim = Claim("claim1", "Test claim")
    
    evaluator.add_claim(claim)
    
    assert len(evaluator.claims) == 1
    assert evaluator.claims[0] == claim


def test_evaluator_run_tests():
    """Test running tests."""
    evaluator = Evaluator()
    
    test1 = DummyTest("test1")
    test1.set_inputs(result=True).set_expected(True)
    
    test2 = DummyTest("test2")
    test2.set_inputs(result=False).set_expected(False)
    
    evaluator.add_test_case(test1).add_test_case(test2)
    
    results = evaluator.run_tests()
    
    assert len(results) == 2
    assert results[0]['name'] == "test1"
    assert results[0]['success'] is True
    assert results[1]['name'] == "test2"
    assert results[1]['success'] is True


def test_evaluator_evaluate_claims():
    """Test evaluating claims."""
    evaluator = Evaluator()
    
    test1 = DummyTest("test1")
    test1.set_inputs(result=True).set_expected(True)
    
    evaluator.add_test_case(test1)
    
    claim = Claim("claim1", "Test passes")
    evaluator.add_claim(claim)
    
    evaluation = evaluator.evaluate_claims()
    
    assert evaluation['total_tests'] == 1
    assert evaluation['total_claims'] == 1
    assert evaluation['claims'][0]['status'] == 'supported'


def test_evaluator_run_complete():
    """Test complete evaluation run."""
    evaluator = Evaluator("complete_test")
    
    # Add passing test
    test1 = DummyTest("test1")
    test1.set_inputs(result=True).set_expected(True)
    evaluator.add_test_case(test1)
    
    # Add failing test
    test2 = DummyTest("test2")
    test2.set_inputs(result=False).set_expected(True)
    evaluator.add_test_case(test2)
    
    # Add claim
    def predicate(results):
        return sum(1 for r in results if r['success']) >= 1
    
    claim = Claim("claim1", "At least one test passes", predicate)
    evaluator.add_claim(claim)
    
    results = evaluator.run()
    
    assert results['evaluator'] == "complete_test"
    assert results['test_results']['total'] == 2
    assert results['test_results']['passed'] == 1
    assert results['test_results']['failed'] == 1
    assert results['claim_evaluation']['total'] == 1
    assert results['claim_evaluation']['supported'] == 1


def test_evaluator_get_summary():
    """Test getting summary."""
    evaluator = Evaluator("summary_test")
    
    test1 = DummyTest("test1")
    test1.set_inputs(result=True).set_expected(True)
    evaluator.add_test_case(test1)
    
    claim = Claim("claim1", "Test passes")
    evaluator.add_claim(claim)
    
    evaluator.run()
    
    summary = evaluator.get_summary()
    
    assert "summary_test" in summary
    assert "1/1 passed" in summary
    assert "1/1 supported" in summary


def test_evaluator_get_summary_no_tests():
    """Test getting summary with no tests run."""
    evaluator = Evaluator("empty_test")
    
    summary = evaluator.get_summary()
    
    assert "empty_test" in summary
    assert "No tests run" in summary
