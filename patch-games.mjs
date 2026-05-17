import fs from 'fs';
import path from 'path';

const games = [
  'DiceGame.tsx',
  'TicTacToeGame.tsx',
  'GameRoom.tsx',
  'PoolGame.tsx'
];

for (const gameFile of games) {
  const filePath = path.join('c:/Users/pc/Desktop/katika/Katika/components', gameFile);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('NetworkSignalIndicator')) {
      content = content.replace('import React', 'import { NetworkSignalIndicator } from \'./NetworkSignalIndicator\';\nimport React');
    }
    
    // Most games have this structure for the back button
    const target1 = '<button onClick={() => setShowForfeitModal(true)}';
    
    // Instead of replacing the whole line, let's just insert the component right before the button
    // But we only want to do it for the FIRST occurrence (in the header)
    if (content.includes(target1) && !content.includes('<NetworkSignalIndicator />')) {
      content = content.replace(target1, '<div className="mr-2"><NetworkSignalIndicator /></div>\n                    <button onClick={() => setShowForfeitModal(true)}');
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${gameFile}`);
    } else {
      console.log(`Target not found or already patched in ${gameFile}`);
    }
  } else {
    console.log(`File not found: ${filePath}`);
  }
}
