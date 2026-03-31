
export type ViewState = 'landing' | 'auth' | 'dashboard' | 'lobby' | 'matchmaking' | 'game' | 'profile' | 'finance' | 'how-it-works' | 'admin' | 'help-center' | 'report-bug' | 'terms' | 'privacy' | 'forum' | 'settings' | 'tournaments';

/** Map of userId -> PlayerProfile as sent by the server in socket payloads */
export type PlayerProfileMap = Record<string, PlayerProfile>;

/** A chat message sent over the socket */
export interface GameChatMessage {
  id: string;
  senderId: string;
  message: string;
  timestamp: number;
}

/** The full game state object sent from the server over socket.io */
export interface SocketGameState {
  id?: string;
  roomId: string;
  players: string[];
  gameType: string;
  stake: number;
  turn: string;
  status?: 'active' | 'completed' | 'draw';
  winner?: string;
  gameState: Record<string, unknown>;
  profiles: PlayerProfileMap;
  chat?: GameChatMessage[];
  /** Set when this is a tournament match room */
  tournamentMatchId?: string;
  /** Legacy alias — may be populated instead of tournamentMatchId */
  privateRoomId?: string;
}

/** Union type for all game action payloads sent from client to server */
export type GameAction =
  | { type: 'FORFEIT' }
  | { type: 'CHAT'; message: string }
  | { type: 'TIMEOUT_CLAIM' }
  | { type: 'REMATCH_REQUEST' }
  | { type: 'REMATCH_DECLINE' }
  | { type: 'ROLL' }
  | { type: 'MOVE'; index?: number; newState?: Record<string, unknown> }
  | { type: 'DRAW_ROUND' }
  | { type: 'MOVE_PIECE'; pieces: unknown[]; bonusTurn?: boolean }
  | { type: 'PLAY'; card: { id: string; suit: string; rank: string }; suit: string }
  | { type: 'DRAW'; passTurn?: boolean };


export type ProfileTab = 'overview' | 'history' | 'settings';

export interface User {
  id: string;
  name: string;
  balance: number; // In FCFA
  avatar: string;
  elo: number;
  rankTier: 'Bronze' | 'Silver' | 'Gold' | 'Diamond';
  isAdmin?: boolean;
  isBanned?: boolean;
  hasSeenOnboarding?: boolean;
  referredBy?: string;
  referralBonusPaid?: boolean;
  promoBalance?: number;
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
  type: 'deposit' | 'withdrawal' | 'winnings' | 'stake' | 'stake_loss' | 'tournament_entry';
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
  gameType: 'Ludo' | 'Dice' | 'Chess' | 'Checkers' | 'TicTacToe' | 'Cards' | 'Pool';
  stake: number; // FCFA
  players: number;
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'active';
  host?: PlayerProfile; // The player waiting at the table
  minElo?: number;      // Minimum ELO required to join
  guest?: PlayerProfile; // The second player
  tournamentMatchId?: string; // Links to tournament logic
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

export interface BugReport {
  id: string;
  userId: string;
  userName: string;
  severity: 'low' | 'medium' | 'critical';
  description: string;
  reproduceSteps?: string;
  status: 'open' | 'resolved';
  timestamp: any;
}

export interface Tournament {
  id: string;
  name: string;
  gameType: string;
  entryFee: number;
  prizePool: number;
  type: 'fixed' | 'dynamic'; // New field: Fixed = House Funded, Dynamic = User Funded
  startTime: string; // ISO String
  maxPlayers: number;
  participants: string[]; // User IDs
  status: 'registration' | 'active' | 'completed';
  winnerId?: string;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number; // 1 = Round of 16, 2 = QF, etc.
  matchIndex: number; // Position in the bracket (vertical)
  player1?: PlayerProfile;
  player2?: PlayerProfile;
  winnerId?: string;
  status: 'scheduled' | 'active' | 'completed';
  startTime: string;
  checkedIn?: string[]; // Player IDs who clicked "Enter Match Lobby" — used for forfeit resolution
}