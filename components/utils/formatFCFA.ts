export const formatFCFA = (amount: number): string => {
    return new Intl.NumberFormat('fr-CM', {
        style: 'currency',
        currency: 'XAF',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(Math.floor(amount)).replace('FCFA', 'FCFA').trim();
};
