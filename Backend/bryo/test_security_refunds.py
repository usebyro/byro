"""Refunds: an existing refund is found by Paystack's numeric transaction id, so a retry adopts it instead of failing."""
from unittest.mock import patch

from django.test import SimpleTestCase

from .refunds import find_paystack_refund


def fake_paystack(refunds_by_transaction, txn_id=4242):
    """Behaves like the real Paystack: the refund list only answers to a numeric transaction id."""
    calls = []

    def call(method, path, **kw):
        calls.append((method, path, kw.get('params')))
        if path.startswith('/transaction/verify/'):
            return 200, {'status': True, 'data': {'id': txn_id, 'status': 'success'}}
        if path == '/refund':
            wanted = (kw.get('params') or {}).get('transaction')
            return 200, {'status': True, 'data': refunds_by_transaction.get(wanted, [])}
        raise AssertionError(path)
    call.calls = calls
    return call


class FindRefundTests(SimpleTestCase):
    def test_an_existing_refund_is_found_by_the_transaction_id(self):
        paystack = fake_paystack({4242: [{'id': 77, 'status': 'pending'}]})
        with patch('bryo.refunds._paystack', side_effect=paystack):
            found = find_paystack_refund('MRC-abc')
        self.assertEqual(found['id'], 77)
        self.assertIn(('GET', '/refund', {'transaction': 4242}), paystack.calls)

    def test_a_failed_refund_is_not_adopted(self):
        paystack = fake_paystack({4242: [{'id': 77, 'status': 'failed'}]})
        with patch('bryo.refunds._paystack', side_effect=paystack):
            self.assertIsNone(find_paystack_refund('MRC-abc'))

    def test_no_refund_means_none(self):
        with patch('bryo.refunds._paystack', side_effect=fake_paystack({})):
            self.assertIsNone(find_paystack_refund('MRC-abc'))

    def test_it_still_looks_by_reference_when_the_transaction_cannot_be_resolved(self):
        calls = []

        def call(method, path, **kw):
            calls.append((path, kw.get('params')))
            if path.startswith('/transaction/verify/'):
                return 404, {'status': False, 'message': 'Transaction reference not found'}
            return 200, {'status': True, 'data': [{'id': 5, 'status': 'processed'}]}
        with patch('bryo.refunds._paystack', side_effect=call):
            found = find_paystack_refund('EVT-old')
        self.assertEqual(found['id'], 5)
        self.assertEqual(calls[-1], ('/refund', {'reference': 'EVT-old'}))
