import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { collection, query, onSnapshot, doc, serverTimestamp, getDocs, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { Briefcase, MapPin, Building2, ExternalLink, Sparkles, RefreshCw, Star, ArrowRight, Zap, Target } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateOpportunities } from '../lib/gemini';

export function Opportunities() {
  const { profile } = useStore();
  const [opps, setOpps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isGeneratingRef = useRef(false);

  useEffect(() => {
    if (!profile) return;

    const oppsRef = collection(db, 'users', profile.uid, 'opportunities');
    const q = query(oppsRef);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setOpps(data);
      
      // Check if we need to refresh (6 hours)
      const now = Date.now();
      const sixHours = 6 * 60 * 60 * 1000;
      
      const lastUpdate = data.length > 0 
        ? Math.max(...data.map(o => o.updatedAt?.toMillis?.() || 0))
        : 0;

      if (data.length === 0 || (now - lastUpdate > sixHours)) {
        refreshOpportunities();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${profile.uid}/opportunities`);
    });

    return () => unsubscribe();
  }, [profile?.uid]);

  const refreshOpportunities = async () => {
    if (!profile || isGeneratingRef.current) return;
    
    isGeneratingRef.current = true;
    setIsLoading(true);
    
    try {
      // Get completed nodes for context
      const roadmapSnap = await getDocs(collection(db, 'users', profile.uid, 'roadmap'));
      const completedNodes = roadmapSnap.docs
        .map(d => d.data())
        .filter((n: any) => n.status === 'completed');

      const newOpps = await generateOpportunities(profile.specialization, profile.level, completedNodes);
      
      if (newOpps.length > 0) {
        const batch = writeBatch(db);
        
        // Clear old ones
        const oldOppsSnap = await getDocs(collection(db, 'users', profile.uid, 'opportunities'));
        oldOppsSnap.docs.forEach(d => batch.delete(d.ref));
        
        // Add new ones
        newOpps.forEach((opp: any) => {
          const newDocRef = doc(collection(db, 'users', profile.uid, 'opportunities'));
          batch.set(newDocRef, {
            ...opp,
            updatedAt: serverTimestamp()
          });
        });
        
        await batch.commit();
      }
    } catch (error) {
      console.error("Failed to generate opportunities:", error);
    } finally {
      setIsLoading(false);
      isGeneratingRef.current = false;
    }
  };

  const lastUpdate = opps.length > 0 
    ? Math.max(...opps.map(o => o.updatedAt?.toMillis?.() || 0))
    : 0;

  const formatDistanceToNow = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (!profile) return null;

  return (
    <div className="h-full p-4 md:p-8 overflow-y-auto bg-zinc-950">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-mono text-zinc-500 uppercase tracking-widest mb-1">
            Career Trajectory // Level {profile.level} Matching
          </h2>
          <h1 className="text-4xl font-black tracking-tighter uppercase">Nexus Opportunities</h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-zinc-500 text-sm font-mono">
              Hyper-personalized roles and projects based on your Skill Tree mastery.
            </p>
            <span className="text-zinc-800">|</span>
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              Last Sync: {formatDistanceToNow(lastUpdate)}
            </span>
          </div>
        </div>
        <Button 
          variant="outline" 
          onClick={refreshOpportunities}
          disabled={isLoading}
          className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 font-mono text-[10px] uppercase tracking-widest"
        >
          {isLoading ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3" />}
          {isLoading ? "Analyzing Profiles..." : "Refresh Intelligence"}
        </Button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
             Array.from({ length: 4 }).map((_, i) => (
              <div key={`loading-${i}`} className="h-64 bg-zinc-900 animate-pulse rounded-2xl border border-zinc-800" />
            ))
          ) : opps.length > 0 ? (
            opps.sort((a, b) => b.matchScore - a.matchScore).map((opp, i) => {
              const learnedSkills = opp.requirements.filter((r: string) => !opp.missingSkills?.includes(r));
              
              return (
              <motion.div
                key={opp.id}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                layout
              >
                <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all overflow-hidden h-full flex flex-col">
                  <div className="bg-gradient-to-r from-emerald-500/10 to-transparent p-4 border-b border-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-2 w-2 rounded-full",
                        opp.matchScore > 80 ? "bg-emerald-500 animate-pulse" : 
                        opp.matchScore > 60 ? "bg-blue-500" : "bg-zinc-500"
                      )} />
                      <span className={cn(
                        "text-[10px] font-mono uppercase tracking-widest",
                        opp.matchScore > 80 ? "text-emerald-500" : 
                        opp.matchScore > 60 ? "text-blue-500" : "text-zinc-500"
                      )}>
                        {opp.matchScore > 80 ? "High Match Potential" : 
                         opp.matchScore > 60 ? "Balanced Match" : "Growth Opportunity"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      <span className="text-xs font-black text-white">{opp.matchScore}% MATCH</span>
                    </div>
                  </div>
                  
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <Badge variant="outline" className="mb-2 border-zinc-700 text-zinc-500 text-[10px] font-mono">
                          {opp.type.toUpperCase()}
                        </Badge>
                        <CardTitle className="text-xl font-black tracking-tight">{opp.title}</CardTitle>
                        <div className="flex items-center gap-2 text-zinc-500 mt-1">
                          <Building2 className="h-3 w-3" />
                          <span className="text-xs font-medium">{opp.company}</span>
                          <span className="text-zinc-800">|</span>
                          <MapPin className="h-3 w-3" />
                          <span className="text-xs">{opp.location}</span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col">
                    <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                      {opp.description}
                    </p>
                    
                    <div className="mt-auto space-y-4">
                      <div>
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest block mb-2 font-bold">Tech Stack Analysis</span>
                        <div className="flex flex-wrap gap-2">
                          {learnedSkills.map((req: string, i: number) => (
                            <Badge key={i} className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 text-[10px] px-2 py-0">
                              {req}
                            </Badge>
                          ))}
                          {opp.missingSkills?.map((req: string, i: number) => (
                            <Badge key={i} className="bg-zinc-800 text-zinc-600 border-transparent hover:bg-zinc-800 text-[10px] px-2 py-0">
                              {req}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                          <Zap className="h-3 w-3 text-yellow-500" />
                          EST. REWARD: +250 XP
                        </div>
                        <a 
                          href={opp.url.startsWith('http') ? opp.url : `https://www.google.com/search?q=${encodeURIComponent(opp.title + " " + opp.company)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" className="bg-white text-black hover:bg-zinc-200 group gap-2 h-8">
                            VIEW DETAILS
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )})
          ) : (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-900 rounded-3xl">
              <div className="h-16 w-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                <Briefcase className="h-8 w-8 text-zinc-700" />
              </div>
              <h3 className="text-xl font-bold text-zinc-300">Searching Career Horizon...</h3>
              <p className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto">
                Complete more nodes in your Skill Tree to unlock hyper-personalized opportunities.
              </p>
              <Button 
                variant="outline" 
                onClick={refreshOpportunities}
                className="mt-6 border-zinc-800 text-zinc-400"
              >
                Scan for Opportunities
              </Button>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-12 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="flex gap-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Star className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider mb-1">XP Verification</h4>
            <p className="text-[10px] text-zinc-500">All opportunities are synced with your real-time XP and completed chapters.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Zap className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider mb-1">AI Matching</h4>
            <p className="text-[10px] text-zinc-500">Every match score is calculated using deep context from your execution history.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
            <Target className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider mb-1">Market Radar</h4>
            <p className="text-[10px] text-zinc-500">Nexus scans 10,000+ open roles and projects every 6 hours for matches.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
