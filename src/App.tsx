/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db, signInWithGoogle, googleProvider, OperationType, handleFirestoreError, checkConnection } from './lib/firebase';
import { useStore } from './store/useStore';
import { Dashboard } from '@/src/components/Dashboard';
import { Roadmap } from '@/src/components/Roadmap';
import { Opportunities } from '@/src/components/Opportunities';
import { Mentor } from '@/src/components/Mentor';
import { Leaderboard } from '@/src/components/Leaderboard';
import { Interview } from '@/src/components/Interview';
import { Onboarding } from '@/src/components/Onboarding';
import { PathSequencer } from '@/src/components/PathSequencer';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layout, LayoutDashboard, Map, MessageSquare, Trophy, LogOut, User as UserIcon, Zap, Sparkles, AlertCircle, CheckCircle2, Globe, Menu, X, Briefcase, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const { user, profile, isAuthReady, activeTab, setUser, setProfile, setAuthReady, setActiveTab } = useStore();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'testing' | 'online' | 'offline'>('testing');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const addLog = (msg: string) => {
    setDebugLogs(prev => [msg, ...prev].slice(0, 5));
    console.log(`[NexusDebug] ${msg}`);
  };

  useEffect(() => {
    const verifyConnection = async () => {
      addLog("Verifying Firebase connection...");
      const isOnline = await checkConnection();
      setConnectionStatus(isOnline ? 'online' : 'offline');
      addLog(isOnline ? "Firebase Online" : "Firebase Offline");
    };
    verifyConnection();

    // Check for redirect result on mount
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        addLog(`Redirect success: ${result.user.uid}`);
      }
    }).catch((error) => {
      addLog(`Redirect error: ${error.message}`);
      setLoginError(`Redirect error: ${error.message}`);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        addLog(`Auth state changed: User ${currentUser.uid}`);
        setLoginError(null);
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as any;
            
            // Streak Maintenance Logic
            const lastActive = data.lastActive ? new Date(data.lastActive) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (lastActive) {
              const lastDate = new Date(lastActive);
              lastDate.setHours(0, 0, 0, 0);
              
              const diffTime = Math.abs(today.getTime() - lastDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays > 1) {
                // Missed at least one full day, reset streak
                console.log(`Streak Reset: ${diffDays} days since last activity.`);
                await updateDoc(doc(db, 'users', currentUser.uid), {
                  streak: 0
                });
                data.streak = 0;
              }
            }
            
            setProfile({ ...data, uid: currentUser.uid });
          } else {
            setProfile(null);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        }
      } else {
        addLog("Auth state changed: No user");
        setProfile(null);
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setLoginError(null);
    setIsLoggingIn(true);
    addLog("Initializing Google Popup...");
    
    // Check if we are in an iframe and warn about popups
    const isIframe = window.self !== window.top;
    if (isIframe) {
      addLog("Warning: Running in iframe. Popups may be restricted.");
    }

    try {
      await signInWithGoogle();
      addLog("Popup success!");
    } catch (error: any) {
      addLog(`Login error: ${error.code}`);
      if (error.code === 'auth/popup-blocked') {
        setLoginError("Popup blocked! Please allow popups or use the 'Try Redirect' button below.");
      } else if (error.code === 'auth/unauthorized-domain') {
        setLoginError(`Domain not authorized: ${window.location.hostname}. Please check Firebase Console.`);
      } else if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("Login window was closed. Please try again.");
      } else {
        setLoginError(error.message || "An unexpected error occurred during login.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRedirectLogin = () => {
    setLoginError(null);
    setIsLoggingIn(true);
    addLog("Initializing Google Redirect...");
    try {
      signInWithRedirect(auth, googleProvider);
    } catch (error: any) {
      addLog(`Redirect init error: ${error.message}`);
      setLoginError(error.message);
      setIsLoggingIn(false);
    }
  };

  // Real-time profile sync
  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
          setProfile(doc.data() as any);
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  if (!isAuthReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-2xl font-bold tracking-tighter"
        >
          NEXUS CAREER OS
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 p-4 text-white">
        <div className="max-w-md text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 text-5xl font-black tracking-tighter"
          >
            BECOME THE TOP 1%
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8 text-zinc-400"
          >
            The ultimate AI-powered execution system for Software, Cloud, and AI Engineers.
          </motion.p>

          <div className="mb-8 flex flex-col items-center justify-center gap-2">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-mono uppercase tracking-widest",
              connectionStatus === 'online' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
              connectionStatus === 'offline' ? "bg-red-500/10 border-red-500/20 text-red-400" :
              "bg-zinc-800 border-zinc-700 text-zinc-500"
            )}>
              {connectionStatus === 'online' ? <CheckCircle2 className="h-3 w-3" /> : 
               connectionStatus === 'offline' ? <AlertCircle className="h-3 w-3" /> : 
               <Globe className="h-3 w-3 animate-spin" />}
              {connectionStatus === 'online' ? "Firebase Online" : 
               connectionStatus === 'offline' ? "Firebase Offline" : 
               "Verifying Connection..."}
            </div>
            
            <p className="text-[10px] text-zinc-500 font-mono">
              Host: {window.location.hostname}
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            <button 
              onClick={handleLogin} 
              disabled={isLoggingIn}
              className="bg-white text-black hover:bg-zinc-200 w-full py-3 px-6 rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingIn ? "Initializing..." : "Initialize OS with Google"}
            </button>

            <button 
              onClick={handleRedirectLogin} 
              disabled={isLoggingIn}
              className="border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 w-full py-2 px-4 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              Trouble with popups? Try Redirect
            </button>

            <div className="pt-4 border-t border-zinc-900">
              <p className="text-[10px] text-zinc-500 mb-2">Still having trouble?</p>
              <div className="flex items-center justify-center gap-2">
                <Button 
                  variant="link" 
                  size="sm" 
                  className="text-zinc-400 hover:text-white h-auto p-0"
                  onClick={() => window.open(window.location.href, '_blank')}
                >
                  Open OS in New Tab
                </Button>
                <span className="text-zinc-800">|</span>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="text-zinc-400 hover:text-white h-auto p-0"
                  onClick={() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                  }}
                >
                  Force Reload
                </Button>
              </div>
            </div>
            
            {loginError && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
              >
                {loginError}
              </motion.div>
            )}

            {debugLogs.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-left">
                <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-2">System Logs</p>
                <div className="space-y-1">
                  {debugLogs.map((log, i) => (
                    <p key={i} className="text-[10px] font-mono text-zinc-400 truncate">
                      <span className="text-zinc-600 mr-2">[{debugLogs.length - i}]</span>
                      {log}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono">
              Note: Ensure popups are enabled for this domain
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Onboarding />;
  }

  return (
    <div className="flex h-[100dvh] bg-zinc-950 text-white overflow-hidden flex-col md:flex-row">
      <PathSequencer />
      
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 z-50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-white flex items-center justify-center">
            <Layout className="h-5 w-5 text-black" />
          </div>
          <span className="font-bold tracking-tighter text-xl">NEXUS</span>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="text-zinc-400"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </header>

      {/* Sidebar / Mobile Menu */}
      <aside className={cn(
        "fixed inset-0 z-40 md:relative md:flex md:w-64 border-r border-zinc-800 bg-zinc-900 p-6 flex-col transition-transform duration-300 md:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="hidden md:flex mb-10 items-center gap-2">
          <div className="h-8 w-8 rounded bg-white flex items-center justify-center">
            <Layout className="h-5 w-5 text-black" />
          </div>
          <span className="font-bold tracking-tighter text-xl">NEXUS</span>
        </div>

        <nav className="flex-1 space-y-2 mt-16 md:mt-0">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} 
            icon={<LayoutDashboard className="h-5 w-5" />} 
            label="Command Center" 
          />
          <NavItem 
            active={activeTab === 'roadmap'} 
            onClick={() => { setActiveTab('roadmap'); setIsMobileMenuOpen(false); }} 
            icon={<Map className="h-5 w-5" />} 
            label="Skill Tree" 
          />
          <NavItem 
            active={activeTab === 'mentor'} 
            onClick={() => { setActiveTab('mentor'); setIsMobileMenuOpen(false); }} 
            icon={<MessageSquare className="h-5 w-5" />} 
            label="AI Mentor" 
          />
          <NavItem 
            active={activeTab === 'interview'} 
            onClick={() => { setActiveTab('interview'); setIsMobileMenuOpen(false); }} 
            icon={<Video className="h-5 w-5" />} 
            label="Interview Studio" 
          />
          <NavItem 
            active={activeTab === 'leaderboard'} 
            onClick={() => { setActiveTab('leaderboard'); setIsMobileMenuOpen(false); }} 
            icon={<Trophy className="h-5 w-5" />} 
            label="War Room" 
          />
          <NavItem 
            active={activeTab === 'opportunities'} 
            onClick={() => { setActiveTab('opportunities'); setIsMobileMenuOpen(false); }} 
            icon={<Briefcase className="h-5 w-5" />} 
            label="Target Opportunities" 
          />
        </nav>

        <div className="mt-6 p-4 rounded-xl bg-zinc-800/30 border border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Path Optimizer AI</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-zinc-400">Monitoring Trajectory...</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-purple-400" />
            <span className="text-[10px] text-zinc-500 italic">Market Intelligence Active</span>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-zinc-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-zinc-800 overflow-hidden">
              {user.photoURL && <img src={user.photoURL} alt="Avatar" referrerPolicy="no-referrer" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-zinc-500 truncate">LVL {profile.level}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-zinc-400 hover:text-white hover:bg-zinc-800"
            onClick={() => auth.signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Deactivate OS
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-full overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full overflow-y-auto md:overflow-hidden"
          >
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'roadmap' && <Roadmap />}
            {activeTab === 'opportunities' && <Opportunities />}
            {activeTab === 'mentor' && <Mentor />}
            {activeTab === 'interview' && <Interview />}
            {activeTab === 'leaderboard' && <Leaderboard />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active 
          ? "bg-white text-black" 
          : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
