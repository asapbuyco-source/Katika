const DEFAULT_LAUNCH_GAMES = ['Chess', 'Checkers', 'Dice', 'Pool'];

const GAME_ID_ALIASES: Record<string, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  draughts: 'Checkers',
  dice: 'Dice',
  pool: 'Pool',
  '8ballpool': 'Pool',
  ballpool: 'Pool',
  ludo: 'Ludo',
  tictactoe: 'TicTacToe',
  xo: 'TicTacToe',
  cards: 'Cards',
  whot: 'Cards',
};

const normalizeGameId = (value: string): string | null => {
  const key = value
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/[\s_-]+/g, '')
    .toLowerCase();

  return GAME_ID_ALIASES[key] || null;
};

export const parseLaunchGames = (raw?: string | null): Set<string> => {
  const source = raw && raw.trim() ? raw : DEFAULT_LAUNCH_GAMES.join(',');
  return new Set(
    source
      .split(',')
      .map(normalizeGameId)
      .filter((game): game is string => Boolean(game))
  );
};

export const getLaunchGameScope = (): Set<string> => (
  parseLaunchGames(import.meta.env.VITE_LAUNCH_GAMES)
);
