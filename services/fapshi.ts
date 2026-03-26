
import { User } from '../types';
import { auth } from './firebase';

// All Fapshi calls go through the server-side proxy so API keys never reach the browser.
// The proxy lives at /api/pay/* on the same backend as the Socket.IO server.
const PROXY_BASE = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '');

export interface PaymentResponse {
    link: string;
    transId: string;
}

export const initiateFapshiPayment = async (amount: number, user: User): Promise<PaymentResponse | null> => {
    try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${PROXY_BASE}/api/pay/initiate`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                amount,
                userId: user.id,
                redirectUrl: window.location.href
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Fapshi proxy error:', errorText);
            return null;
        }

        const data = await response.json();
        return { link: data.link, transId: data.transId };
    } catch (error) {
        console.error('Payment initiation failed:', error);
        return null;
    }
};

export const checkPaymentStatus = async (transId: string): Promise<'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'EXPIRED' | null> => {
    try {
        const response = await fetch(`${PROXY_BASE}/api/pay/status/${transId}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.status;
    } catch (error) {
        console.error('Status check failed', error);
        return null;
    }
};
