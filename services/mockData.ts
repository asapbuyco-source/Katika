

import { Table, User, PlayerProfile, Transaction, GameTier } from '../types';

export const CURRENT_USER: User = {
  id: 'u1',
  name: 'Amara',
  balance: 12500,
  avatar: 'https://i.pravatar.cc/150?u=Amara',
  elo: 1250,
  rankTier: 'Silver',
};

export const BOT_PROFILE: PlayerProfile = {
  name: 'V-Bot 2.0',
  elo: 1000,
  avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=vantage',
  rankTier: 'Bronze',
};

export const GAME_TIERS: GameTier[] = [
  { id: 'tier-1', name: 'Starter', stake: 100, potentialWin: 180, playersOnline: 842, speed: 'Instant', minElo: 0 },
  { id: 'tier-2', name: 'Casual', stake: 500, potentialWin: 900, playersOnline: 420, speed: 'Instant', minElo: 0 },
  { id: 'tier-3', name: 'Pro', stake: 2000, potentialWin: 3600, playersOnline: 156, speed: 'Fast', minElo: 1000 },
  { id: 'tier-4', name: 'High Roller', stake: 5000, potentialWin: 9000, playersOnline: 45, speed: 'Normal', minElo: 1500 },
];

export const MOCK_TABLES: Table[] = [
  { 
    id: 't1', 
    gameType: 'Ludo', 
    stake: 500, 
    players: 1, 
    maxPlayers: 2, 
    status: 'waiting',
    minElo: 1000,
    host: { name: 'Franck', elo: 1150, avatar: 'https://i.pravatar.cc/150?u=Franck', rankTier: 'Silver' }
  },
];

export const MOCK_PLAYERS: PlayerProfile[] = [
    { name: 'Blaise', elo: 1450, avatar: 'https://i.pravatar.cc/150?u=Blaise', rankTier: 'Gold' },
    { name: 'Chantal', elo: 980, avatar: 'https://i.pravatar.cc/150?u=Chantal', rankTier: 'Bronze' },
    { name: 'Emmanuel', elo: 1800, avatar: 'https://i.pravatar.cc/150?u=Emmanuel', rankTier: 'Diamond' },
    { name: 'Odile', elo: 1250, avatar: 'https://i.pravatar.cc/150?u=Odile', rankTier: 'Silver' },
    { name: 'Samuel', elo: 1100, avatar: 'https://i.pravatar.cc/150?u=Samuel', rankTier: 'Silver' },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'tx-101', type: 'deposit', amount: 5000, date: '2024-03-10 09:30', status: 'completed' },
  { id: 'tx-102', type: 'stake', amount: -500, date: '2024-03-10 09:45', status: 'completed' },
  { id: 'tx-103', type: 'winnings', amount: 900, date: '2024-03-10 10:05', status: 'completed' },
  { id: 'tx-104', type: 'withdrawal', amount: -2000, date: '2024-03-11 14:20', status: 'completed' },
  { id: 'tx-105', type: 'stake', amount: -1000, date: '2024-03-11 16:00', status: 'completed' },
  { id: 'tx-106', type: 'winnings', amount: 1800, date: '2024-03-11 16:25', status: 'completed' },
];

export const generateHash = (seed: string): string => {
  // Simple mock hash function for visual purposes
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
};
