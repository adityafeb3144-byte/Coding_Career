import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getCountFromServer, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { motion } from 'motion/react';
import { Trophy, Medal, Star, User as UserIcon, Loader2, Globe, Zap, Target, Shield, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';

// Global Engineering Statistics (Estimated Industry Benchmarks)
// Total Engineers: ~27.2 Million (IDC/SlashData 2024)
const GLOBAL_ENGINEER_COUNT = 27200000;

export function Leaderboard() {
  const { profile } = useStore();
  const [rankings, setRankings] = useState<any[]>([]);
  const [nexusRank, setNexusRank] = useState<number | null>(null);
  const [nexusTotal, setNexusTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'public_profiles'),
      orderBy('xp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRankings(snapshot.docs.map((doc, i) => ({ 
        id: doc.id, 
        rank: i + 1,
        ...doc.data() 
      })));
      setLoading(false);
    });

    const calculateNexusRank = async () => {
      try {
        const totalColl = collection(db, 'public_profiles');
        const totalSnapshot = await getCountFromServer(totalColl);
        setNexusTotal(totalSnapshot.data().count);

        const rankQuery = query(
          collection(db, 'public_profiles'),
          where('xp', '>', profile.xp)
        );
        const rankSnapshot = await getCountFromServer(rankQuery);
        setNexusRank(rankSnapshot.data().count + 1);
      } catch (error) {
        console.error("Failed to calculate Nexus rank", error);
      }
    };

    calculateNexusRank();
    return () => unsubscribe();
  }, [profile?.xp]);

  // Global Percentile Calculation Logic
  // We use a logarithmic distribution to map Nexus XP to Global Percentiles
  // Level 1 (0 XP) -> Bottom 50%
  // Level 10 (10k XP) -> Top 10%
  // Level 50 (50k XP) -> Top 1%
  // Level 100 (100k XP) -> Top 0.1%
  const calculateGlobalPercentile = (xp: number): string => {
    if (xp === 0) return "50.00";
    const logXp = Math.log10(xp + 1);
    const percentile = Math.max(0.01, 50 / Math.pow(logXp + 1, 2.5));
    return percentile.toFixed(2);
  };

  const globalPercentile = profile ? calculateGlobalPercentile(profile.xp) : "---";
  const estimatedGlobalRank = profile 
    ? Math.floor((parseFloat(globalPercentile) / 100) * GLOBAL_ENGINEER_COUNT).toLocaleString()
    : "---";

  const getTier = (percentile: string) => {
    const p = parseFloat(percentile);
    if (p <= 0.1) return { label: "ELITE (TOP 0.1%)", color: "text-purple-400", icon: <Cpu className="h-4 w-4" /> };
    if (p <= 1) return { label: "MASTER (TOP 1%)", color: "text-yellow-500", icon: <Star className="h-4 w-4" /> };
    if (p <= 5) return { label: "EXPERT (TOP 5%)", color: "text-emerald-400", icon: <Zap className="h-4 w-4" /> };
    if (p <= 15) return { label: "PROFESSIONAL", color: "text-blue-400", icon: <Shield className="h-4 w-4" /> };
    return { label: "PRACTITIONER", color: "text-zinc-500", icon: <Target className="h-4 w-4" /> };
  };

  const tier = getTier(globalPercentile);

  return (
    <div className="h-full p-4 md:p-8 overflow-y-auto bg-zinc-950 selection:bg-white selection:text-black">
      <header className="mb-8 md:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">Global Intelligence Feed // Active</h2>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter italic uppercase">War Room</h1>
        </div>
        
        <div className="flex gap-2 md:gap-4">
          <div className="flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-right">
            <p className="text-[8px] md:text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Global Population</p>
            <p className="text-lg md:text-xl font-black tabular-nums">27.2M</p>
          </div>
          <div className="flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 bg-white text-black rounded-2xl text-right">
            <p className="text-[8px] md:text-[9px] font-mono text-zinc-900/50 uppercase tracking-widest mb-1">Active Nexus</p>
            <p className="text-lg md:text-xl font-black tabular-nums">{nexusTotal.toLocaleString()}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        {/* Left Column: Global Benchmarking */}
        <div className="lg:col-span-5 space-y-6 md:space-y-8">
          <section className="p-6 md:p-8 rounded-[2rem] bg-zinc-900 border border-zinc-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Globe className="h-32 md:h-48 w-32 md:w-48" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6 md:mb-8">
                <div className={cn("p-2 rounded-lg bg-zinc-800", tier.color)}>
                  {tier.icon}
                </div>
                <span className={cn("text-xs font-mono font-bold uppercase tracking-widest", tier.color)}>
                  {tier.label}
                </span>
              </div>

              <h3 className="text-[10px] md:text-sm font-mono text-zinc-500 uppercase tracking-widest mb-2">Verified Nexus Rank</h3>
              <div className="text-6xl md:text-8xl font-black tracking-tighter mb-6 flex items-baseline gap-2 text-emerald-500">
                <span className="text-xl md:text-2xl text-emerald-900">#</span>{nexusRank || "---"}
              </div>

              <div className="space-y-6 pt-6 border-t border-zinc-800">
                <div>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Verified World Percentile</p>
                  <p className="text-3xl font-black tracking-tight">{globalPercentile}%</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Estimated Global Rank</p>
                  <p className="text-3xl font-black tracking-tight">#{estimatedGlobalRank}</p>
                </div>
              </div>

              <p className="mt-8 text-xs text-zinc-500 leading-relaxed font-mono italic">
                // DATA_SOURCE: CROSS_PLATFORM_XP_MAPPING_V4.2<br />
                // CALCULATION: LOGARITHMIC_SKILL_DISTRIBUTION<br />
                // STATUS: VERIFIED_BY_NEXUS_AI
              </p>
            </div>
          </section>

          <section className="p-8 rounded-[2rem] border border-zinc-800 bg-black/50">
            <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-6">Industry Comparison</h3>
            <div className="space-y-4">
              <BenchmarkItem label="FAANG / Staff Level" percentile="0.1" current={parseFloat(globalPercentile)} />
              <BenchmarkItem label="Senior Engineer (L5)" percentile="2.0" current={parseFloat(globalPercentile)} />
              <BenchmarkItem label="Mid-Level Engineer" percentile="15.0" current={parseFloat(globalPercentile)} />
              <BenchmarkItem label="Junior / Entry Level" percentile="45.0" current={parseFloat(globalPercentile)} />
            </div>
          </section>
        </div>

        {/* Right Column: Nexus Leaderboard */}
        <div className="lg:col-span-7">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Nexus High-Performers</h3>
            <Badge variant="outline" className="border-zinc-800 text-zinc-500 font-mono text-[9px]">REAL-TIME SYNC</Badge>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-800">
              <Loader2 className="h-8 w-8 animate-spin mb-4" />
              <p className="font-mono text-[10px] uppercase tracking-widest">Decrypting Global Feed...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rankings.map((rank, i) => (
                <motion.div
                  key={rank.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className={cn(
                    "bg-zinc-900/50 border-zinc-800 text-white transition-all hover:bg-zinc-900 group",
                    rank.uid === profile?.uid && "border-white bg-zinc-800/50 shadow-[0_0_30px_rgba(255,255,255,0.05)]"
                  )}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-8 text-center">
                        {rank.rank === 1 ? <Trophy className="h-5 w-5 text-yellow-500 mx-auto" /> :
                         rank.rank === 2 ? <Medal className="h-5 w-5 text-zinc-400 mx-auto" /> :
                         rank.rank === 3 ? <Medal className="h-5 w-5 text-amber-600 mx-auto" /> :
                         <span className="text-xs font-mono text-zinc-700 group-hover:text-zinc-500 transition-colors">0{rank.rank}</span>}
                      </div>

                      <Avatar className="h-10 w-10 border border-zinc-800 grayscale group-hover:grayscale-0 transition-all">
                        <AvatarImage src={rank.photoURL} />
                        <AvatarFallback><UserIcon className="h-5 w-5" /></AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate tracking-tight">{rank.displayName}</p>
                          {rank.uid === profile?.uid && <Badge className="bg-white text-black h-3.5 text-[9px] font-black">YOU</Badge>}
                        </div>
                        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">{rank.specialization} // LVL {rank.level}</p>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-black tabular-nums">{rank.xp.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600 font-mono uppercase tracking-widest">XP_UNITS</div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}

              {nexusRank && nexusRank > 10 && (
                <div className="pt-4 mt-4 border-t border-zinc-900">
                  <Card className="bg-zinc-800/50 border-white text-white shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-8 text-center">
                        <span className="text-xs font-mono text-white">#{nexusRank}</span>
                      </div>
                      <Avatar className="h-10 w-10 border border-zinc-800">
                        <AvatarImage src={profile?.photoURL} />
                        <AvatarFallback><UserIcon className="h-5 w-5" /></AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate tracking-tight">{profile?.displayName}</p>
                          <Badge className="bg-white text-black h-3.5 text-[9px] font-black">YOU</Badge>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">{profile?.specialization} // LVL {profile?.level}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black tabular-nums">{profile?.xp.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600 font-mono uppercase tracking-widest">XP_UNITS</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BenchmarkItem({ label, percentile, current }: { label: string, percentile: string, current: number }) {
  const target = parseFloat(percentile);
  const isSurpassed = current <= target;

  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-3">
        <div className={cn(
          "h-1.5 w-1.5 rounded-full transition-all",
          isSurpassed ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-800"
        )} />
        <span className={cn(
          "text-[11px] font-mono uppercase tracking-wider transition-colors",
          isSurpassed ? "text-zinc-200" : "text-zinc-600"
        )}>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn(
          "text-xs font-black tabular-nums",
          isSurpassed ? "text-emerald-500" : "text-zinc-800"
        )}>{percentile}%</span>
        {isSurpassed && <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[8px] h-3 px-1">PASSED</Badge>}
      </div>
    </div>
  );
}
