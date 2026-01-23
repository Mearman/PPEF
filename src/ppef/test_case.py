"""
TestCase module for PPEF framework.

Provides reusable test case abstraction for experiments.
"""

from typing import Any, Dict, Callable, Optional
from abc import ABC, abstractmethod


class TestCase(ABC):
    """
    Base class for reusable test cases.
    
    A TestCase represents a single experiment or test that can be executed
    deterministically with specific inputs and expected outcomes.
    """
    
    def __init__(self, name: str, description: str = ""):
        """
        Initialize a test case.
        
        Args:
            name: Unique name for the test case
            description: Optional description of what the test case validates
        """
        self.name = name
        self.description = description
        self.inputs: Dict[str, Any] = {}
        self.expected_output: Any = None
        self.actual_output: Any = None
        self.metadata: Dict[str, Any] = {}
        
    def set_inputs(self, **kwargs) -> 'TestCase':
        """
        Set input parameters for the test case.
        
        Args:
            **kwargs: Key-value pairs of input parameters
            
        Returns:
            Self for method chaining
        """
        self.inputs.update(kwargs)
        return self
    
    def set_expected(self, expected: Any) -> 'TestCase':
        """
        Set the expected output for the test case.
        
        Args:
            expected: The expected output value
            
        Returns:
            Self for method chaining
        """
        self.expected_output = expected
        return self
    
    def add_metadata(self, **kwargs) -> 'TestCase':
        """
        Add metadata to the test case.
        
        Args:
            **kwargs: Key-value pairs of metadata
            
        Returns:
            Self for method chaining
        """
        self.metadata.update(kwargs)
        return self
    
    @abstractmethod
    def execute(self) -> Any:
        """
        Execute the test case and return the actual output.
        
        This method must be implemented by subclasses to define
        the actual test logic.
        
        Returns:
            The actual output from executing the test
        """
        pass
    
    def run(self) -> Dict[str, Any]:
        """
        Run the test case and capture results.
        
        Returns:
            Dictionary containing test results with keys:
                - name: test case name
                - success: whether test passed
                - expected: expected output
                - actual: actual output
                - metadata: test metadata
        """
        self.actual_output = self.execute()
        
        return {
            'name': self.name,
            'description': self.description,
            'success': self._check_success(),
            'expected': self.expected_output,
            'actual': self.actual_output,
            'inputs': self.inputs,
            'metadata': self.metadata
        }
    
    def _check_success(self) -> bool:
        """
        Check if the test case passed.
        
        Returns:
            True if actual output matches expected output
        """
        if self.expected_output is None:
            return True  # No expectation set
        return self.actual_output == self.expected_output


class FunctionTestCase(TestCase):
    """
    A test case that wraps a function for testing.
    """
    
    def __init__(self, name: str, function: Callable, description: str = ""):
        """
        Initialize a function-based test case.
        
        Args:
            name: Unique name for the test case
            function: The function to test
            description: Optional description
        """
        super().__init__(name, description)
        self.function = function
    
    def execute(self) -> Any:
        """
        Execute the wrapped function with provided inputs.
        
        Returns:
            The output from the function
        """
        return self.function(**self.inputs)
