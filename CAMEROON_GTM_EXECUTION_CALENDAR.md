# Cameroon GTM Execution Calendar — Katika Chess + Checkers Launch

**Objective:** Drive user acquisition, deposit conversion, and platform trust in Cameroon (Douala + Yaoundé) over 30 days.  
**Date:** 2026-05-15  

---

## Phase 1: Private Beta (Days 1-7)

### Target: 100–300 users

**Week 1 Goals:**
- Test payment flows (Fapshi MTN/Orange Mtn Money)
- Verify withdrawal reliability end-to-end
- Stress-test Chess + Checkers matchmaking
- Collect user feedback on UX

**Channel Actions:**

| Channel | Action | Owner | Status |
|---------|--------|-------|--------|
| WhatsApp Community | Invite 100 early adopters from existing user base | Ops | Pending |
| Campus Reps (Douala/Yaoundé) | Brief 10 campus ambassadors; give them referral codes | BD | Pending |
| Bug Reports | Enable in-app bug reporting; monitor `bug_reports` Firestore | Tech | Pending |

**Success Metrics:**
- Deposit conversion rate > 30% among beta users
- Withdrawal success rate > 95% within 24h
- Avg session duration > 8 minutes
- Chess + Checkers games started: 500+

---

## Phase 2: Soft Launch (Days 8-14)

### Target: 500–1,000 users

**Week 2 Goals:**
- Open to general public in Douala + Yaoundé
- Weekly Championship announced (Saturday Cup)
- Referral v1 activated

**Channel Actions:**

| Channel | Action | Owner | Status |
|---------|--------|-------|--------|
| WhatsApp Community | Share payout SLA page link; testimonials | Ops | Pending |
| Micro-creators (Douala) | Partner with 5 influencers (performance rev-share) | BD | Pending |
| Cybercafé Partners | Install PWA on 20 cybercafé machines | BD | Pending |
| Campus Ambassadors | Live demo sessions at 3 campuses | BD | Pending |
| Referral | Activate: referrer gets 100 FCFA promo when referee completes first settled match | Tech | Pending |

**Success Metrics:**
- New sign-ups: 400+
- First deposits: 200+
- Referral bonuses paid: 50+
- Weekly Cup participation: 100+

---

## Phase 3: Public Launch (Days 15-21)

### Target: 2,000–5,000 users

**Week 3 Goals:**
- Public announcement (social media, WhatsApp)
- Referral campaign amplified
- First weekly championship payout

**Channel Actions:**

| Channel | Action | Owner | Status |
|---------|--------|-------|--------|
| Facebook/Instagram | Launch ads targeting Cameroon gamers 18-35 | Marketing | Pending |
| WhatsApp Broadcasts | Weekly updates: "This week: 1,200 games played, 500,000 FCFA paid out" | Ops | Pending |
| Trust Marketing | Publish payout SLA page (katika.cm/payout-sla) | Marketing | Pending |
| Testimonials | Collect 5 verified user testimonials with consent | Ops | Pending |
| Channel Cleanup | Track CAC → deposit conversion per channel; prune low performers | BD | Pending |

**Success Metrics:**
- Total users: 2,000+
- Active daily users: 500+
- Total deposits: 1,000,000+ FCFA
- Total withdrawals: 800,000+ FCFA
- Payout latency p50 < 30 min, p95 < 2h

---

## Phase 4: Optimization (Days 22-30)

### Target: Retention + revenue efficiency

**Week 4 Goals:**
- Identify and kill low-performing acquisition channels
- Optimize stake tiers based on deposit distribution
- Launch leaderboards (P2-1)

**Channel Actions:**

| Channel | Action | Owner | Status |
|---------|--------|-------|--------|
| Data Analysis | CAC per channel (Facebook vs WhatsApp vs Campus) | BD | Pending |
| Stake Tier Adjustment | Review avg stake per game; adjust GAME_TIERS | Tech | Pending |
| Leaderboard | Build Chess + Checkers weekly ladder | Tech | Pending |
| Retention | D1/D7/D30 cohort analysis | Analytics | Pending |

**Success Metrics:**
- D7 depositor retention > 40%
- CAC < 500 FCFA per depositing user
- Dispute rate < 1 per 1,000 matches

---

## Channel Performance Framework

| Metric | Facebook | WhatsApp | Campus | Referral | Organic |
|--------|----------|----------|--------|----------|---------|
| Spend (FCFA) | Track | 0 | 0 | Rev-share | 0 |
| Sign-ups | Count | Count | Count | Count | Count |
| Depositors | Count | Count | Count | Count | Count |
| CAC | Spend/Signups | N/A | N/A | Rev-share/Depositors | N/A |
| Depositor conversion | Depositors/Signups | - | - | - | - |

**Pruning rule:** If CAC > 2x average and conversion < 50% of average, cut channel.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Fapshi payment failures spike | Keep reconciliation running; manual ops queue |
| Fraud spike (cheaters) | Behavioral anomaly detection already in server.js (P0-5) |
| Dispute volume > ops capacity | 30-min SLA auto-resolution; dispute UI in app |
| User churn due to slow payouts | Real-time payout status in Finance screen |
| Cybercafé partner fraud | KYC verification for partner accounts |