import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { collection, query, onSnapshot, doc, updateDoc, increment, addDoc, serverTimestamp, getDocs, deleteDoc, writeBatch, getCountFromServer, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, calculateStreak } from '../lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Target, Award, TrendingUp, Clock, Flame, Sparkles, MessageSquare, CheckCircle2, Trophy, Globe, RefreshCw, FileUp, FileCheck, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateDailyQuests, generateInitialRoadmap, analyzeQuestSubmission } from '../lib/gemini';

export function Dashboard() {
  const { profile, setActiveTab, setMentorPrompt } = useStore();
  const [quests, setQuests] = useState<any[]>([]);
  const [loadingQuests, setLoadingQuests] = useState(false);
  const [isInitializingRoadmap, setIsInitializingRoadmap] = useState(false);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [currentChapter, setCurrentChapter] = useState<any>(null);
  const [hasRoadmap, setHasRoadmap] = useState<boolean | null>(null);
  const [xpGain, setXpGain] = useState<{ amount: number, id: string } | null>(null);
  const [analyzingQuestId, setAnalyzingQuestId] = useState<string | null>(null);
  const isGeneratingRef = useRef(false);

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

    // Fetch Rank
    const fetchRank = async () => {
      try {
        const rankQuery = query(
          collection(db, 'public_profiles'),
          where('xp', '>', profile.xp)
        );
        const rankSnapshot = await getCountFromServer(rankQuery);
        setUserRank(rankSnapshot.data().count + 1);
      } catch (error) {
        console.error("Failed to fetch rank", error);
      }
    };
    fetchRank();

    return () => {
      unsubscribe();
      unsubscribeRoadmap();
    };
  }, [profile?.xp]); // Re-fetch rank when XP changes

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

  const handleCompleteQuest = async (questId: string, xp: number = 100, feedback: string = '', score: number = 0) => {
    if (!profile) return;
    
    // Ensure xp is a valid number
    const rewardXp = typeof xp === 'number' ? xp : 100;

    try {
      const batch = writeBatch(db);
      
      // Streak Logic
      const { newStreak, shouldUpdate: shouldUpdateStreak } = calculateStreak(profile.lastActive, profile.streak || 0);

      batch.set(doc(db, 'users', profile.uid, 'daily_quests', questId), {
        completed: true,
        feedback,
        score,
        completedAt: serverTimestamp()
      }, { merge: true });
      
      const userUpdate: any = {
        xp: increment(rewardXp),
        lastActive: new Date().toISOString()
      };
      if (shouldUpdateStreak) {
        userUpdate.streak = newStreak;
      }

      batch.set(doc(db, 'users', profile.uid), userUpdate, { merge: true });

      batch.set(doc(db, 'public_profiles', profile.uid), {
        xp: increment(rewardXp)
      }, { merge: true });

      await batch.commit();

      // Optimistically update store profile
      useStore.getState().setProfile({
        ...profile,
        xp: profile.xp + rewardXp,
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
      // Read file content
      const reader = new FileReader();
      const fileContent = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      });

      // Analyze with AI
      const analysis = await analyzeQuestSubmission(quest.title, fileContent, file.name);
      
      if (analysis.isComplete) {
        await handleCompleteQuest(quest.id, quest.xp, analysis.feedback, analysis.score);
      } else {
        // Just update feedback if not complete
        await updateDoc(doc(db, 'users', profile.uid, 'daily_quests', quest.id), {
          feedback: analysis.feedback,
          score: analysis.score
        });
      }
    } catch (error) {
      console.error("Quest analysis failed", error);
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
        batch.update(profileRef, { xp: 0, level: 1, specialization: 'Software + Cloud + AI' });
        batch.update(userRef, { xp: 0, level: 1, specialization: 'Software + Cloud + AI' });
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

  const calculateGlobalPercentile = (xp: number): string => {
    if (xp === 0) return "50.00";
    const logXp = Math.log10(xp + 1);
    const percentile = Math.max(0.01, 50 / Math.pow(logXp + 1, 2.5));
    return percentile.toFixed(2);
  };

  const globalPercentile = calculateGlobalPercentile(profile.xp);

  return (
    <div className="h-full p-4 md:p-8 overflow-y-auto bg-zinc-950">
      <header className="mb-6 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.h2 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-mono text-zinc-500 uppercase tracking-widest mb-1"
          >
            System Status: Operational // Global Sync Active
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
                  Nexus Rank
                </div>
                <div className="text-xl font-black text-white">#{userRank || '---'}</div>
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

        {/* Specialization Card */}
        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Trajectory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">{profile.specialization} Engineer</div>
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              {profile.intensity.toUpperCase()} INTENSITY
            </Badge>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Quests */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              DAILY QUESTS
            </h3>
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn(
                "text-xs text-zinc-500 hover:text-white",
                quests.some(q => !q.completed) && quests.length > 0 && "opacity-50 cursor-not-allowed"
              )}
              onClick={() => generateNewQuests()}
              disabled={loadingQuests || (quests.some(q => !q.completed) && quests.length > 0)}
            >
              {loadingQuests ? "GENERATING..." : "REFRESH"}
            </Button>
          </div>
          {quests.length > 0 && quests.every(q => q.completed) ? (
            <p className="text-[10px] text-emerald-500 mb-2 font-bold flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              ALL MISSIONS COMPLETE. REFRESH UNLOCKED.
            </p>
          ) : quests.some(q => !q.completed) && quests.length > 0 && (
            <p className="text-[10px] text-zinc-600 mb-2 italic">Complete all missions to unlock refresh.</p>
          )}
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
                <p className="text-zinc-500 text-sm">No quests active. Initializing...</p>
              </div>
            )}
          </div>
        </section>

        {/* Market Intelligence */}
        <section>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            MARKET INTELLIGENCE
          </h3>
          <Card className="bg-zinc-900 border-zinc-800 text-white">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">RUST ADOPTION SURGE</p>
                    <p className="text-xs text-zinc-500">Big Tech is shifting core services to Rust. Consider adding 'Memory Safety' to your roadmap.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Target className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">LLM AGENT DEMAND</p>
                    <p className="text-xs text-zinc-500">Startups are prioritizing engineers who can build autonomous agents. New nodes available in AI branch.</p>
                  </div>
                </div>
                <Button 
                  onClick={handleAnalyzeMarket}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-6 rounded-xl"
                >
                  <Sparkles className="mr-2 h-5 w-5" />
                  ANALYZE MARKET & UPDATE ROADMAP
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const icon = quest.type === 'technical' ? <Target className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;

  return (
    <div className={cn(
      "flex flex-col p-4 rounded-xl border transition-all gap-4",
      quest.completed 
        ? "bg-zinc-900/30 border-zinc-800/50" 
        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center",
            quest.completed ? "bg-zinc-800 text-emerald-500" : "bg-zinc-800 text-zinc-400"
          )}>
            {quest.completed ? <CheckCircle2 className="h-4 w-4" /> : icon}
          </div>
          <div>
            <p className={cn("text-sm font-bold", quest.completed && "text-zinc-500")}>{quest.title}</p>
            <p className="text-xs text-zinc-500">+{quest.xp} XP</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {quest.completed ? (
            <Badge className="bg-emerald-500/20 text-emerald-500 border-0">VERIFIED</Badge>
          ) : (
            <>
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileSubmit(file);
                }}
              />
              <Button 
                size="sm" 
                variant="outline" 
                className="border-zinc-700 h-8 text-xs hover:bg-white hover:text-black gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <FileUp className="h-3 w-3" />
                )}
                {isAnalyzing ? "ANALYZING..." : "ATTACH SOLUTION"}
              </Button>
            </>
          )}
        </div>
      </div>

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
              {isAnalyzing ? (
                <div className="space-y-2">
                  <div className="h-2 w-full bg-zinc-800 rounded animate-pulse" />
                  <div className="h-2 w-2/3 bg-zinc-800 rounded animate-pulse" />
                </div>
              ) : (
                <div className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">
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
