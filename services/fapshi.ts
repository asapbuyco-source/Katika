
import { User } from '../types';

const FAPSHI_API_KEY = import.meta.env.VITE_FAPSHI_API_KEY;
const FAPSHI_USER_TOKEN = import.meta.env.VITE_FAPSHI_USER_TOKEN;
const BASE_URL = import.meta.env.VITE_FAPSHI_BASE_URL;

export interface PaymentResponse {
    link: string;
    transId: string;
}

export const initiateFapshiPayment = async (amount: number, user: User): Promise<PaymentResponse | null> => {
    try {
        const response = await fetch(`${BASE_URL}/initiate-pay`, {
            method: 'POST',
            headers: {
                'apiuser': FAPSHI_USER_TOKEN,
                'apikey': FAPSHI_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                email: user.id.includes('@') ? user.id : 'guest@vantageludo.cm',
                userId: user.id,
                redirectUrl: window.location.href // Works dynamically on any domain
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Fapshi API Error:", errorText);
            throw new Error(`Fapshi API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return {
            link: data.link,
            transId: data.transId
        };
    } catch (error) {
        console.error("Fapshi Payment Initiation failed:", error);
        return null;
    }
};

export const checkPaymentStatus = async (transId: string): Promise<'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'EXPIRED' | null> => {
    try {
        const response = await fetch(`${BASE_URL}/payment-status/${transId}`, {
            method: 'GET',
            headers: {
                'apiuser': FAPSHI_USER_TOKEN,
                'apikey': FAPSHI_API_KEY
            }
        });

        if (!response.ok) return null;
        const data = await response.json();
        return data.status;
    } catch (error) {
        console.error("Status check failed", error);
        return null;
    }
};
