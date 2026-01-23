"""
Aggregator module for PPEF framework.

Provides statistical aggregation of test results and evaluation metrics.
"""

from typing import List, Dict, Any, Optional
import statistics


class Aggregator:
    """
    Statistical aggregator for test results and evaluation metrics.
    
    The Aggregator provides methods to compute statistical metrics over
    test results, enabling quantitative analysis of experiments.
    """
    
    @staticmethod
    def aggregate_results(results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Aggregate test results with statistical metrics.
        
        Args:
            results: List of test case results
            
        Returns:
            Dictionary containing aggregated statistics
        """
        if not results:
            return {
                'total': 0,
                'passed': 0,
                'failed': 0,
                'success_rate': 0.0
            }
        
        passed = sum(1 for r in results if r.get('success', False))
        failed = len(results) - passed
        success_rate = passed / len(results)
        
        return {
            'total': len(results),
            'passed': passed,
            'failed': failed,
            'success_rate': success_rate
        }
    
    @staticmethod
    def compute_statistics(values: List[float]) -> Dict[str, float]:
        """
        Compute statistical metrics for a list of numeric values.
        
        Args:
            values: List of numeric values
            
        Returns:
            Dictionary with mean, median, stdev, min, max
        """
        if not values:
            return {
                'count': 0,
                'mean': 0.0,
                'median': 0.0,
                'stdev': 0.0,
                'min': 0.0,
                'max': 0.0
            }
        
        return {
            'count': len(values),
            'mean': statistics.mean(values),
            'median': statistics.median(values),
            'stdev': statistics.stdev(values) if len(values) > 1 else 0.0,
            'min': min(values),
            'max': max(values)
        }
    
    @staticmethod
    def aggregate_by_metadata(results: List[Dict[str, Any]], 
                             key: str) -> Dict[str, Dict[str, Any]]:
        """
        Aggregate results grouped by a metadata key.
        
        Args:
            results: List of test case results
            key: Metadata key to group by
            
        Returns:
            Dictionary mapping metadata values to aggregated statistics
        """
        groups: Dict[str, List[Dict[str, Any]]] = {}
        
        for result in results:
            metadata_value = result.get('metadata', {}).get(key, 'unknown')
            if metadata_value not in groups:
                groups[metadata_value] = []
            groups[metadata_value].append(result)
        
        return {
            group_key: Aggregator.aggregate_results(group_results)
            for group_key, group_results in groups.items()
        }
    
    @staticmethod
    def aggregate_claims(claims: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Aggregate claim evaluation results.
        
        Args:
            claims: List of claim evaluation summaries
            
        Returns:
            Dictionary with aggregated claim statistics
        """
        if not claims:
            return {
                'total': 0,
                'supported': 0,
                'refuted': 0,
                'inconclusive': 0,
                'avg_confidence': 0.0
            }
        
        supported = sum(1 for c in claims if c.get('status') == 'supported')
        refuted = sum(1 for c in claims if c.get('status') == 'refuted')
        inconclusive = sum(1 for c in claims if c.get('status') == 'inconclusive')
        
        confidences = [c.get('confidence', 0.0) for c in claims]
        avg_confidence = statistics.mean(confidences) if confidences else 0.0
        
        return {
            'total': len(claims),
            'supported': supported,
            'refuted': refuted,
            'inconclusive': inconclusive,
            'avg_confidence': avg_confidence
        }
    
    @staticmethod
    def compare_evaluators(evaluator_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compare results from multiple evaluators.
        
        Args:
            evaluator_results: List of evaluator result dictionaries
            
        Returns:
            Comparative analysis of evaluator performance
        """
        comparison = {
            'evaluator_count': len(evaluator_results),
            'evaluators': []
        }
        
        for eval_result in evaluator_results:
            eval_name = eval_result.get('evaluator', 'unknown')
            test_results = eval_result.get('test_results', {})
            claim_results = eval_result.get('claim_evaluation', {})
            
            comparison['evaluators'].append({
                'name': eval_name,
                'test_success_rate': test_results.get('passed', 0) / max(test_results.get('total', 1), 1),
                'claim_support_rate': claim_results.get('supported', 0) / max(claim_results.get('total', 1), 1),
                'total_tests': test_results.get('total', 0),
                'total_claims': claim_results.get('total', 0)
            })
        
        return comparison
