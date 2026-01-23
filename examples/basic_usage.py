"""
Example demonstrating PPEF framework usage.

This example shows how to use PPEF to test a simple mathematical library
and validate claims about its correctness.
"""

from ppef import TestCase, Claim, Evaluator, Aggregator, FunctionTestCase


# Example 1: Simple function testing
def example_simple():
    """Simple example with basic arithmetic functions."""
    print("=" * 60)
    print("Example 1: Simple Function Testing")
    print("=" * 60)
    
    # Define functions to test
    def add(a, b):
        return a + b
    
    def multiply(a, b):
        return a * b
    
    # Create test cases
    test1 = FunctionTestCase("test_add_positive", add, "Test adding positive numbers")
    test1.set_inputs(a=2, b=3).set_expected(5)
    
    test2 = FunctionTestCase("test_add_negative", add, "Test adding negative numbers")
    test2.set_inputs(a=-5, b=-10).set_expected(-15)
    
    test3 = FunctionTestCase("test_multiply", multiply, "Test multiplication")
    test3.set_inputs(a=4, b=5).set_expected(20)
    
    # Create a claim
    claim = Claim(
        claim_id="math_correctness",
        statement="All mathematical operations produce correct results"
    )
    
    # Create evaluator and run
    evaluator = Evaluator("math_evaluation")
    evaluator.add_test_case(test1)
    evaluator.add_test_case(test2)
    evaluator.add_test_case(test3)
    evaluator.add_claim(claim)
    
    results = evaluator.run()
    
    # Print summary
    print(evaluator.get_summary())
    print("\nDetailed Results:")
    print(f"  Total tests: {results['test_results']['total']}")
    print(f"  Passed: {results['test_results']['passed']}")
    print(f"  Failed: {results['test_results']['failed']}")
    print(f"\n  Claim '{claim.claim_id}': {claim.status.value}")
    print(f"  Confidence: {claim.confidence:.2%}")
    print()


# Example 2: Custom test case with metadata
def example_custom_test():
    """Example with custom TestCase subclass and metadata."""
    print("=" * 60)
    print("Example 2: Custom Test Case with Metadata")
    print("=" * 60)
    
    class StringProcessorTest(TestCase):
        """Test case for string processing."""
        def execute(self):
            text = self.inputs.get('text', '')
            operation = self.inputs.get('operation', 'upper')
            
            if operation == 'upper':
                return text.upper()
            elif operation == 'lower':
                return text.lower()
            elif operation == 'reverse':
                return text[::-1]
            return text
    
    # Create tests with metadata
    test1 = StringProcessorTest("test_upper", "Test uppercase conversion")
    test1.set_inputs(text="hello", operation="upper").set_expected("HELLO")
    test1.add_metadata(category="string", priority="high", operation_type="case")
    
    test2 = StringProcessorTest("test_lower", "Test lowercase conversion")
    test2.set_inputs(text="WORLD", operation="lower").set_expected("world")
    test2.add_metadata(category="string", priority="medium", operation_type="case")
    
    test3 = StringProcessorTest("test_reverse", "Test string reversal")
    test3.set_inputs(text="python", operation="reverse").set_expected("nohtyp")
    test3.add_metadata(category="string", priority="low", operation_type="manipulation")
    
    # Run evaluation
    evaluator = Evaluator("string_processor_eval")
    evaluator.add_test_case(test1).add_test_case(test2).add_test_case(test3)
    
    results = evaluator.run()
    
    print(evaluator.get_summary())
    
    # Aggregate by metadata
    by_operation = Aggregator.aggregate_by_metadata(
        results['test_results']['results'],
        'operation_type'
    )
    
    print("\nAggregation by operation type:")
    for op_type, stats in by_operation.items():
        print(f"  {op_type}: {stats['passed']}/{stats['total']} passed")
    print()


