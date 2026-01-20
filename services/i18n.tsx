import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'fr';

const translations = {
  en: {
    // General
    back: "Back",
    loading: "Loading...",
    // Landing
    landing_title_1: "Play Skill.",
    landing_title_2: "Win Cash.",
    landing_subtitle: "The premium P2P gaming platform for Cameroon. Secure Escrow, AI Referee, and instant Mobile Money withdrawals.",
    connect_wallet: "Connect Wallet",
    how_it_works: "How it Works",
    live_payouts: "Live Payouts",
    won: "won",
    in: "in",
    // Auth
    welcome_back: "Welcome Back",
    secure_access: "Secure Access Portal",
    continue_google: "Continue with Google",
    or_email: "Or use email",
    email_pass: "Email & Password",
    guest_mode: "Continue as Guest (Dev Mode)",
    sign_in: "Sign In",
    create_account: "Create Account",
    email_label: "Email Address",
    pass_label: "Password",
    processing: "Processing...",
    connecting: "Connecting...",
    terms_agree: "By connecting, you agree to Vantage Gaming's",
    terms: "Terms of Service",
    // Navigation
    nav_home: "Home",
    nav_lobby: "Lobby",
    nav_forum: "Forum",
    nav_wallet: "Wallet",
    nav_profile: "Profile",
    nav_admin: "Admin",
    // Dashboard
    hello: "Bonjour",
    welcome_arena: "Welcome back to the arena",
    live_wins: "Live Wins",
    deposit_funds: "DEPOSIT FUNDS",
    trending_games: "Trending Games",
    view_lobby: "View Lobby",
    play_now: "Play Now",
    recent_activity: "Recent Activity",
    view_all: "View All",
    balance_label: "Available Balance",
    vantage_vault: "Vantage Secure Vault",
    referral_code: "Referral Code",
    share_earn: "Share to earn",
    per_friend: "per friend",
    // Lobby
    game_selection: "Game Selection",
    select_stake: "Select Stake",
    choose_arena: "Choose your arena and prove your skill.",
    select_entry: "Select your entry stake level.",
    challenge_friend: "Challenge Friend",
    practice_ai: "Practice vs AI",
    online: "Online",
    entry_stake: "Entry Stake",
    potential_win: "Potential Win",
    matchmaking: "Matchmaking",
    cancel_matchmaking: "Cancel Matchmaking",
    searching: "Searching Global Pool...",
    match_secured: "MATCH SECURED",
    escrow_locked: "ESCROW LOCKED",
    // Profile
    edit_profile: "Edit Profile",
    save: "Save",
    cancel: "Cancel",
    total_games: "Total Games",
    win_rate: "Win Rate",
    current_streak: "Current Streak",
    total_earnings: "Total Earnings",
    performance_analytics: "Performance Analytics",
    security_access: "Security & Access",
    app_preferences: "App Preferences",
    language: "Language / Langue",
    sound_effects: "Sound Effects",
    notifications: "Notifications",
    marketing_emails: "Marketing Emails",
    support: "Support",
    help_center: "Help Center",
    report_bug: "Report a Bug",
    // Finance
    manage_funds: "Manage your funds securely with Mobile Money.",
    deposit: "Deposit",
    withdraw: "Withdraw",
    history: "History",
    payment_initiated: "Payment Initiated",
    open_payment: "Open Payment Page",
    cancel_pay: "Cancel",
    withdraw_funds: "Withdraw Funds",
    amount: "Amount",
    send_to: "Send To (Phone)",
    proceed_payment: "Proceed to Payment",
    withdraw_cash: "Withdraw Cash",
    recent_transactions: "Recent Transactions",
    quick_stats: "Quick Stats",
    total_deposited: "Total Deposited",
    total_withdrawn: "Total Withdrawn",
    net_profit: "Net Profit",
    need_help: "Need Help?",
    contact_support: "Contact Support",
    transaction_type: "Transaction Type",
    date_time: "Date & Time",
    status: "Status",
  },
  fr: {
    // General
    back: "Retour",
    loading: "Chargement...",
    // Landing
    landing_title_1: "Jouez Habile.",
    landing_title_2: "Gagnez Cash.",
    landing_subtitle: "La plateforme de jeu P2P premium pour le Cameroun. Escrow sécurisé, arbitre IA et retraits Mobile Money instantanés.",
    connect_wallet: "Connexion",
    how_it_works: "Comment ça marche",
    live_payouts: "Gains en direct",
    won: "a gagné",
    in: "à",
    // Auth
    welcome_back: "Bon retour",
    secure_access: "Portail d'accès sécurisé",
    continue_google: "Continuer avec Google",
    or_email: "Ou utiliser l'email",
    email_pass: "Email & Mot de passe",
    guest_mode: "Continuer en invité (Dev)",
    sign_in: "Se connecter",
    create_account: "Créer un compte",
    email_label: "Adresse Email",
    pass_label: "Mot de passe",
    processing: "Traitement...",
    connecting: "Connexion...",
    terms_agree: "En vous connectant, vous acceptez les",
    terms: "Conditions d'utilisation",
    // Navigation
    nav_home: "Accueil",
    nav_lobby: "Salon",
    nav_forum: "Forum",
    nav_wallet: "Portefeuille",
    nav_profile: "Profil",
    nav_admin: "Admin",
    // Dashboard
    hello: "Bonjour",
    welcome_arena: "Bienvenue dans l'arène",
    live_wins: "Gains Direct",
    deposit_funds: "DÉPOSER FONDS",
    trending_games: "Jeux Populaires",
    view_lobby: "Voir le Salon",
    play_now: "Jouer",
    recent_activity: "Activité Récente",
    view_all: "Voir Tout",
    balance_label: "Solde Disponible",
    vantage_vault: "Coffre-fort Vantage",
    referral_code: "Code de Parrainage",
    share_earn: "Partagez pour gagner",
    per_friend: "par ami",
    // Lobby
    game_selection: "Sélection du Jeu",
    select_stake: "Mise d'entrée",
    choose_arena: "Choisissez votre arène et prouvez votre talent.",
    select_entry: "Sélectionnez votre niveau de mise.",
    challenge_friend: "Défier un Ami",
    practice_ai: "Entraînement vs IA",
    online: "En ligne",
    entry_stake: "Mise d'entrée",
    potential_win: "Gain Potentiel",
    matchmaking: "Recherche de partie",
    cancel_matchmaking: "Annuler",
    searching: "Recherche d'adversaires...",
    match_secured: "MATCH TROUVÉ",
    escrow_locked: "FOND BLOQUÉ",
    // Profile
    edit_profile: "Modifier Profil",
    save: "Enregistrer",
    cancel: "Annuler",
    total_games: "Total Jeux",
    win_rate: "Victoires",
    current_streak: "Série",
    total_earnings: "Gains Totaux",
    performance_analytics: "Analytique",
    security_access: "Sécurité & Accès",
    app_preferences: "Préférences",
    language: "Langue / Language",
    sound_effects: "Effets Sonores",
    notifications: "Notifications",
    marketing_emails: "Emails Marketing",
    support: "Support",
    help_center: "Centre d'aide",
    report_bug: "Signaler un bug",
    // Finance
    manage_funds: "Gérez vos fonds en toute sécurité avec Mobile Money.",
    deposit: "Dépôt",
    withdraw: "Retrait",
    history: "Historique",
    payment_initiated: "Paiement Initié",
    open_payment: "Ouvrir Paiement",
    cancel_pay: "Annuler",
    withdraw_funds: "Retirer Fonds",
    amount: "Montant",
    send_to: "Envoyer à (Tél)",
    proceed_payment: "Procéder au Paiement",
    withdraw_cash: "Retirer Cash",
    recent_transactions: "Transactions Récentes",
    quick_stats: "Stats Rapides",
    total_deposited: "Total Déposé",
    total_withdrawn: "Total Retiré",
    net_profit: "Profit Net",
    need_help: "Besoin d'aide ?",
    contact_support: "Contacter Support",
    transaction_type: "Type Transaction",
    date_time: "Date & Heure",
    status: "Statut",
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    // 1. Check Local Storage
    const savedLang = localStorage.getItem('vantage_lang');
    if (savedLang === 'fr' || savedLang === 'en') {
        setLanguage(savedLang);
        return;
    }

    // 2. Auto-detect browser language
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'fr') {
        setLanguage('fr');
    }
  }, []);

  const changeLanguage = (lang: Language) => {
      setLanguage(lang);
      localStorage.setItem('vantage_lang', lang);
  };

  const t = (key: keyof typeof translations['en']) => {
    return translations[language][key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};