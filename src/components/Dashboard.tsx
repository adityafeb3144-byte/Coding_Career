import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { collection, query, onSnapshot, doc, updateDoc, increment, addDoc, serverTimestamp, getDocs, deleteDoc, writeBatch, getCountFromServer, where, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, calculateStreak } from '../lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Target, Award, TrendingUp, Clock, Flame, Sparkles, MessageSquare, CheckCircle2, Trophy, Globe, RefreshCw, FileUp, FileCheck, AlertCircle, Info, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateDailyQuests, generateInitialRoadmap, analyzeQuestSubmission, generateMarketIntelligence, getMentorResponse } from '../lib/gemini';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

export function Dashboard() {
  const { profile, setActiveTab, setMentorPrompt } = useStore();
  const [quests, setQuests] = useState<any[]>([]);
  const [loadingQuests, setLoadingQuests] = useState(false);
  const [isInitializingRoadmap, setIsInitializingRoadmap] = useState(false);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [nexusTotal, setNexusTotal] = useState<number>(0);
  const [volatility, setVolatility] = useState(0);
  const [projectedSlippage, setProjectedSlippage] = useState(0);
  const [currentChapter, setCurrentChapter] = useState<any>(null);
  const [hasRoadmap, setHasRoadmap] = useState<boolean | null>(null);
  const [xpGain, setXpGain] = useState<{ amount: number, id: string } | null>(null);
  const [analyzingQuestId, setAnalyzingQuestId] = useState<string | null>(null);
  const [marketTrends, setMarketTrends] = useState<any[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const isGeneratingRef = useRef(false);
  const isGeneratingMarketRef = useRef(false);

  // Market Intelligence Sync
  const syncMarketIntelligence = async () => {
    if (!profile || isGeneratingMarketRef.current) return;
    
    try {
      console.log("[MarketIntelligence] Sync Init...");
      const marketRef = doc(db, 'users', profile.uid, 'intelligence', 'market_trends');
      const trendSnap = await getDocs(query(collection(db, 'users', profile.uid, 'intelligence')));
      const trendDoc = trendSnap.docs.find(d => d.id === 'market_trends');
      
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      if (trendDoc && trendDoc.exists()) {
        const data = trendDoc.data();
        const lastUpdated = data.updatedAt?.toMillis?.() || 0;
        
        // If it's fresh enough and has data
        if (now - lastUpdated < twentyFourHours && data.trends && data.trends.length >= 3) {
          console.log("[MarketIntelligence] Using cached trends");
          setMarketTrends(data.trends);
          return;
        }
      }

      // Refresh trends
      console.log("[MarketIntelligence] Requesting AI Generation...");
      isGeneratingMarketRef.current = true;
      setLoadingMarket(true);
      
      // Safety timeout for loading state
      const timeout = setTimeout(() => {
        setLoadingMarket(false);
        isGeneratingMarketRef.current = false;
      }, 15000);

      const newTrends = await generateMarketIntelligence(profile.specialization || 'Software Engineering');
      clearTimeout(timeout);
      
      if (newTrends && newTrends.length >= 3) {
        const batch = writeBatch(db);
        batch.set(marketRef, {
          trends: newTrends,
          updatedAt: serverTimestamp()
        }, { merge: true });
        await batch.commit();
        setMarketTrends(newTrends);
        console.log("[MarketIntelligence] Sync Complete", newTrends);
      } else {
        console.warn("[MarketIntelligence] AI returned insufficient trends");
      }
    } catch (error) {
      console.error("[MarketIntelligence] Sync Failed", error);
    } finally {
      isGeneratingMarketRef.current = false;
      setLoadingMarket(false);
    }
  };

  const [loadingAdvisory, setLoadingAdvisory] = useState(false);
  const [advisory, setAdvisory] = useState<{ directive: string, advisory: string } | null>(null);

  // Strategic Advisory Sync
  const syncStrategicAdvisory = async () => {
    if (!profile?.uid || loadingAdvisory) return;
    
    setLoadingAdvisory(true);
    try {
      const uid = profile.uid.trim();
      if (!uid) {
        console.warn("[StrategicMentor] UID is empty string, skipping sync.");
        return;
      }
      const path = `users/${uid}/intelligence/strategy_advisory`;
      console.log(`[StrategicMentor] Fetching dynamic advisory for ${path}...`);
      const history = [
        { role: 'user', content: `Provide a 2-sentence highly critical strategic update for my career path as a ${profile.specialization}. 
        Format as JSON only without markdown code blocks: { "directive": "One high-impact command", "advisory": "One context-aware market observation" }` }
      ];
      
      const response = await getMentorResponse(history, profile);
      const text = typeof response === 'string' ? response : response.text;
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        setAdvisory(data);
        
        const docRef = doc(db, 'users', profile.uid.trim(), 'intelligence', 'strategy_advisory');
        await setDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("[StrategicMentor] Advisory saved successfully.");
      }
    } catch (error: any) {
      console.error(`[StrategicMentor] Advisory fetch failed at users/${profile?.uid}/intelligence/strategy_advisory:`, error);
      if (error?.message) {
        console.error("[StrategicMentor] Error Details:", error.message);
      }
    } finally {
      setLoadingAdvisory(false);
    }
  };

  useEffect(() => {
    const loadAdvisory = async () => {
      if (!profile?.uid) return;
      try {
        const uid = profile.uid.trim();
        if (!uid) return;
        const path = `users/${uid}/intelligence/strategy_advisory`;
        const docSnap = await getDoc(doc(db, 'users', uid, 'intelligence', 'strategy_advisory'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          const lastUpdated = data.updatedAt?.toMillis?.() || 0;
          const twelveHours = 12 * 60 * 60 * 1000;
          
          if (Date.now() - lastUpdated < twelveHours) {
            setAdvisory({ directive: data.directive, advisory: data.advisory });
          } else {
            syncStrategicAdvisory();
          }
        } else {
          syncStrategicAdvisory();
        }
      } catch (err) {
        console.error(`[StrategicMentor] Initial load failed for users/${profile?.uid}/intelligence/strategy_advisory:`, err);
      }
    };
    loadAdvisory();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    // Fetch Roadmap Progress and Check Existence
    const roadmapRef = collection(db, 'users', profile.uid, 'roadmap');
    const unsubscribeRoadmap = onSnapshot(roadmapRef, (snapshot) => {
      setHasRoadmap(!snapshot.empty);
      
      const allNodes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const available = allNodes.filter((n: any) => n.status === 'available');
      
      if (available.length > 0) {
        const current = available.sort((a: any, b: any) => (a.order || 0) - (b.order || 0))[0];
        setCurrentChapter(current);
      } else if (allNodes.length > 0) {
        // If none available, show the first locked one as "Next Up"
        const next = allNodes
          .filter((n: any) => n.status === 'locked')
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))[0];
        setCurrentChapter(next);
      } else {
        setCurrentChapter(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${profile.uid}/roadmap`);
    });

    const q = query(collection(db, 'users', profile.uid, 'daily_quests'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // ... existing snapshot logic ...
      if (isGeneratingRef.current) return;
      const questData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const today = new Date().toISOString().split('T')[0];
      const hasTodayQuests = questData.some((q: any) => q.date === today);
      const allCompleted = questData.every((q: any) => q.completed);
      const activeQuests = questData
        .filter((q: any) => q.date === today || !q.completed)
        .sort((a: any, b: any) => {
          const timeA = a.timestamp?.toMillis?.() || a.timestamp?.seconds * 1000 || Date.now();
          const timeB = b.timestamp?.toMillis?.() || b.timestamp?.seconds * 1000 || Date.now();
          return timeA - timeB;
        });
      setQuests(activeQuests);
      if (questData.length === 0 || (!hasTodayQuests && allCompleted)) {
        generateNewQuests();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${profile.uid}/daily_quests`);
    });

    // Fetch Rank and Total Population
    const fetchRank = async () => {
      try {
        const totalColl = collection(db, 'public_profiles');
        const totalSnapshot = await getCountFromServer(totalColl);
        const total = totalSnapshot.data().count;
        setNexusTotal(total);

        // Rank by Market Power instead of raw XP
        const mp = profile.marketPower || 0;
        const rankQuery = query(
          collection(db, 'public_profiles'),
          where('marketPower', '>', mp)
        );
        const rankSnapshot = await getCountFromServer(rankQuery);
        const rank = rankSnapshot.data().count + 1;
        setUserRank(rank);

        // Calculate Volatility (Market Decay)
        // If last activity was > 24 hours ago, volatility increases
        const lastActive = profile.lastActivity?.toMillis?.() || Date.now();
        const hoursInactive = (Date.now() - lastActive) / (1000 * 60 * 60);
        const volatility = Math.min(100, Math.max(0, (hoursInactive - 24) * 2));
        setVolatility(volatility);
        
        // Projected Industry Rank (Simulate drift)
        // Drift is 0.1% of total population per hour of volatility
        const drift = Math.floor((volatility / 100) * (total * 0.05));
        setProjectedSlippage(drift);

      } catch (error) {
        console.error("Failed to fetch rank", error);
      }
    };
    fetchRank();

    // Initial sync
    syncMarketIntelligence();

    return () => {
      unsubscribe();
      unsubscribeRoadmap();
    };
  }, [profile?.uid, profile?.xp, profile?.marketPower, profile?.lastActivity]); // Re-fetch rank when key metrics change

  const generateNewQuests = async (force = false) => {
    if (!profile || isGeneratingRef.current || loadingQuests) return;
    
    // Manual refresh check: if we have quests and any are incomplete, block it
    // UNLESS it's a forced sync (sparkle button)
    const hasIncomplete = quests.some(q => !q.completed);
    if (!force && hasIncomplete && quests.length > 0) {
      return;
    }

    isGeneratingRef.current = true;
    setLoadingQuests(true);
    try {
      // Get nodes for context
      const roadmapSnap = await getDocs(collection(db, 'users', profile.uid, 'roadmap'));
      const allNodes = roadmapSnap.docs.map(d => d.data());
      
      const availableNodes = allNodes.filter((n: any) => n.status === 'available');
      const completedNodes = allNodes.filter((n: any) => n.status === 'completed');

      const newQuests = await generateDailyQuests(profile.specialization, availableNodes, completedNodes);
      const today = new Date().toISOString().split('T')[0];

      const batch = writeBatch(db);

      // Delete old quests
      const oldQuestsSnap = await getDocs(collection(db, 'users', profile.uid, 'daily_quests'));
      oldQuestsSnap.docs.forEach(d => batch.delete(d.ref));

      // Add new ones
      for (const q of newQuests) {
        const newDocRef = doc(collection(db, 'users', profile.uid, 'daily_quests'));
        batch.set(newDocRef, {
          ...q,
          date: today,
          completed: false,
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${profile.uid}/daily_quests`);
    } finally {
      isGeneratingRef.current = false;
      setLoadingQuests(false);
    }
  };

  const handleCompleteQuest = async (questId: string, xp: number = 100, feedback: string = '', score: number = 0, marketDemand: number = 0.5) => {
    if (!profile) return;
    
    // Ensure xp is a valid number
    const rewardXp = typeof xp === 'number' ? xp : 100;
    const demand = typeof marketDemand === 'number' ? marketDemand : 0.5;
    
    // Market Power Calculation: rewardXp * marketDemand * qualityScore
    // This ensures high-demand skills and high-quality work result in better standing.
    const marketPowerGain = Math.round(rewardXp * demand * (Math.max(score, 10) / 100));

    try {
      const batch = writeBatch(db);
      
      // Streak Logic
      const { newStreak, shouldUpdate: shouldUpdateStreak } = calculateStreak(profile.lastActive, profile.streak || 0);

      batch.set(doc(db, 'users', profile.uid, 'daily_quests', questId), {
        completed: true,
        feedback,
        score,
        marketPowerGain,
        completedAt: serverTimestamp()
      }, { merge: true });
      
      const userUpdate: any = {
        xp: increment(rewardXp),
        marketPower: increment(marketPowerGain),
        lastActive: new Date().toISOString(),
        lastActivity: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (shouldUpdateStreak) {
        userUpdate.streak = newStreak;
      }

      // Using set with merge to ensure it works even if doc is somehow missing
      batch.set(doc(db, 'users', profile.uid), userUpdate, { merge: true });

      batch.set(doc(db, 'public_profiles', profile.uid), {
        xp: increment(rewardXp),
        marketPower: increment(marketPowerGain),
        lastActivity: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();

      // Optimistically update store profile
      useStore.getState().setProfile({
        ...profile,
        xp: profile.xp + rewardXp,
        marketPower: (profile.marketPower || 0) + marketPowerGain,
        streak: shouldUpdateStreak ? newStreak : profile.streak,
        lastActive: new Date().toISOString()
      });

      // Show XP gain notification
      setXpGain({ amount: rewardXp, id: Date.now().toString() });
      setTimeout(() => setXpGain(null), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${profile.uid}/daily_quests/${questId}`);
    }
  };

  const handleQuestFileSubmit = async (quest: any, file: File) => {
    if (!profile) return;
    setAnalyzingQuestId(quest.id);
    
    try {
      // Basic size validation - increased to 50MB to handle large monorepo files or datasets
      if (file.size > 50 * 1024 * 1024) { 
        throw new Error("File too large. Maximum size for Nexus Source analysis is 50MB. If your solution is larger, please upload the primary logic file.");
      }

      // Read file content
      const reader = new FileReader();
      const isImage = file.type.startsWith('image/');
      const isScratch = file.name.toLowerCase().endsWith('.sb3');
      
      const fileContent = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error("Failed to read file. It might be too large or corrupted."));
        
        if (isImage || isScratch) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      });

      // Analyze with AI
      const analysis = await analyzeQuestSubmission(quest.title, fileContent, file.name, file.type);
      
      if (analysis.isComplete) {
        await handleCompleteQuest(quest.id, quest.xp, analysis.feedback, analysis.score, quest.marketDemand);
      } else {
        // Just update feedback if not complete
        await updateDoc(doc(db, 'users', profile.uid, 'daily_quests', quest.id), {
          feedback: analysis.feedback,
          score: analysis.score
        });
      }
    } catch (error: any) {
      console.error("Quest analysis failed", error);
      // Update with a local error message if the API call didn't even reach the helper
      await updateDoc(doc(db, 'users', profile.uid, 'daily_quests', quest.id), {
        feedback: error.message || "Failed to analyze submission. Please ensure the file is text-based and try again.",
        score: 0
      });
    } finally {
      setAnalyzingQuestId(null);
    }
  };

  const [isRebuildModalOpen, setIsRebuildModalOpen] = useState(false);

  const initializeRoadmap = async (resetXP = false) => {
    if (!profile || isInitializingRoadmap) return;
    
    console.log("Starting roadmap initialization...");
    setIsInitializingRoadmap(true);
    setIsRebuildModalOpen(false);
    try {
      if (resetXP) {
        console.log("Master Reset: Resetting XP and Specialization...");
        const profileRef = doc(db, 'public_profiles', profile.uid);
        const userRef = doc(db, 'users', profile.uid);
        const batch = writeBatch(db);
        batch.update(profileRef, { xp: 0, marketPower: 0, level: 1, specialization: 'Software + Cloud + AI' });
        batch.update(userRef, { xp: 0, marketPower: 0, level: 1, specialization: 'Software + Cloud + AI' });
        await batch.commit();
      }

      // Clear existing roadmap first to avoid duplicates or stale data
      const roadmapSnap = await getDocs(collection(db, 'users', profile.uid, 'roadmap'));
      console.log(`Found ${roadmapSnap.size} existing nodes to clear.`);
      
      if (roadmapSnap.size > 0) {
        const deleteBatch = writeBatch(db);
        roadmapSnap.docs.forEach(d => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
        console.log("Existing roadmap cleared.");
      }

      const nodes = await generateInitialRoadmap('Software + Cloud + AI', profile.intensity);
      console.log(`Generated ${nodes.length} new nodes.`);
      
      if (nodes.length > 0) {
        const batch = writeBatch(db);
        let remainingXp = resetXP ? 0 : profile.xp; 
        console.log(`Smart Restore: Attempting to restore progress using ${remainingXp} XP.`);

        // Sort nodes by order to ensure sequential restoration
        const sortedNodes = [...nodes].sort((a, b) => (a.order || 0) - (b.order || 0));

        for (const node of sortedNodes) {
          const nodeRef = doc(db, 'users', profile.uid, 'roadmap', node.id);
          
          // Calculate total XP for this node
          const nodeTotalXp = node.lectures.reduce((sum: number, l: any) => sum + (l.xpReward || 50), 0);
          
          let status = 'locked';
          let updatedLectures = node.lectures.map((l: any) => ({ ...l, completed: false }));

          if (remainingXp >= nodeTotalXp) {
            // User has enough XP to have "finished" this node in the old system
            status = 'completed';
            updatedLectures = node.lectures.map((l: any) => ({ ...l, completed: true }));
            remainingXp -= nodeTotalXp;
            console.log(`Smart Restore: Auto-completed node "${node.title}"`);
          } else if (remainingXp > 0) {
            // Partially complete the node
            status = 'available';
            updatedLectures = node.lectures.map((l: any) => {
              if (remainingXp >= (l.xpReward || 50)) {
                remainingXp -= (l.xpReward || 50);
                return { ...l, completed: true };
              }
              return l;
            });
            console.log(`Smart Restore: Partially completed node "${node.title}"`);
          } else if (node.dependencies.length === 0 || sortedNodes.indexOf(node) === 0) {
            status = 'available';
          }

          batch.set(nodeRef, {
            ...node,
            lectures: updatedLectures,
            status
          });
        }

        // Second pass: Unlock nodes that have all dependencies completed
        // (Simplified: since it's sequential, the next one after a completed one should be available)
        await batch.commit();
        console.log("New roadmap saved to Firestore with Smart Restore.");
      }
      
      // After roadmap is created, generate quests
      await generateNewQuests(true);
      console.log("Roadmap initialization complete.");
    } catch (error) {
      console.error("Roadmap initialization failed:", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${profile.uid}/roadmap`);
    } finally {
      setIsInitializingRoadmap(false);
    }
  };

  if (!profile) return null;

  const handleAnalyzeMarket = () => {
    setMentorPrompt("Analyze current market trends for my specialization and update my roadmap if there are critical skills I'm missing.");
    setActiveTab('mentor');
  };

  const xpToNextLevel = profile.level * 1000;
  const levelStartXP = (profile.level - 1) * 1000;
  const progress = Math.min(100, Math.max(0, ((profile.xp - levelStartXP) / 1000) * 100));

  const GLOBAL_ENGINEER_COUNT = 27200000;
  const calculateIndustryRank = (mp: number) => {
    if (!mp || mp <= 0) return GLOBAL_ENGINEER_COUNT;
    const k = 0.0004605;
    return Math.max(1, Math.floor(GLOBAL_ENGINEER_COUNT * Math.exp(-k * mp)));
  };

  const industryRank = calculateIndustryRank(profile.marketPower || 0);

  const percentile = userRank && nexusTotal > 0 ? ((userRank / nexusTotal) * 100).toFixed(2) : "---";

  return (
    <div className="h-full p-4 md:p-8 overflow-y-auto bg-zinc-950">
      <header className="mb-6 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.h2 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[10px] font-mono text-emerald-500/70 uppercase tracking-[0.2em] mb-1 flex items-center gap-2"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            System Status: Operational // Real-Time Ranking Verified
          </motion.h2>
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-black tracking-tighter"
          >
            COMMAND CENTER
          </motion.h1>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setIsRebuildModalOpen(true)}
          disabled={isInitializingRoadmap}
          className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 h-9 px-4 font-mono text-[10px] uppercase tracking-widest"
        >
          {isInitializingRoadmap ? (
            <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3 w-3" />
          )}
          Rebuild Skill Tree
        </Button>
      </header>

      {/* Rebuild Confirmation Modal */}
      <AnimatePresence>
        {isRebuildModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-6">
                <RefreshCw className="h-6 w-6 text-yellow-500" />
              </div>
              <h3 className="text-xl font-black tracking-tighter uppercase mb-4">Rebuild Curriculum?</h3>
              <div className="space-y-4 text-zinc-400 text-sm mb-8">
                <p>This will regenerate your Skill Tree with <strong>Academic-Grade</strong> content. I will prioritize resources from MIT OCW, Harvard CS50, and freeCodeCamp.</p>
                <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <p className="text-white font-bold mb-1 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                    Academic Rigor Mode
                  </p>
                  <p className="text-xs">Nexus will use the absolute best academic resources available globally. This is a destructive operation and will replace your current curriculum structure.</p>
                </div>
                <p className="text-xs italic">Choose "MASTER RESET" to start from XP 0 with the Software + Cloud + AI path, or "REBUILD" to keep your current progress.</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button 
                    variant="ghost" 
                    className="flex-1 hover:bg-zinc-800"
                    onClick={() => setIsRebuildModalOpen(false)}
                  >
                    CANCEL
                  </Button>
                  <Button 
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold"
                    onClick={() => initializeRoadmap(false)}
                  >
                    REBUILD
                  </Button>
                </div>
                <Button 
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black"
                  onClick={() => initializeRoadmap(true)}
                >
                  MASTER RESET (XP 0)
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {xpGain && (
          <motion.div
            key={xpGain.id}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.8 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-black px-6 py-2 rounded-full font-black shadow-[0_0_30px_rgba(16,185,129,0.4)] flex items-center gap-2"
          >
            <Zap className="h-4 w-4 fill-black" />
            +{xpGain.amount} XP EARNED
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-8">
        {/* Level Card */}
        <Card className="bg-zinc-900 border-zinc-800 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Award className="h-24 w-24" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Current Level</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-4">
              <div className="text-5xl font-black">{profile.level}</div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-emerald-500 font-bold text-[9px] uppercase tracking-widest">
                  <Trophy className="h-3 w-3" />
                  Skill Verification Rank
                </div>
                <div className="text-xl font-black text-white">#{userRank || '---'}</div>
                <div className="mt-2 pt-2 border-t border-zinc-800">
                  <div className="text-[8px] text-zinc-500 font-mono uppercase tracking-widest mb-0.5">Projected Industry Rank</div>
                  <div className="text-xs font-bold text-white/70 tracking-tight">#{industryRank.toLocaleString()}</div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-zinc-500">
                <span>XP: {profile.xp}</span>
                <span>NEXT: {xpToNextLevel}</span>
              </div>
              <Progress value={progress} className="h-2 bg-zinc-800" />
            </div>
          </CardContent>
        </Card>

        {/* Streak Card */}
        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Active Streak</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="text-5xl font-black">{profile.streak}</div>
            <div className="h-12 w-12 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Flame className="h-6 w-6 text-orange-500" />
            </div>
            <div className="text-xs text-zinc-500 leading-tight">
              Keep executing daily to<br />maintain your multiplier.
            </div>
          </CardContent>
        </Card>

        {/* Mission Control Card */}
        <Card className="bg-zinc-900 border-zinc-800 text-white relative overflow-hidden border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-zinc-500 uppercase tracking-widest flex items-center justify-between">
              Mission Control
              <Zap className="h-3 w-3 text-yellow-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono text-zinc-400">AGENTS STANDBY</span>
            </div>
            <Button 
              onClick={() => generateNewQuests(true)}
              disabled={loadingQuests}
              className="w-full bg-white text-black hover:bg-zinc-200 font-bold h-10 group"
            >
              {loadingQuests ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {loadingQuests ? "GENERATING..." : "REFRESH MISSIONS"}
            </Button>
            <p className="text-[8px] text-zinc-600 font-mono text-center">
              Force-syncs AI missions with current progress.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Chapter Progress */}
      {hasRoadmap === null ? (
        <div className="mb-8 h-32 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-pulse flex items-center justify-center">
          <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Checking Roadmap Integrity...</p>
        </div>
      ) : (hasRoadmap === false || (currentChapter && (!currentChapter.lectures || currentChapter.lectures.length === 0))) ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Card className="bg-zinc-900 border-zinc-800 border-l-4 border-l-yellow-500 overflow-hidden">
            <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-bold uppercase tracking-tighter mb-1">
                  {hasRoadmap === false ? "Roadmap Not Initialized" : "Roadmap Data Incomplete"}
                </h3>
                <p className="text-zinc-500 text-sm">
                  {hasRoadmap === false 
                    ? "Your career trajectory is active, but your Skill Tree needs to be generated."
                    : "Your current roadmap step is missing lecture data. Let's rebuild it."}
                </p>
              </div>
              <Button 
                onClick={() => {
                  if (hasRoadmap === false) {
                    initializeRoadmap();
                  } else {
                    setIsRebuildModalOpen(true);
                  }
                }} 
                disabled={isInitializingRoadmap}
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-8"
              >
                {isInitializingRoadmap ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    GENERATING TREE...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {hasRoadmap === false ? "INITIALIZE SKILL TREE" : "REBUILD SKILL TREE"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : currentChapter && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Card className="bg-zinc-900 border-zinc-800 border-l-4 border-l-emerald-500 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[10px] font-mono">CURRENT FOCUS</Badge>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">ROADMAP STEP {currentChapter.order}</span>
                  </div>
                  <h3 className="text-2xl font-black tracking-tighter uppercase mb-2">{currentChapter.title}</h3>
                  <p className="text-zinc-400 text-sm line-clamp-1">{currentChapter.description}</p>
                </div>

                <div className="w-full md:w-64 space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-zinc-500 uppercase">Chapter Progress</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">
                        {currentChapter.lectures?.filter((l: any) => l.completed).length || 0}/{currentChapter.lectures?.length || 0}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 text-zinc-500 hover:text-emerald-500"
                        onClick={() => generateNewQuests(true)}
                        disabled={loadingQuests}
                        title="Sync missions with current progress"
                      >
                        <Sparkles className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <Progress 
                    value={((currentChapter.lectures?.filter((l: any) => l.completed).length || 0) / (currentChapter.lectures?.length || 1)) * 100} 
                    className="h-2 bg-zinc-800" 
                  />
                  <p className="text-[10px] text-zinc-500 italic text-right">
                    Click sparkle to sync AI missions
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        {/* Market Intelligence Analysis Chart */}
        <Card className="lg:col-span-8 bg-zinc-900 border-zinc-800 text-white overflow-hidden">
          <CardHeader className="border-b border-zinc-800 bg-zinc-900/40">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xs font-mono text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="h-3 w-3" />
                  Market Demand vs Mastery Radar
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-zinc-500 hover:text-white"
                  onClick={() => syncMarketIntelligence()}
                  disabled={loadingMarket}
                >
                  <RefreshCw className={cn("h-3 w-3", loadingMarket && "animate-spin")} />
                </Button>
                <Badge variant="outline" className="border-emerald-500/20 text-emerald-500 text-[9px] font-mono">
                  LIVE_FEED_ACTIVE
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-7 h-[300px] w-full flex items-center justify-center relative bg-black/40 rounded-xl border border-white/5 shadow-inner">
                {loadingMarket ? (
                  <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin" />
                    <div className="text-center">
                      <span className="text-[10px] font-mono text-white block uppercase tracking-[0.2em] mb-1">Nexus Intelligence Syncing...</span>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Parsing Industry Demand Data</span>
                    </div>
                  </div>
                ) : (marketTrends && marketTrends.length >= 3) ? (
                  <div className="w-full h-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="60%" data={marketTrends}>
                        <PolarGrid stroke="#27272a" strokeDasharray="4 4" />
                        <PolarAngleAxis 
                          dataKey="skillName" 
                          tick={{ fill: '#71717a', fontSize: 9, fontWeight: 700 }}
                        />
                        <PolarRadiusAxis 
                          angle={30} 
                          domain={[0, 100]} 
                          tick={false} 
                          axisLine={false} 
                        />
                        <Radar
                          name="Industry Demand"
                          dataKey="demandScore"
                          stroke="#10b981"
                          fill="#10b981"
                          fillOpacity={0.6}
                          animationDuration={1000}
                        />
                        <Radar
                          name="Nexus Benchmark"
                          dataKey="benchScore"
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.2}
                          animationDuration={1500}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '10px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[8px] font-mono">DEMAND</Badge>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[8px] font-mono">BENCH</Badge>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center p-8 bg-zinc-900/50 rounded-xl">
                    <AlertCircle className="h-10 w-10 text-emerald-500/50" />
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white uppercase tracking-tight">Intelligence Engine Idle</p>
                        <p className="text-[10px] text-zinc-500 font-mono leading-tight">
                          Connect to the Global Intelligence Feed to fetch market metrics for <span className="text-white">{profile.specialization}</span>.
                        </p>
                      </div>
                      <Button 
                        onClick={() => syncMarketIntelligence()} 
                        className="bg-emerald-500 text-black hover:bg-emerald-400 font-black uppercase text-xs tracking-widest px-8 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        RETRY_SYNC_INIT
                      </Button>
                      <p className="text-[9px] text-zinc-600 font-mono italic">
                        Real-time data requires an active Gemini link.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="md:col-span-5 space-y-4">
                <p className="text-[10px] text-zinc-500 font-mono leading-relaxed uppercase tracking-tighter">
                  Real-time analysis of <span className="text-white font-bold">{profile.specialization}</span> demand metrics vs industry standard entry benchmarks.
                </p>
                <div className="pt-4 border-t border-zinc-800 space-y-3">
                  {marketTrends && marketTrends.length > 0 ? (
                    marketTrends.slice(0, 3).map((trend, i) => (
                      <div key={i}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">{trend.skillName}</span>
                          <span className="text-[10px] font-mono text-emerald-500">{trend.demandScore}%</span>
                        </div>
                        <Progress value={trend.demandScore} className="h-1 bg-zinc-800" />
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-zinc-600 italic">Feed offline. Initialize sync to stream demand metrics.</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operational Intelligence Card */}
        <Card className="lg:col-span-4 bg-zinc-900 border-zinc-800 text-white overflow-hidden flex flex-col">
          <CardHeader className="pb-2 border-b border-zinc-800/50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Operational Intelligence</CardTitle>
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-4 p-4">
            <div className="pt-2 space-y-3">
              <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-500">GLOBAL_POSITION</span>
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-white font-bold">TOP {percentile}%</span>
                    {projectedSlippage > 0 && (
                      <span className="text-[8px] font-mono text-red-500 block">-{projectedSlippage} DRIFT_SLIP</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-zinc-600">RANK_ID</span>
                  <span className="text-[9px] font-mono text-zinc-400">#{industryRank.toLocaleString()} GLOBAL</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-500">VOLATILITY_INDEX</span>
                  <span className={cn(
                    "text-[10px] font-mono font-bold uppercase",
                    volatility > 50 ? "text-red-500 animate-pulse" : volatility > 10 ? "text-orange-500" : "text-emerald-500"
                  )}>
                    {volatility > 0 ? `${volatility.toFixed(1)}%` : "STABLE"}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[8px] font-mono text-zinc-600 uppercase">
                    <span>Market Stability</span>
                    <span>{Math.max(0, 100 - volatility).toFixed(1)}%</span>
                  </div>
                  <Progress value={100 - volatility} className={cn("h-1", volatility > 50 ? "bg-red-900" : "bg-zinc-800")} />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/5">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-zinc-500 block">ENGINE_EFFICIENCY</span>
                  <div className="flex items-center gap-2">
                    <Flame className="h-3 w-3 text-orange-500" />
                    <span className="text-[12px] font-mono text-white font-black">{profile.streak}X MULTIPLIER</span>
                  </div>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[9px] font-mono">OPTI_MODE</Badge>
              </div>
            </div>
            
            <div className="mt-4 p-3 rounded bg-zinc-800/20 border border-zinc-800/50">
              <p className="text-[9px] text-zinc-500 font-mono italic leading-relaxed">
                <span className="text-zinc-300 font-bold">LOG_ENTRY:</span> Nexus AI has detected a <span className="text-emerald-500">{(profile.streak > 0 ? (profile.streak * 5) : 0)}% efficiency boost</span> in your learning trajectory due to consecutive active cycles.
              </p>
            </div>
          </CardContent>
          <div className="p-4 bg-emerald-500/5 mt-auto border-t border-emerald-500/10">
             <Button 
               variant="ghost" 
               className="w-full text-[10px] font-mono text-emerald-500/70 hover:text-emerald-400 h-8 group"
               onClick={handleAnalyzeMarket}
             >
               FETCH ANALYTICS_REPORT_V5 <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
             </Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-8">
        {/* Daily Missions */}
        <section className="lg:col-span-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2 uppercase tracking-tighter">
              <Zap className="h-5 w-5 text-yellow-500" />
              Daily Active Missions
            </h3>
          </div>
          <p className="text-[10px] text-zinc-600 mb-2 italic">Getting stuck? Use Mission Control above to refresh your focus.</p>
          <div className="space-y-3">
            {loadingQuests ? (
              [1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-pulse" />
              ))
            ) : quests.length > 0 ? quests.map((quest) => (
              <QuestItem 
                key={quest.id}
                quest={quest}
                isAnalyzing={analyzingQuestId === quest.id}
                onFileSubmit={(file) => handleQuestFileSubmit(quest, file)}
              />
            )) : (
              <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl">
                <p className="text-zinc-500 text-sm">No missions active. Use Mission Control to initialize.</p>
              </div>
            )}
          </div>
        </section>

        {/* Strategic Mentor */}
        <section className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2 uppercase tracking-tighter">
              <Target className="h-5 w-5 text-emerald-500" />
              Strategic Mentor
            </h3>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-zinc-500 hover:text-emerald-500"
              onClick={syncStrategicAdvisory}
              disabled={loadingAdvisory}
            >
              <RefreshCw className={cn("h-3 w-3", loadingAdvisory && "animate-spin")} />
            </Button>
          </div>
          <Card className="bg-zinc-900 border-zinc-800 text-white min-h-[400px] flex flex-col shadow-2xl">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <CardTitle className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">Personalized Nexus Strategy</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col">
              <ScrollArea className="flex-1 p-4 h-[350px]">
                {loadingAdvisory && !advisory ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Generating Strategy...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-3 w-3 text-emerald-500" />
                        <p className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest font-bold">// SYSTEM_DIRECTIVE</p>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                        "{advisory?.directive || `Focus on completing the remaining chapters in ${currentChapter?.title || 'Foundations'} to unlock high-impact project opportunities.`}"
                      </p>
                    </div>
                    
                    <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-800/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-3 w-3 text-zinc-500" />
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">// GROWTH_ADVISORY</p>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed italic">
                        {advisory?.advisory || `Market pulse suggests a 20% spike in demand for engineers with verified projects in your track. Your current trajectory is optimal.`}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 opacity-60">
                      <p className="text-[10px] font-mono text-blue-500 uppercase tracking-widest mb-2 font-bold">// TECH_OVERSIGHT</p>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        LLM validation systems are currently monitoring your mission deliverable quality. Maintain 85%+ score for priority networking unlocks.
                      </p>
                    </div>
                  </div>
                )}
              </ScrollArea>
              <div className="p-4 border-t border-zinc-800 mt-auto bg-black/20">
                <Button 
                  onClick={() => {
                    setMentorPrompt("Give me a strategic overview of my current progress and what specific skill I should double down on next to maximize market power.");
                    setActiveTab('mentor');
                  }}
                  className="w-full bg-emerald-500 text-black hover:bg-emerald-400 font-black text-[10px] uppercase tracking-[0.2em] h-10 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Open Tactical Comms
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function QuestItem({ quest, isAnalyzing, onFileSubmit }: { quest: any, isAnalyzing: boolean, onFileSubmit: (file: File) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const icon = quest.type === 'technical' ? <Target className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;

  return (
    <div className={cn(
      "p-4 rounded-xl border transition-all flex flex-col gap-4",
      quest.completed 
        ? "bg-zinc-900/30 border-zinc-800/50" 
        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center",
            quest.completed ? "bg-zinc-800 text-emerald-500" : "bg-zinc-800 text-zinc-400"
          )}>
            {quest.completed ? <CheckCircle2 className="h-4 w-4" /> : icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className={cn("text-sm font-bold leading-none", quest.completed && "text-zinc-500")}>{quest.title}</p>
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                  "p-1 rounded hover:bg-zinc-800 transition-colors",
                  isExpanded ? "text-emerald-500" : "text-zinc-500 hover:text-white"
                )}
                title="Toggle Mission Details"
              >
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 font-mono mt-1">+{quest.xp} XP REWARD</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {quest.completed ? (
            <Badge className="bg-emerald-500/20 text-emerald-500 border-0 text-[10px] py-0 px-2 h-5">VERIFIED</Badge>
          ) : (
            <>
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef}
                accept=".txt,.js,.ts,.tsx,.py,.java,.cpp,.c,.h,.css,.html,.md,.json,.sh,.sql,.yaml,.yml,image/png,image/jpeg,image/webp,.sb3"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileSubmit(file);
                }}
              />
              <Button 
                size="sm" 
                variant="outline" 
                className={cn(
                  "h-7 text-[10px] font-bold px-3 gap-2 transition-all uppercase tracking-tighter",
                  quest.feedback && !quest.completed ? "border-yellow-500/50 text-yellow-500 hover:bg-yellow-500 hover:text-black" : "border-zinc-700 hover:bg-white hover:text-black"
                )}
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : quest.feedback && !quest.completed ? (
                  <RefreshCw className="h-3 w-3" />
                ) : (
                  <FileUp className="h-3 w-3" />
                )}
                {isAnalyzing ? "ANALYZING..." : quest.feedback && !quest.completed ? "RETRY" : "SUBMIT"}
              </Button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-12 pb-2">
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Mission Intelligence:</p>
              <p className="text-xs text-emerald-500/80 font-mono leading-relaxed">
                {quest.description || "OBJECTIVE: Complete the mission based on the title. TASK: Review current chapter lectures and apply logic. DELIVERABLE: Upload your source file or screenshot."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback Column */}
      {(quest.feedback || isAnalyzing) && (
        <div className="pl-12 border-t border-zinc-800 pt-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {isAnalyzing ? (
                <Sparkles className="h-4 w-4 text-emerald-500 animate-pulse" />
              ) : quest.completed ? (
                <FileCheck className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
                {isAnalyzing ? "AI Analysis in Progress..." : "Mentor Feedback & Improvement Pointers"}
              </p>
              {!isAnalyzing && !quest.completed && quest.feedback && (
                <p className="text-[9px] text-yellow-500/80 mb-2 font-mono uppercase tracking-tight">
                  Threshold Gap Indicated. Logic score below 60% requires refinement.
                </p>
              )}
              {isAnalyzing ? (
                <div className="space-y-2">
                  <div className="h-2 w-full bg-zinc-800 rounded animate-pulse" />
                  <div className="h-2 w-2/3 bg-zinc-800 rounded animate-pulse" />
                </div>
              ) : (
                <div className={cn(
                  "text-xs leading-relaxed whitespace-pre-line",
                  quest.feedback?.startsWith('REJECTED') ? "text-yellow-400 font-medium" : "text-zinc-400"
                )}>
                  {quest.feedback || "Submit your solution file for AI verification and feedback."}
                  {quest.score > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500">QUALITY SCORE:</span>
                      <div className="h-1.5 w-24 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000",
                            quest.score >= 80 ? "bg-emerald-500" : quest.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${quest.score}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-white">{quest.score}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