# Example 3: Multiple claims with custom predicates
def example_multiple_claims():
    """Example with multiple claims and custom predicates."""
    print("=" * 60)
    print("Example 3: Multiple Claims with Custom Predicates")
    print("=" * 60)
    
    def safe_divide(a, b):
        """Division with zero check."""
        if b == 0:
            return None
        return a / b
    
    # Create test cases
    tests = [
        ("test_normal_1", 10, 2, 5.0),
        ("test_normal_2", 15, 3, 5.0),
        ("test_zero_div", 10, 0, None),
        ("test_negative", -10, 2, -5.0),
    ]
    
    evaluator = Evaluator("division_eval")
    
    for name, a, b, expected in tests:
        test = FunctionTestCase(name, safe_divide)
        test.set_inputs(a=a, b=b).set_expected(expected)
        evaluator.add_test_case(test)
    
    # Claim 1: All tests pass
    claim1 = Claim(
        "all_pass",
        "All division operations produce correct results"
    )
    
    # Claim 2: At least 75% pass
    def threshold_predicate(results):
        success_rate = sum(1 for r in results if r['success']) / len(results)
        return success_rate >= 0.75
    
    claim2 = Claim(
        "threshold_75",
        "At least 75% of tests pass",
        threshold_predicate
    )
    
    # Claim 3: No exceptions
    def no_exceptions_predicate(results):
        return all('actual' in r for r in results)
    
    claim3 = Claim(
        "no_exceptions",
        "No exceptions occur during execution",
        no_exceptions_predicate
    )
    
    evaluator.add_claim(claim1).add_claim(claim2).add_claim(claim3)
    
    results = evaluator.run()
    
    print(evaluator.get_summary())
    print("\nClaim Details:")
    for claim_data in results['claim_evaluation']['claims']:
        print(f"  {claim_data['claim_id']}: {claim_data['status']}")
        print(f"    Statement: {claim_data['statement']}")
        print(f"    Confidence: {claim_data['confidence']:.2%}")
    print()


# Example 4: Statistical aggregation
def example_statistics():
    """Example demonstrating statistical aggregation."""
    print("=" * 60)
    print("Example 4: Statistical Aggregation")
    print("=" * 60)
    
    import random
    random.seed(42)  # For reproducibility
    
    class ScoreTest(TestCase):
        """Test case for score computation."""
        def execute(self):
            base = self.inputs.get('base', 0)
            modifier = self.inputs.get('modifier', 1.0)
            return base * modifier + random.uniform(-2, 2)
    
    # Create many tests
    evaluator = Evaluator("statistics_eval")
    scores = []
    
    for i in range(20):
        test = ScoreTest(f"test_{i}")
        test.set_inputs(base=10, modifier=1.0)
        evaluator.add_test_case(test)
    
    # Run tests
    results = evaluator.run_tests()
    
    # Extract actual scores
    scores = [r['actual'] for r in results]
    
    # Compute statistics
    stats = Aggregator.compute_statistics(scores)
    
    print(f"Statistical Analysis of {len(scores)} test runs:")
    print(f"  Mean:   {stats['mean']:.2f}")
    print(f"  Median: {stats['median']:.2f}")
    print(f"  StdDev: {stats['stdev']:.2f}")
    print(f"  Min:    {stats['min']:.2f}")
    print(f"  Max:    {stats['max']:.2f}")
    print()


# Example 5: Comparing multiple evaluators
def example_comparison():
    """Example comparing multiple evaluators."""
    print("=" * 60)
    print("Example 5: Comparing Multiple Evaluators")
    print("=" * 60)
    
    def implementation_a(x):
        return x ** 2
    
    def implementation_b(x):
        return x * x
    
    # Evaluator 1: Testing implementation A
    eval1 = Evaluator("implementation_a")
    for i in range(1, 6):
        test = FunctionTestCase(f"test_a_{i}", implementation_a)
        test.set_inputs(x=i).set_expected(i * i)
        eval1.add_test_case(test)
    
    claim1 = Claim("impl_a_correct", "Implementation A is correct")
    eval1.add_claim(claim1)
    
    # Evaluator 2: Testing implementation B
    eval2 = Evaluator("implementation_b")
    for i in range(1, 6):
        test = FunctionTestCase(f"test_b_{i}", implementation_b)
        test.set_inputs(x=i).set_expected(i * i)
        eval2.add_test_case(test)
    
    claim2 = Claim("impl_b_correct", "Implementation B is correct")
    eval2.add_claim(claim2)
    
    # Run both
    results1 = eval1.run()
    results2 = eval2.run()
    
    # Compare
    comparison = Aggregator.compare_evaluators([results1, results2])
    
    print(f"Comparing {comparison['evaluator_count']} evaluators:\n")
    for eval_stats in comparison['evaluators']:
        print(f"  {eval_stats['name']}:")
        print(f"    Test success rate:  {eval_stats['test_success_rate']:.2%}")
        print(f"    Claim support rate: {eval_stats['claim_support_rate']:.2%}")
        print(f"    Total tests: {eval_stats['total_tests']}")
    print()


def main():
    """Run all examples."""
    example_simple()
    example_custom_test()
    example_multiple_claims()
    example_statistics()
    example_comparison()
    
    print("=" * 60)
    print("All examples completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
