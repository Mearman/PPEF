# PPEF - Portable Programmatic Evaluation Framework

A claim-driven, deterministic evaluation framework for experiments. PPEF provides a structured approach to testing and validating software components through reusable test cases, statistical aggregation, and claim-based evaluation.

## Features

- **Reusable Test Cases**: Define test cases as first-class objects that can be executed deterministically
- **Claim-Based Evaluation**: Make assertions about your system and validate them against experimental results
- **Statistical Aggregation**: Compute meaningful statistics over test results for quantitative analysis
- **Deterministic Execution**: Ensure reproducible results across multiple runs
- **Flexible Architecture**: Easy to extend and customize for specific use cases

## Installation

```bash
pip install -e .
```

## Quick Start

Here's a simple example demonstrating the core features of PPEF:

```python
from ppef import TestCase, Claim, Evaluator, Aggregator

# Define a simple test case
class AdditionTest(TestCase):
    def execute(self):
        return self.inputs['a'] + self.inputs['b']

# Create test instances
test1 = AdditionTest("test_addition_1", "Test adding two positive numbers")
test1.set_inputs(a=2, b=3).set_expected(5)

test2 = AdditionTest("test_addition_2", "Test adding positive and negative")
test2.set_inputs(a=5, b=-3).set_expected(2)

# Define a claim
claim = Claim(
    claim_id="addition_correctness",
    statement="The addition operation produces correct results"
)

# Create an evaluator and run
evaluator = Evaluator("addition_eval")
evaluator.add_test_case(test1).add_test_case(test2).add_claim(claim)

# Execute and get results
results = evaluator.run()
print(evaluator.get_summary())

# Aggregate statistics
aggregated = Aggregator.aggregate_results(results['test_results']['results'])
print(f"Success rate: {aggregated['success_rate']:.2%}")
```

## Core Components

### TestCase

The `TestCase` class is the foundation for defining reusable test scenarios:

```python
from ppef import TestCase

class MyTest(TestCase):
    def execute(self):
        # Implement your test logic here
        return some_function(**self.inputs)

# Configure and run
test = MyTest("my_test", "Description of test")
test.set_inputs(param1="value1", param2="value2")
test.set_expected(expected_result)
test.add_metadata(category="unit", priority="high")

result = test.run()
```

### Claim

Claims represent hypotheses or assertions that can be validated:

```python
from ppef import Claim

# Simple claim (default: all tests must pass)
claim1 = Claim(
    claim_id="basic_claim",
    statement="All tests should pass"
)

# Custom predicate for complex validation
def custom_predicate(results):
    success_rate = sum(1 for r in results if r['success']) / len(results)
    return success_rate >= 0.8

claim2 = Claim(
    claim_id="threshold_claim",
    statement="At least 80% of tests should pass",
    predicate=custom_predicate
)
```

### Evaluator

The `Evaluator` orchestrates test execution and claim validation:

```python
from ppef import Evaluator

evaluator = Evaluator("my_evaluation")

# Add test cases
evaluator.add_test_case(test1)
evaluator.add_test_case(test2)

# Add claims
evaluator.add_claim(claim1)
evaluator.add_claim(claim2)

# Run everything
results = evaluator.run()

# Get human-readable summary
print(evaluator.get_summary())
```

### Aggregator

The `Aggregator` provides statistical analysis of results:

```python
from ppef import Aggregator

# Basic aggregation
stats = Aggregator.aggregate_results(test_results)
# Returns: {'total': 10, 'passed': 8, 'failed': 2, 'success_rate': 0.8}

# Group by metadata
grouped = Aggregator.aggregate_by_metadata(test_results, 'category')

# Statistical metrics for numeric values
values = [1.2, 2.3, 1.8, 2.1, 1.9]
metrics = Aggregator.compute_statistics(values)
# Returns: {'mean': ..., 'median': ..., 'stdev': ..., 'min': ..., 'max': ...}

# Claim aggregation
claim_stats = Aggregator.aggregate_claims(claim_results)

# Compare multiple evaluators
comparison = Aggregator.compare_evaluators([eval1_results, eval2_results])
```

## Advanced Usage

### Function-based Test Cases

For simple function testing, use `FunctionTestCase`:

```python
from ppef import FunctionTestCase

def multiply(x, y):
    return x * y

test = FunctionTestCase("test_multiply", multiply, "Test multiplication")
test.set_inputs(x=3, y=4).set_expected(12)
result = test.run()
```

### Custom Test Cases

Extend `TestCase` for complex scenarios:

```python
from ppef import TestCase

class APITest(TestCase):
    def execute(self):
        import requests
        response = requests.get(
            self.inputs['url'],
            headers=self.inputs.get('headers', {})
        )
        return response.status_code

test = APITest("api_health", "Check API health endpoint")
test.set_inputs(url="https://api.example.com/health")
test.set_expected(200)
```

### Metadata-driven Analysis

Use metadata for rich analysis:

```python
test1.add_metadata(category="performance", priority="high")
test2.add_metadata(category="functional", priority="medium")

# Run all tests
evaluator.run()

# Aggregate by category
by_category = Aggregator.aggregate_by_metadata(
    evaluator.results, 
    'category'
)
```

## Design Philosophy

PPEF is built on several key principles:

1. **Determinism**: Test execution should be reproducible and predictable
2. **Composability**: Components should work together seamlessly
3. **Extensibility**: Easy to customize for specific needs
4. **Clarity**: Results should be clear and actionable
5. **Statistical Rigor**: Provide quantitative metrics for decision-making

## Use Cases

- **Algorithm Validation**: Test and validate algorithmic implementations
- **Performance Benchmarking**: Measure and compare performance metrics
- **Regression Testing**: Ensure new changes don't break existing functionality
- **Experimental Research**: Conduct reproducible computational experiments
- **Quality Assurance**: Systematic validation of software components

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.
