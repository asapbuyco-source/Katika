const fs = require('fs');

const files = [
  'c:/Users/pc/Desktop/katika/Katika/components/Lobby.tsx',
  'c:/Users/pc/Desktop/katika/Katika/components/Profile.tsx',
  'c:/Users/pc/Desktop/katika/Katika/components/Finance.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Base structural colors back to royal
  content = content.replace(/bg-background/g, 'bg-royal-950');
  content = content.replace(/bg-card\/50/g, 'bg-royal-900/50');
  content = content.replace(/bg-card/g, 'bg-royal-900');
  content = content.replace(/bg-muted/g, 'bg-royal-800');
  
  // Accents back to gold
  content = content.replace(/emerald-500/g, 'gold-500');
  content = content.replace(/emerald-400/g, 'gold-400');
  content = content.replace(/emerald-600/g, 'gold-600');
  
  // Typography & Borders
  content = content.replace(/text-muted-foreground/g, 'text-slate-400');
  content = content.replace(/border-border/g, 'border-white/10');
  
  // Optimize buttons and key elements (e.g., bg-gold-500 -> bg-gradient-to-b from-gold-400 to-amber-600)
  // Let's add the glass panel optimization
  content = content.replace(/bg-royal-900 border border-white\/10 rounded-2xl/g, 'glass-panel rounded-2xl border-white/5');
  content = content.replace(/bg-royal-900\/50 border border-white\/10 rounded-xl/g, 'glass-panel rounded-xl border-white/5');

  fs.writeFileSync(file, content);
}

console.log('Reverted and optimized colors!');
