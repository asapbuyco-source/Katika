
export type ViewState = 'landing' | 'auth' | 'dashboard' | 'lobby' | 'matchmaking' | 'game' | 'profile' | 'finance' | 'how-it-works';

export interface User {
  id: string;
  name: string;
  balance: number; // In FCFA
  avatar: string;
  elo: number;
  rankTier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
}

export interface PlayerProfile {
  name: string;
  elo: number;
  avatar: string;
  rankTier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'winnings' | 'stake';
  amount: number;
  date: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface GameTier {
  id: string;
  name: string;
  stake: number;
  potentialWin: number;
  playersOnline: number;
  speed: 'Instant' | 'Fast' | 'Normal';
  minElo: number;
}

export interface Table {
  id: string;
  gameType: 'Ludo' | 'Dice' | 'Chess' | 'Checkers';
  stake: number; // FCFA
  players: number;
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'active';
  host?: PlayerProfile; // The player waiting at the table
  minElo?: number;      // Minimum ELO required to join
}

export interface GameEvent {
  id: string;
  type: 'move' | 'roll' | 'chat' | 'system';
  message: string;
  timestamp: number;
  data?: any;
}

export interface AIRefereeLog {
  id: string;
  message: string;
  status: 'scanning' | 'alert' | 'secure';
  timestamp: number;
}
