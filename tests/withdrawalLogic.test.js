import { describe, expect, it } from 'vitest';
import { validateWithdrawalRequest } from '../server/withdrawalLogic.js';

describe('Withdrawal validation', () => {
    const validBody = { amount: 1000, phone: '670 000 000', momoName: 'Test User', userId: 'user_1' };

    it('accepts a valid Cameroon mobile-money withdrawal request', () => {
        expect(validateWithdrawalRequest(validBody, 'user_1')).toEqual({
            valid: true,
            amount: 1000,
            cleanPhone: '670000000',
            cleanMomoName: 'Test User',
            userId: 'user_1'
        });
    });

    it('requires the Mobile Money account name', () => {
        expect(validateWithdrawalRequest({ ...validBody, momoName: '' }, 'user_1')).toMatchObject({
            valid: false,
            status: 400,
            error: 'Enter the Mobile Money account name for this number.'
        });
    });

    it('rejects invalid amounts before touching payment rails', () => {
        expect(validateWithdrawalRequest({ ...validBody, amount: 999 }, 'user_1')).toMatchObject({
            valid: false,
            status: 400,
            error: 'Minimum withdrawal is 1,000 FCFA.'
        });
        expect(validateWithdrawalRequest({ ...validBody, amount: 500_001 }, 'user_1')).toMatchObject({
            valid: false,
            status: 400,
            error: 'Maximum withdrawal is 500,000 FCFA per transaction.'
        });
        expect(validateWithdrawalRequest({ ...validBody, amount: 1000.5 }, 'user_1')).toMatchObject({
            valid: false,
            status: 400,
            error: 'Invalid amount.'
        });
    });

    it('rejects invalid Cameroon phone numbers', () => {
        expect(validateWithdrawalRequest({ ...validBody, phone: '237670000000' }, 'user_1')).toMatchObject({
            valid: false,
            status: 400
        });
        expect(validateWithdrawalRequest({ ...validBody, phone: '550000000' }, 'user_1')).toMatchObject({
            valid: false,
            status: 400
        });
    });

    it('rejects withdrawing from another user account', () => {
        expect(validateWithdrawalRequest(validBody, 'attacker')).toEqual({
            valid: false,
            status: 403,
            error: 'Forbidden: Cannot withdraw from another user'
        });
    });
});
