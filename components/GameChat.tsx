
import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatMessage {
    id: string;
    senderId: string;
    message: string;
    timestamp: number;
}

interface GameChatProps {
    messages: ChatMessage[];
    onSendMessage: (msg: string) => void;
    currentUserId: string;
    profiles: Record<string, { name: string; avatar: string }>;
}

export const GameChat: React.FC<GameChatProps> = ({ messages, onSendMessage, currentUserId, profiles }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [text, setText] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const [hasUnread, setHasUnread] = useState(false);
    const lastMsgCount = useRef(messages.length);

    useEffect(() => {
        if (messages.length > lastMsgCount.current) {
            if (!isOpen) setHasUnread(true);
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        lastMsgCount.current = messages.length;
    }, [messages, isOpen]);

    useEffect(() => {
        if (isOpen) {
            setHasUnread(false);
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [isOpen]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (text.trim()) {
            onSendMessage(text);
            setText('');
        }
    };

    return (
        <>
            {/* Toggle Button - High Z-Index */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-[100] p-3 rounded-full shadow-lg transition-all ${isOpen ? 'bg-royal-800 text-white' : 'bg-gold-500 text-royal-950'}`}
            >
                {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
                {!isOpen && hasUnread && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse border border-royal-950" />
                )}
            </button>

            {/* Chat Window - High Z-Index */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="fixed bottom-20 right-6 z-[100] w-80 h-96 bg-royal-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="p-3 border-b border-white/5 bg-black/20 font-bold text-white text-sm flex justify-between items-center">
                            <span>Match Chat</span>
                            <span className="text-xs text-slate-400">{messages.length} messages</span>
                        </div>
                        
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                            {messages.length === 0 && (
                                <div className="text-center text-slate-500 text-xs mt-10">No messages yet. Say hi!</div>
                            )}
                            {messages.map(msg => {
                                const isMe = msg.senderId === currentUserId;
                                const profile = profiles[msg.senderId];
                                return (
                                    <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                                        <img src={profile?.avatar || 'https://i.pravatar.cc/150'} className="w-6 h-6 rounded-full border border-white/10 flex-shrink-0" />
                                        <div className={`max-w-[80%] p-2 rounded-xl text-xs ${isMe ? 'bg-gold-500 text-royal-950 rounded-tr-none' : 'bg-white/10 text-white rounded-tl-none'}`}>
                                            {!isMe && <div className="font-bold opacity-50 text-[10px] mb-0.5">{profile?.name || 'Opponent'}</div>}
                                            {msg.message}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <form onSubmit={handleSend} className="p-3 border-t border-white/5 bg-black/20 flex gap-2">
                            <input 
                                className="flex-1 bg-royal-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-gold-500"
                                placeholder="Type a message..."
                                value={text}
                                onChange={e => setText(e.target.value)}
                            />
                            <button type="submit" className="p-2 bg-gold-500 hover:bg-gold-400 text-royal-950 rounded-lg">
                                <Send size={16} />
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
