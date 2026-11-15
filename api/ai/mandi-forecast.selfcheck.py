"""Uses real artifacts for inference and mocks external LLM calls."""
import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('forecast', Path(__file__).with_name('mandi-forecast.py'))
forecast = importlib.util.module_from_spec(spec)
spec.loader.exec_module(forecast)


class ForecastChecks(unittest.TestCase):
    def setUp(self):
        _, _, mappings, columns = forecast.load_artifacts()
        # Synthetic contract fixture, not a meaningful market scenario.
        self.features = {name: mappings[name][0] if name in mappings else 1.0 for name in columns}
        self.review = {'status': 'CONSISTENT', 'rationale': 'Supplied conditions align.', 'concerns': [],
                       'featureChecks': [{'feature': 'modal_price', 'assessment': 'CONTEXT', 'explanation': 'Current reference.'}],
                       'missingInformation': [],
                       'advisory': {'recommendation': 'CONSIDER_ALTERNATIVE', 'summary': 'Consider holding.',
                                    'suggestedAction': 'Compare storage costs first.', 'limitations': []}}

    def test_real_model_and_feature_order(self):
        result = forecast.predict(self.features)
        self.assertEqual(result['featureCount'], 40)
        self.assertIn(result['direction'], {'UP', 'DOWN', 'STABLE'})
        self.assertAlmostEqual(sum(result['classProbabilities'].values()), 1)
        self.assertEqual(result, forecast.predict(dict(reversed(list(self.features.items())))))

    def test_quick_predictions_never_call_qwen(self):
        for crop in ['Tomato', 'Potato', 'Onion']:
            features = {**self.features, 'vegetable': crop}
            with patch.object(forecast, 'review_prediction', side_effect=AssertionError('Qwen must not run')) as reviewer:
                status, result = forecast.process_request({'features': features, 'review': False})
            self.assertEqual(status, 200)
            reviewer.assert_not_called()
            self.assertTrue(result['quickRecommendation'])
            self.assertIsNone(result['reviewModel'])
            self.assertEqual(result['inputFeatures']['vegetable'], crop)

    def test_quick_predictions_reject_unsupported_crops(self):
        status, _ = forecast.process_request({'features': {**self.features, 'vegetable': 'Wheat'}, 'review': False})
        self.assertEqual(status, 400)

    def test_invalid_inputs(self):
        for features in (None, {}, {**self.features, 'vegetable': 'Wool'},
                         {**self.features, 'price_norm': float('nan')},
                         {**self.features, 'price_norm': True}):
            self.assertEqual(forecast.process_request({'features': features})[0], 400)

    def test_missing_key_withholds_advisory(self):
        with patch.dict('os.environ', {}, clear=True):
            status, result = forecast.process_request({'features': self.features})
        self.assertEqual(status, 200)
        self.assertEqual(result['status'], 'REVIEW_REQUIRED')
        self.assertIsNone(result['advisory'])

    def test_full_pipeline_sends_conditions_and_preserves_prediction(self):
        payload = {'choices': [{'message': {'content': json.dumps(self.review)}}]}
        with patch.dict('os.environ', {'GROQ_API_KEY': 'test'}), patch.object(forecast, 'urlopen') as call:
            call.return_value.__enter__.return_value = io.StringIO(json.dumps(payload))
            status, result = forecast.process_request({'features': self.features, 'conditions': {'storageCost': 10}})
        self.assertEqual(status, 200)
        self.assertEqual(result['status'], 'READY')
        self.assertEqual(result['direction'], forecast.predict(self.features)['direction'])
        sent = json.loads(call.call_args.args[0].data)
        self.assertEqual(sent['model'], 'qwen/qwen3.8-27b')
        self.assertEqual(call.call_args.args[0].full_url, 'https://api.groq.com/openai/v1/chat/completions')
        self.assertEqual(call.call_args.args[0].get_header('Authorization'), 'Bearer test')
        self.assertEqual(call.call_args.args[0].get_header('User-agent'), 'AgriTrace/1.0')
        context = json.loads(sent['messages'][1]['content'])
        self.assertEqual(result['inputFeatures'], self.features)
        self.assertEqual(result['reviewModel'], 'qwen/qwen3.8-27b')
        self.assertIn('UP alone never justifies HOLD', sent['messages'][0]['content'])
        self.assertEqual(context['features'], self.features)
        self.assertEqual(context['conditions'], {'storageCost': 10})

    def test_concerns_and_invalid_reviews_withhold_advice(self):
        self.review['status'] = 'CONCERNS'
        self.review['concerns'] = ['Conflicting price signals.']
        review, advisory = forecast.validate_review(self.review, self.features)
        self.assertEqual(review['status'], 'CONCERNS')
        self.assertIsNone(advisory)
        with patch.dict('os.environ', {'GROQ_API_KEY': 'test'}), patch.object(forecast, 'urlopen', side_effect=TimeoutError):
            review, advisory = forecast.review_prediction({}, self.features, {})
        self.assertEqual(review['status'], 'UNAVAILABLE')
        self.assertIsNone(advisory)
        with self.assertRaises(ValueError):
            forecast.validate_review({'status': 'VERIFIED'}, self.features)

    def test_unknown_feature_citations_are_rejected(self):
        self.review['featureChecks'][0]['feature'] = 'invented_signal'
        with self.assertRaises(ValueError):
            forecast.validate_review(self.review, self.features)

    def test_insufficient_review_requires_missing_information(self):
        self.review['status'] = 'INSUFFICIENT_DATA'
        with self.assertRaises(ValueError):
            forecast.validate_review(self.review, self.features)
        self.review['missingInformation'] = ['Storage costs and shelf life']
        review, advisory = forecast.validate_review(self.review, self.features)
        self.assertEqual(review['status'], 'INSUFFICIENT_DATA')
        self.assertIsNone(advisory)

    def test_holding_requires_costs_and_shelf_life(self):
        self.review['advisory']['recommendation'] = 'HOLD'
        review, advisory = forecast.validate_review(self.review, self.features, {})
        self.assertEqual(review['status'], 'INSUFFICIENT_DATA')
        self.assertIsNone(advisory)

    def test_contradictory_signals_cannot_pass_review(self):
        self.review['featureChecks'][0]['assessment'] = 'CONTRADICTS'
        review, advisory = forecast.validate_review(self.review, self.features)
        self.assertEqual(review['status'], 'CONCERNS')
        self.assertIsNone(advisory)

    def test_invalid_condition_types(self):
        for conditions in ({'shelfLifeDays': -1}, {'storageCostPerUnit': True}, {'notes': {}}):
            self.assertEqual(forecast.process_request({'features': self.features, 'conditions': conditions})[0], 400)

    def test_ui_schema_matches_artifacts(self):
        schema = json.loads((forecast.MODEL_DIR.parent / 'src/services/market/mandiFeatureSchema.json').read_text())
        _, _, mappings, columns = forecast.load_artifacts()
        self.assertEqual(schema['features'], columns)
        self.assertEqual(schema['categories'], mappings)

    def test_holding_beyond_shelf_life_is_withheld(self):
        self.review['advisory']['recommendation'] = 'HOLD'
        conditions = {'shelfLifeDays': 2, 'holdingPeriodDays': 7,
                      'storageCostPerUnit': 1, 'transportCostPerUnit': 1, 'priceUnit': 'INR/kg'}
        review, advisory = forecast.validate_review(self.review, self.features, conditions)
        self.assertEqual(review['status'], 'CONCERNS')
        self.assertIsNone(advisory)


if __name__ == '__main__':
    unittest.main()
