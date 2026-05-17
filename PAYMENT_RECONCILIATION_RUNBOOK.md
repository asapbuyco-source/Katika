# Payment Reconciliation Runbook — Katika

**Purpose:** Guide for reconciling financial discrepancies, recovering stuck withdrawals, and investigating payment failures.  
**Date:** 2026-05-15  

---

## Reconciliation Intervals

| Process | Frequency | Location |
|---------|-----------|---------|
| Pending withdrawal auto-refund | Every 10 min | `runPendingWithdrawalReconciliation` (server.js) |
| Orphan escrow recovery | Every 10 min | Orphan room reaper (server.js:1899) |
| Server-startup escrow check | Once on startup | `reconcileOrphanedEscrows` (server.js:3868) |
| Dispute SLA auto-resolution | Every 5 min | `runDisputeSLAResolver` (server.js:1799) |

---

## Manual Reconciliation Steps

### 1. Stuck Pending Withdrawals

**Symptoms:** Users report missing payouts; `transactions` collection has entries with `type=withdrawal, status=pending` older than 5 minutes.

**Manual fix:**
```javascript
// Run in server.js context or via Firebase Admin SDK
const pending = await db.collectionGroup('transactions')
    .where('type', '==', 'withdrawal')
    .where('status', '==', 'pending')
    .get();

for (const doc of pending.docs) {
    const userRef = doc.ref.parent.parent;
    const amount = Math.abs(doc.data().amount || 0);
    await db.runTransaction(async (tx) => {
        const user = await tx.get(userRef);
        if (user.exists) {
            tx.update(userRef, { balance: (user.data().balance || 0) + amount });
            tx.update(doc.ref, { status: 'failed', error: 'manual_reconcile' });
            tx.set(userRef.collection('transactions').doc(), {
                type: 'escrow_refund', amount, status: 'completed',
                date: new Date().toISOString(), note: 'Manual reconcile: stuck withdrawal'
            });
        }
    });
}
```

### 2. Double-Credited Deposits

**Symptoms:** User balance inflated; `processed_payments` has duplicate `transId` entries.

**Fix:** `processed_payments` is the idempotency sentinel. Each payment is credited at most once. If the sentinel was bypassed, manually audit:
```javascript
// Find all duplicate transIds in processed_payments
const payments = await db.collection('processed_payments').get();
const transIds = new Map();
payments.forEach(doc => {
    const transId = doc.id;
    if (transIds.has(transId)) {
        console.warn(`DUPLICATE: ${transId}`);
    }
    transIds.set(transId, true);
});
```

### 3. Failed Settlement Recovery

**Collection:** `failed_settlements` (server.js:1860)

Check for entries:
```javascript
const failures = await db.collection('failed_settlements').get();
failures.forEach(doc => {
    const data = doc.data();
    console.log(`Type: ${data.type}, Amount: ${data.amount}, Error: ${data.error}`);
    // Manually credit balance based on type
    if (data.type === 'withdrawal_auto_refund') {
        // Already refunded by reconciliation — verify user balance
    } else if (data.type === 'withdrawal_refund') {
        // Refund was attempted but failed — manually credit
    }
});
```

---

## Daily Close Checklist

1. Query `processed_payments` count vs `deposits` transactions — should match
2. Query `processed_settlements` count — each non-zero stake game should have exactly one
3. Check `failed_settlements` collection — zero unexplained entries
4. Verify sum of all `balance` + sum of all `promoBalance` in `users` equals expected ledger
5. Cross-check Fapshi dashboard totals vs Katika internal totals

---

## Alert Triggers

| Alert | Action |
|-------|--------|
| `failed_settlements` > 5 entries in 1 hour | Investigate immediately; check Fapshi API status |
| `reconcileOrphanedEscrows` refunds > 10 in one run | Possible server crash loop causing repeated orphaned escrows |
| Withdrawal auto-refunds > 3 in one run | Investigate Fapshi payout timeout frequency |
| Webhook verification fails > 5 times | Check Fapshi API credentials; possible IP block |

---

## Rollback Procedures

| Scenario | Rollback |
|----------|----------|
| Reconciliation causing double-refunds | Comment out `setInterval(runPendingWithdrawalReconciliation, ...)` |
| Webhook crediting incorrectly | Disable webhook route: `// app.post('/api/pay/webhook', ...)` |
| Start accepting deposits only | Disable `/api/pay/disburse` withdrawal endpoint |
| Full freeze | Set `MAINTENANCE_MODE=true` via admin dashboard |