export const validateWithdrawalRequest = (body, authenticatedUserId) => {
    const { amount, phone, userId, momoName } = body || {};

    if (!amount || typeof amount !== 'number' || !Number.isInteger(amount)) {
        return { valid: false, status: 400, error: 'Invalid amount.' };
    }
    if (amount <= 0) {
        return { valid: false, status: 400, error: 'Amount must be positive.' };
    }
    if (amount < 1000) {
        return { valid: false, status: 400, error: 'Minimum withdrawal is 1,000 FCFA.' };
    }
    if (amount > 500_000) {
        return { valid: false, status: 400, error: 'Maximum withdrawal is 500,000 FCFA per transaction.' };
    }

    const cleanPhone = typeof phone === 'string' ? phone.replace(/\s/g, '') : '';
    if (!cleanPhone || !/^6\d{8}$/.test(cleanPhone)) {
        return { valid: false, status: 400, error: 'Invalid Cameroon phone number (must start with 6, 9 digits total).' };
    }
    const cleanMomoName = typeof momoName === 'string' ? momoName.trim().replace(/\s+/g, ' ') : '';
    if (cleanMomoName.length < 2 || cleanMomoName.length > 80) {
        return { valid: false, status: 400, error: 'Enter the Mobile Money account name for this number.' };
    }
    if (!userId || typeof userId !== 'string') {
        return { valid: false, status: 400, error: 'Invalid userId.' };
    }
    if (authenticatedUserId !== userId) {
        return { valid: false, status: 403, error: 'Forbidden: Cannot withdraw from another user' };
    }

    return { valid: true, amount, cleanPhone, cleanMomoName, userId };
};
