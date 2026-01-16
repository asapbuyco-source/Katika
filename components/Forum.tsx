
import React, { useState, useEffect, useRef } from 'react';
import { User, ForumPost } from '../types';
import { subscribeToForum, sendForumMessage, deleteForumMessage } from '../services/firebase';
import { playSFX } from '../services/sound';
import { MessageSquare, Send, Trash2, Shield, Info, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ForumProps {
  user: User;
}

export const Forum: React.FC<ForumProps> = ({ user }) => {
  const [messages, setMessages] = useState<ForumPost[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeToForum((posts) => {
        setMessages(posts);
        // Auto scroll to bottom only if user was near bottom or on initial load (simplified to always for chat feel)
        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }, 100);
    });
    return () => unsubscribe();
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!newMessage.trim() || isSending) return;

      setIsSending(true);
      playSFX('click');
      try {
          await sendForumMessage(user, newMessage.trim());
          setNewMessage('');
          playSFX('move');
      } catch (error) {
          console.error("Failed to send message", error);
      }
      setIsSending(false);
  };

  const handleDelete = async (postId: string) => {
      if (!window.confirm("Delete this message?")) return;
      try {
          await deleteForumMessage(postId);
          playSFX('error');
      } catch (error) {
          console.error("Failed to delete", error);
      }
  };

  const getRankColor = (tier: string) => {
      switch(tier) {
          case 'Diamond': return 'text-cyan-400 border-cyan-400';
          case 'Gold': return 'text-gold-400 border-gold-400';
          case 'Silver': return 'text-slate-300 border-slate-300';
          default: return 'text-orange-400 border-orange-400';
      }
  };

  const formatTime = (timestamp: any) => {
      if (!timestamp) return 'Just now';
      const date = timestamp.toDate();
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto h-screen md:h-auto md:min-h-screen pb-24 md:pb-6 flex flex-col">
       
       <header className="mb-6 flex items-center justify-between">
           <div>
               <h1 className="text-3xl font-display font-bold text-white mb-1 flex items-center gap-3">
                   <MessageSquare className="text-gold-400" /> Community Forum
               </h1>
               <p className="text-slate-400 text-sm">Chat with other players in the Vantage network.</p>
           </div>
           <div className="hidden md:flex items-center gap-2 text-xs font-bold bg-royal-900 px-3 py-1.5 rounded-full border border-white/5">
               <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> {Math.floor(Math.random() * 50) + 120} Online
           </div>
       </header>

       <div className="flex-1 flex gap-6 overflow-hidden">
           
           {/* MAIN CHAT AREA */}
           <div className="flex-1 flex flex-col glass-panel rounded-2xl border border-white/10 overflow-hidden bg-royal-900/50">
               
               {/* Messages List */}
               <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                   {messages.length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                           <MessageSquare size={48} className="mb-2" />
                           <p>No messages yet. Be the first!</p>
                       </div>
                   ) : (
                       <AnimatePresence initial={false}>
                           {messages.map((post) => {
                               const isMe = post.userId === user.id;
                               return (
                                   <motion.div 
                                       key={post.id}
                                       initial={{ opacity: 0, y: 20 }}
                                       animate={{ opacity: 1, y: 0 }}
                                       exit={{ opacity: 0, scale: 0.9 }}
                                       className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}
                                   >
                                       {/* Avatar */}
                                       <div className="flex-shrink-0 flex flex-col items-center gap-1">
                                           <img 
                                               src={post.userAvatar} 
                                               alt={post.userName} 
                                               className={`w-10 h-10 rounded-full border-2 ${getRankColor(post.userRank)}`} 
                                           />
                                       </div>

                                       {/* Content Bubble */}
                                       <div className={`flex flex-col max-w-[80%] md:max-w-[60%] ${isMe ? 'items-end' : 'items-start'}`}>
                                           <div className="flex items-center gap-2 mb-1">
                                               <span className={`text-xs font-bold ${isMe ? 'text-gold-400' : 'text-slate-300'}`}>
                                                   {post.userName}
                                               </span>
                                               {post.userRank === 'Diamond' && <Shield size={10} className="text-cyan-400" fill="currentColor" />}
                                               <span className="text-[10px] text-slate-500">{formatTime(post.timestamp)}</span>
                                           </div>
                                           
                                           <div className={`
                                               p-3 rounded-2xl text-sm relative group
                                               ${isMe 
                                                   ? 'bg-gold-500 text-royal-950 rounded-tr-none font-medium' 
                                                   : 'bg-royal-800 text-slate-200 rounded-tl-none border border-white/5'}
                                           `}>
                                               {post.content}
                                               
                                               {(user.isAdmin || isMe) && (
                                                   <button 
                                                       onClick={() => handleDelete(post.id)}
                                                       className="absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 text-red-500 bg-royal-900 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-red-500/20 hover:bg-red-500/10"
                                                   >
                                                       <Trash2 size={12} />
                                                   </button>
                                               )}
                                           </div>
                                       </div>
                                   </motion.div>
                               );
                           })}
                       </AnimatePresence>
                   )}
               </div>

               {/* Input Area */}
               <div className="p-4 bg-royal-950 border-t border-white/5">
                   <form onSubmit={handleSend} className="relative flex gap-2">
                       <input 
                           type="text"
                           value={newMessage}
                           onChange={(e) => setNewMessage(e.target.value)}
                           placeholder="Type your message..."
                           className="w-full bg-royal-900 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-white placeholder:text-slate-600 focus:outline-none focus:border-gold-500 transition-colors"
                       />
                       <button 
                           type="submit" 
                           disabled={!newMessage.trim() || isSending}
                           className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gold-500 text-royal-950 rounded-lg hover:bg-gold-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                       >
                           <Send size={18} />
                       </button>
                   </form>
               </div>
           </div>

           {/* SIDEBAR (Desktop Only) */}
           <div className="hidden md:flex w-72 flex-col gap-4">
               
               <div className="glass-panel p-5 rounded-2xl border border-white/5">
                   <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                       <Info size={16} className="text-blue-400" /> Community Rules
                   </h3>
                   <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                       <li>Be respectful to all players.</li>
                       <li>No spamming or self-promotion.</li>
                       <li>Do not share personal financial info.</li>
                       <li>Report suspicious behavior immediately.</li>
                   </ul>
               </div>

               <div className="glass-panel p-5 rounded-2xl border border-white/5 flex-1 bg-gradient-to-b from-royal-900/50 to-transparent">
                   <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                       <Shield size={16} className="text-gold-400" /> Top Contributors
                   </h3>
                   <div className="space-y-4">
                       {[
                           { name: 'Admin', rank: 'Diamond', msgs: '999+' },
                           { name: 'Blaise', rank: 'Gold', msgs: '452' },
                           { name: 'Amara', rank: 'Silver', msgs: '312' },
                       ].map((u, i) => (
                           <div key={i} className="flex items-center justify-between">
                               <div className="flex items-center gap-2">
                                   <div className={`w-2 h-2 rounded-full ${u.rank === 'Diamond' ? 'bg-cyan-400' : u.rank === 'Gold' ? 'bg-gold-400' : 'bg-slate-300'}`} />
                                   <span className="text-sm text-slate-300">{u.name}</span>
                               </div>
                               <span className="text-xs font-mono text-slate-500">{u.msgs}</span>
                           </div>
                       ))}
                   </div>
               </div>

           </div>

       </div>
    </div>
  );
};
