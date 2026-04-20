/**
 * setAdminClaim.mjs
 * -----------------
 * Run this ONCE per admin account to grant the Firebase custom claim
 * that the verifyAdmin middleware now checks (decoded.admin === true).
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='<json-string-or-path>' node scripts/setAdminClaim.mjs <UID>
 *
 * Example:
 *   node scripts/setAdminClaim.mjs aBC123xyzUid
 *
 * After running, the user must sign out and sign back in (or wait up to 1 hour)
 * for the new claim to appear in their ID token.
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

const uid = process.argv[2];
if (!uid) {
    console.error('Usage: node scripts/setAdminClaim.mjs <FIREBASE_UID>');
    process.exit(1);
}

// --- Firebase Admin Initialization ---
const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountStr) {
    console.error('ERROR: FIREBASE_SERVICE_ACCOUNT environment variable not set.');
    console.error('Set it to the contents of your serviceAccountKey.json, or a path to the file.');
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(serviceAccountStr);
} catch {
    // If it's not JSON, try treating it as a file path
    try {
        serviceAccount = JSON.parse(readFileSync(path.resolve(serviceAccountStr), 'utf8'));
    } catch (e) {
        console.error('ERROR: Could not parse FIREBASE_SERVICE_ACCOUNT as JSON or file path:', e.message);
        process.exit(1);
    }
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// --- Set the custom claim ---
try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    const user = await admin.auth().getUser(uid);
    console.log(`✅ Admin claim set successfully for user: ${user.email || uid}`);
    console.log('   The user must sign out and re-authenticate for the claim to take effect in their ID token.');
} catch (err) {
    console.error('❌ Failed to set admin claim:', err.message);
    process.exit(1);
}

process.exit(0);
