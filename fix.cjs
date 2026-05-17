const fs = require('fs');
let content = fs.readFileSync('c:/Users/pc/Desktop/katika/Katika/components/Profile.tsx', 'utf8');
content = content.replace(/type ProfileTab = 'overview' \| 'history' \| 'settings';/g, "type ProfileTab = 'overview' | 'history' | 'settings' | 'leaderboard';");
fs.writeFileSync('c:/Users/pc/Desktop/katika/Katika/components/Profile.tsx', content);
console.log('Fixed ProfileTab');
