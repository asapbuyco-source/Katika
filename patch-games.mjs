import fs from 'fs';
import path from 'path';

const games = [
  {
    file: 'c:/Users/pc/Desktop/katika/Katika/components/ChessGame.tsx',
    target: '<div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>',
    replacement: '<div className="flex items-center gap-4"><NetworkSignalIndicator /><div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div></div>'
  },
  {
    file: 'c:/Users/pc/Desktop/katika/Katika/components/CheckersGame.tsx',
    target: '<div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div>',
    replacement: '<div className="flex items-center gap-4"><NetworkSignalIndicator /><div className="w-32 hidden md:block"><AIReferee externalLog={refereeLog} /></div></div>'
  },
  {
    file: 'c:/Users/pc/Desktop/katika/Katika/components/DiceGame.tsx',
    target: '<div className="flex flex-col items-center">',
    replacement: '<div className="flex items-center gap-4"><NetworkSignalIndicator /></div>\n                <div className="flex flex-col items-center">'
  },
  {
    file: 'c:/Users/pc/Desktop/katika/Katika/components/TicTacToeGame.tsx',
    target: '<div className="flex flex-col items-center">',
    replacement: '<div className="flex items-center gap-4"><NetworkSignalIndicator /></div>\n                <div className="flex flex-col items-center">'
  },
  {
    file: 'c:/Users/pc/Desktop/katika/Katika/components/GameRoom.tsx',
    target: '<div className="flex flex-col items-center">',
    replacement: '<div className="flex items-center gap-4"><NetworkSignalIndicator /></div>\n                <div className="flex flex-col items-center">'
  },
  {
    file: 'c:/Users/pc/Desktop/katika/Katika/components/PoolGame.tsx',
    target: '<div className="flex flex-col items-center">',
    replacement: '<div className="flex items-center gap-4"><NetworkSignalIndicator /></div>\n                <div className="flex flex-col items-center">'
  }
];

for (const game of games) {
  if (fs.existsSync(game.file)) {
    let content = fs.readFileSync(game.file, 'utf8');
    
    if (!content.includes('NetworkSignalIndicator')) {
      content = content.replace('import React', 'import { NetworkSignalIndicator } from \'./NetworkSignalIndicator\';\nimport React');
    }
    
    // Dice/TicTac/GameRoom/Pool have "flex flex-col items-center" for "Pot Size", we only want to replace the first occurrence in the header.
    // Let's use a more specific target
    let specificTarget = game.target;
    if (game.target.includes('flex flex-col items-center')) {
       specificTarget = '<div className="flex flex-col items-center">\n                    <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>';
       game.replacement = '<div className="flex items-center gap-4"><NetworkSignalIndicator /></div>\n                <div className="flex flex-col items-center">\n                    <div className="text-gold-400 font-bold uppercase tracking-widest text-xs">Pot Size</div>';
    }

    if (content.includes(specificTarget)) {
      content = content.replace(specificTarget, game.replacement);
      fs.writeFileSync(game.file, content);
      console.log(`Updated ${path.basename(game.file)}`);
    } else {
      console.log(`Target not found in ${path.basename(game.file)}`);
    }
  } else {
      console.log(`File not found: ${game.file}`);
  }
}
