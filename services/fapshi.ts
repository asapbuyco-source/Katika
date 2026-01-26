
import { User } from '../types';

// API Keys are now strictly on the server (server.js)
// This service only calls the internal backend endpoint.

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:8080";

export interface PaymentResponse {
    link: string;
    transId: string;
}

export const initiateFapshiPayment = async (amount: number, user: User): Promise<PaymentResponse | null> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/payment/initiate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                email: user.id.includes('@') ? user.id : `${user.id}@vantage.cm`,
                userId: user.id,
                redirectUrl: window.location.href
            })
        });

        if (!response.ok) {
            throw new Error(`Payment Initiation Failed: ${response.statusText}`);
        }

        const data = await response.json();
        return {
            link: data.link,
            transId: data.transId
        };
    } catch (error) {
        console.error("Payment Error:", error);
        return null;
    }
};
