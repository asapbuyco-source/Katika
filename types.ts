
export type ViewState = 'landing' | 'auth' | 'dashboard' | 'lobby' | 'matchmaking' | 'game' | 'profile' | 'finance' | 'how-it-works' | 'admin' | 'help-center' | 'report-bug' | 'terms' | 'privacy' | 'forum' | 'settings';

export interface User {
  id: string;
  name: string;
  balance: number; // In FCFA
  avatar: string;
  elo: number;
  rankTier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
  isAdmin?: boolean;
}

export interface PlayerProfile {
  id?: string;
  name: string;
  elo: number;
  avatar: string;
  rankTier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
}

export interface Challenge {
  id: string;
  sender: PlayerProfile;
  targetId?: string; // ID of the player being challenged
  gameType: string;
  stake: number;
  timestamp: number;
  status?: 'pending' | 'accepted' | 'declined';
  gameId?: string; // The game created if accepted
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
  gameType: 'Ludo' | 'Dice' | 'Chess' | 'Checkers' | 'TicTacToe' | 'Cards';
  stake: number; // FCFA
  players: number;
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'active';
  host?: PlayerProfile; // The player waiting at the table
  minElo?: number;      // Minimum ELO required to join
  guest?: PlayerProfile; // The second player
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

export interface ForumPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userRank: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
  content: string;
  timestamp: any; // Firestore timestamp
  likes: number;
}