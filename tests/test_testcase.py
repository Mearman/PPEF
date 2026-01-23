"""
Unit tests for TestCase module.
"""

import pytest
from src.ppef.test_case import TestCase, FunctionTestCase


class SimpleTestCase(TestCase):
    """A simple test case for testing purposes."""
    
    def execute(self):
        return self.inputs.get('value', 0) * 2


def test_testcase_initialization():
    """Test TestCase initialization."""
    test = SimpleTestCase("test1", "A test case")
    assert test.name == "test1"
    assert test.description == "A test case"
    assert test.inputs == {}
    assert test.expected_output is None


def test_testcase_set_inputs():
    """Test setting inputs."""
    test = SimpleTestCase("test1")
    test.set_inputs(value=5, other="data")
    assert test.inputs == {'value': 5, 'other': 'data'}


def test_testcase_set_expected():
    """Test setting expected output."""
    test = SimpleTestCase("test1")
    test.set_expected(42)
    assert test.expected_output == 42


def test_testcase_add_metadata():
    """Test adding metadata."""
    test = SimpleTestCase("test1")
    test.add_metadata(category="unit", priority="high")
    assert test.metadata == {'category': 'unit', 'priority': 'high'}


def test_testcase_method_chaining():
    """Test method chaining."""
    test = (SimpleTestCase("test1")
            .set_inputs(value=3)
            .set_expected(6)
            .add_metadata(category="unit"))
    
    assert test.inputs == {'value': 3}
    assert test.expected_output == 6
    assert test.metadata == {'category': 'unit'}


def test_testcase_execute():
    """Test execute method."""
    test = SimpleTestCase("test1")
    test.set_inputs(value=5)
    result = test.execute()
    assert result == 10


def test_testcase_run_success():
    """Test successful test case run."""
    test = SimpleTestCase("test1", "Multiply by 2")
    test.set_inputs(value=5).set_expected(10)
    
    result = test.run()
    
    assert result['name'] == "test1"
    assert result['description'] == "Multiply by 2"
    assert result['success'] is True
    assert result['expected'] == 10
    assert result['actual'] == 10
    assert result['inputs'] == {'value': 5}


def test_testcase_run_failure():
    """Test failed test case run."""
    test = SimpleTestCase("test1")
    test.set_inputs(value=5).set_expected(20)
    
    result = test.run()
    
    assert result['success'] is False
    assert result['expected'] == 20
    assert result['actual'] == 10


def test_testcase_run_no_expectation():
    """Test run without setting expected output."""
    test = SimpleTestCase("test1")
    test.set_inputs(value=5)
    
    result = test.run()
    
    assert result['success'] is True  # No expectation means success
    assert result['expected'] is None
    assert result['actual'] == 10


def test_function_testcase():
    """Test FunctionTestCase."""
    def add(a, b):
        return a + b
    
    test = FunctionTestCase("test_add", add, "Test addition")
    test.set_inputs(a=2, b=3).set_expected(5)
    
    result = test.run()
    
    assert result['success'] is True
    assert result['actual'] == 5
    assert result['name'] == "test_add"


def test_function_testcase_with_kwargs():
    """Test FunctionTestCase with keyword arguments."""
    def power(base, exponent=2):
        return base ** exponent
    
    test = FunctionTestCase("test_power", power)
    test.set_inputs(base=3, exponent=3).set_expected(27)
    
    result = test.run()
    
    assert result['success'] is True
    assert result['actual'] == 27
