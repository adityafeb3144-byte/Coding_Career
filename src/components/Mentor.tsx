import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { getMentorResponse } from '../lib/gemini';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, User as UserIcon, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

export function Mentor() {
  const { profile, user, mentorPrompt, setMentorPrompt } = useStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mentorPrompt && !loading) {
      const prompt = mentorPrompt;
      setMentorPrompt(null);
      handleSend(prompt);
    }
  }, [mentorPrompt, loading]);

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'users', profile.uid, 'mentor_chat'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, loading]);

  const handleSend = async (overrideInput?: string) => {
    const messageToSend = overrideInput || input;
    if (!messageToSend.trim() || !profile || loading) return;

    const userMsg = messageToSend;
    if (!overrideInput) setInput('');
    setLoading(true);

    try {
      // Add user message to Firestore
      await addDoc(collection(db, 'users', profile.uid, 'mentor_chat'), {
        role: 'user',
        content: userMsg,
        timestamp: serverTimestamp()
      });

      // Get AI response
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: userMsg });
      
      const aiResponse = await getMentorResponse(history, profile);
      const aiText = typeof aiResponse === 'string' ? aiResponse : aiResponse.text;

      // Add AI message to Firestore
      await addDoc(collection(db, 'users', profile.uid, 'mentor_chat'), {
        role: 'assistant',
        content: aiText || "I've processed your request.",
        timestamp: serverTimestamp()
      });

      // Handle function calls if any
      if (typeof aiResponse !== 'string' && aiResponse.functionCalls) {
        for (const call of aiResponse.functionCalls) {
          if (call.name === 'add_roadmap_node') {
            const args = call.args as any;
            const nodeId = args.title.toLowerCase().replace(/\s+/g, '-');
            
            await setDoc(doc(db, 'users', profile.uid, 'roadmap', nodeId), {
              id: nodeId,
              ...args,
              status: (!args.dependencies || args.dependencies.length === 0) ? 'available' : 'locked',
              dependencies: args.dependencies || [],
              order: args.order
            });

            // Add a system message about the new node
            await addDoc(collection(db, 'users', profile.uid, 'mentor_chat'), {
              role: 'assistant',
              content: `🚀 **SYSTEM UPDATE**: I've added **${args.title}** to your roadmap. Check your Skill Tree!`,
              timestamp: serverTimestamp()
            });
          } else if (call.name === 'update_roadmap_orders') {
            const args = call.args as any;
            for (const update of args.updates) {
              await updateDoc(doc(db, 'users', profile.uid, 'roadmap', update.nodeId), {
                order: update.order
              });
            }

            await addDoc(collection(db, 'users', profile.uid, 'mentor_chat'), {
              role: 'assistant',
              content: `🔄 **SYSTEM UPDATE**: I've re-sequenced your roadmap for better learning flow.`,
              timestamp: serverTimestamp()
            });
          } else if (call.name === 'get_roadmap') {
            const roadmapSnap = await getDocs(collection(db, 'users', profile.uid, 'roadmap'));
            const roadmapData = roadmapSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // We provide this data back to the AI by adding a hidden system message or just logging it.
            // For now, we'll log it and tell the AI it's been retrieved.
            console.log("Roadmap retrieved for AI:", roadmapData);
            
            await addDoc(collection(db, 'users', profile.uid, 'mentor_chat'), {
              role: 'assistant',
              content: `📊 **SYSTEM UPDATE**: I've analyzed your current roadmap structure.`,
              timestamp: serverTimestamp()
            });
          }
        }
      }
    } catch (error) {
      console.error("Mentor chat failed", error);
      await addDoc(collection(db, 'users', profile.uid, 'mentor_chat'), {
        role: 'assistant',
        content: "⚠️ **System Error**: I'm having trouble connecting to my neural core. Please check your connection or try again in a moment.",
        timestamp: serverTimestamp()
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      <header className="p-4 md:p-6 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-black tracking-tighter flex items-center gap-2">
            <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-purple-500" />
            AI MENTOR
          </h2>
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Strategic Guidance Engine v1.0</p>
        </div>
      </header>

      <div 
        className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth" 
        ref={scrollRef}
      >
        <div className="max-w-3xl mx-auto space-y-6 pb-4">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <div className="h-16 w-16 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                <Bot className="h-8 w-8 text-zinc-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">Initialize Consultation</h3>
              <p className="text-zinc-500 text-sm">Ask about your roadmap, career strategy, or technical doubts.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-4",
                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <Avatar className="h-8 w-8 border border-zinc-800">
                {msg.role === 'user' ? (
                  <>
                    <AvatarImage src={user?.photoURL || ''} />
                    <AvatarFallback><UserIcon className="h-4 w-4" /></AvatarFallback>
                  </>
                ) : (
                  <AvatarFallback className="bg-purple-500/20 text-purple-500"><Bot className="h-4 w-4" /></AvatarFallback>
                )}
              </Avatar>
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === 'user' 
                  ? "bg-blue-600 text-white rounded-tr-none" 
                  : "bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-tl-none"
              )}>
                <div className={cn(
                  "markdown-body",
                  msg.role === 'user' && "text-white [&_*]:text-white"
                )}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex gap-4">
              <Avatar className="h-8 w-8 border border-zinc-800">
                <AvatarFallback className="bg-purple-500/20 text-purple-500"><Bot className="h-4 w-4" /></AvatarFallback>
              </Avatar>
              <div className="bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-2xl rounded-tl-none px-4 py-3">
                <motion.div 
                  animate={{ opacity: [0.4, 1, 0.4] }} 
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="flex gap-1"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                </motion.div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 border-t border-zinc-800 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2 md:gap-3">
          <Input 
            placeholder="Ask your mentor..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="bg-zinc-900 border-zinc-800 text-white h-11 md:h-12 rounded-xl focus-visible:ring-white text-sm"
          />
          <Button 
            onClick={() => handleSend()} 
            disabled={loading || !input.trim()}
            className="h-11 w-11 md:h-12 md:w-12 rounded-xl bg-white text-black hover:bg-zinc-200 shrink-0"
          >
            <Send className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
