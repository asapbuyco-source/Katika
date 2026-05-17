import fs from 'fs';
let content = fs.readFileSync('c:/Users/pc/Desktop/katika/Katika/components/Profile.tsx', 'utf8');

const targetStr = '           {/* Banner/Cover */}';
const insertion = `           {/* Quick Actions (Top Right) */}
           <div className="absolute top-2 right-2 md:top-4 md:right-4 flex items-center gap-2 z-20">
               <button 
                   onClick={() => { onNavigate('finance'); playSFX('click'); }}
                   className="p-2.5 bg-royal-950/50 backdrop-blur-md border border-white/10 hover:border-gold-500/50 hover:bg-gold-500/10 rounded-full transition-all text-gold-400 group shadow-lg"
                   aria-label="Go to Finance"
               >
                   <Wallet size={18} className="group-hover:scale-110 transition-transform" />
               </button>
               <button 
                   onClick={() => { setActiveTab('settings'); playSFX('click'); }}
                   className="p-2.5 bg-royal-950/50 backdrop-blur-md border border-white/10 hover:border-white/30 hover:bg-white/10 rounded-full transition-all text-slate-300 hover:text-white group shadow-lg"
                   aria-label="Settings"
               >
                   <Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
               </button>
           </div>

`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, insertion + targetStr);
  fs.writeFileSync('c:/Users/pc/Desktop/katika/Katika/components/Profile.tsx', content);
  console.log('Done');
} else {
  console.log('Target string not found');
}
