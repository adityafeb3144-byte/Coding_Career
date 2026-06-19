import { useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { motion } from 'motion/react';
import { generateInitialRoadmap } from '../lib/gemini';
import { AlertCircle } from 'lucide-react';

function getCleanErrorMessage(err: any): string {
  if (!err) return "An unexpected error occurred.";
  const msg = err.message || String(err);
  if (msg.startsWith("{") && msg.endsWith("}")) {
    try {
      const parsed = JSON.parse(msg);
      return parsed.error || "Database operation restricted or timed out.";
    } catch (e) {
      // Ignore
    }
  }
  return msg;
}

export function Onboarding() {
  const { user, setProfile } = useStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [specialization, setSpecialization] = useState('SWE');
  const [intensity, setIntensity] = useState('balanced');
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const profileData = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        level: 1,
        xp: 0,
        streak: 0,
        specialization,
        intensity,
        weeklyHours: intensity === 'casual' ? 10 : intensity === 'balanced' ? 25 : 50,
        lastActive: new Date().toISOString(),
        lastMarketSkillAdded: new Date().toISOString(),
        skillLevels: { swe: 1, cloud: 1, ai: 1 }
      };

      // 1. Fetch the initial structure BEFORE altering the Firestore databases
      // This guarantees that any slow/failing API calls happen while the user is still on the onboarding screen
      const nodes = await generateInitialRoadmap(specialization, intensity);

      if (!nodes || nodes.length === 0) {
        throw new Error("Could not generate roadmap structure. Please try again.");
      }

      // 2. Build and commit and atomic single-request Write Batch
      const batch = writeBatch(db);

      // Write private user document
      const userRef = doc(db, 'users', user.uid);
      batch.set(userRef, profileData);
      
      // Write public profiles for leaderboard
      const publicRef = doc(db, 'public_profiles', user.uid);
      batch.set(publicRef, {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        level: 1,
        xp: 0,
        marketPower: 0,
        specialization: specialization
      });
      
      // Write all hierarchical learning nodes in the same chunk
      for (const node of nodes) {
        const nodeRef = doc(db, 'users', user.uid, 'roadmap', node.id);
        batch.set(nodeRef, {
          ...node,
          status: node.dependencies.length === 0 ? 'available' : 'locked'
        });
      }

      // 3. Commit atomically so that everything is created in an instant!
      await batch.commit();

      setProfile(profileData as any);
    } catch (err: any) {
      console.error("Onboarding failed", err);
      const cleanMsg = getCleanErrorMessage(err);
      setError(cleanMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-white">
      <Card className="w-full max-w-lg border-zinc-800 bg-zinc-900 text-white shadow-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl md:text-2xl font-bold tracking-tighter uppercase">Initializing Nexus OS</CardTitle>
          <CardDescription className="text-zinc-400 text-xs md:text-sm">Step {step} of 2: Configure your career trajectory.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-6">
          {error && (
            <div className="p-4 bg-red-950/40 border border-red-500/50 rounded-xl flex items-start gap-3 text-red-300 text-sm animate-in fade-in duration-300">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-400" />
              <div>
                <p className="font-bold uppercase tracking-tight text-red-200">Device Initialization Critical Exception</p>
                <p className="text-xs text-red-300/80 leading-relaxed mt-0.5">{error}</p>
                <button 
                  onClick={handleComplete} 
                  className="mt-2 text-xs font-bold underline hover:text-white uppercase tracking-wider"
                >
                  Force Retry Code Injection
                </button>
              </div>
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-4">
              <Label className="text-lg font-medium">Select your primary specialization</Label>
              <RadioGroup value={specialization} onValueChange={setSpecialization} className="grid grid-cols-1 gap-4">
                <SpecializationOption 
                  value="SWE" 
                  title="Software Engineer" 
                  desc="Focus on core architecture, systems, and fullstack mastery." 
                />
                <SpecializationOption 
                  value="Cloud" 
                  title="Cloud Engineer" 
                  desc="Master AWS/GCP, Kubernetes, and distributed infrastructure." 
                />
                <SpecializationOption 
                  value="AI" 
                  title="AI Engineer" 
                  desc="Deep dive into LLMs, PyTorch, and AI deployment." 
                />
              </RadioGroup>
              <Button className="w-full mt-4" onClick={() => setStep(2)}>Next Step</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Label className="text-lg font-medium">Choose your execution intensity</Label>
              <RadioGroup value={intensity} onValueChange={setIntensity} className="grid grid-cols-1 gap-4">
                <IntensityOption 
                  value="casual" 
                  title="Casual (10h/week)" 
                  desc="Sustainable progress for busy professionals." 
                />
                <IntensityOption 
                  value="balanced" 
                  title="Balanced (25h/week)" 
                  desc="The standard path for rapid growth." 
                />
                <IntensityOption 
                  value="intense" 
                  title="Intense (50h/week)" 
                  desc="Full-time bootcamp mode for maximum speed." 
                />
              </RadioGroup>
              <div className="flex gap-4 mt-4">
                <Button variant="outline" className="flex-1 border-zinc-800" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" onClick={handleComplete} disabled={loading}>
                  {loading ? "Generating Roadmap..." : "Activate OS"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SpecializationOption({ value, title, desc }: { value: string, title: string, desc: string }) {
  return (
    <div className="flex items-center space-x-2 rounded-lg border border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors">
      <RadioGroupItem value={value} id={value} />
      <Label htmlFor={value} className="flex-1 cursor-pointer">
        <div className="font-bold">{title}</div>
        <div className="text-xs text-zinc-500">{desc}</div>
      </Label>
    </div>
  );
}

function IntensityOption({ value, title, desc }: { value: string, title: string, desc: string }) {
  return (
    <div className="flex items-center space-x-2 rounded-lg border border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors">
      <RadioGroupItem value={value} id={value} />
      <Label htmlFor={value} className="flex-1 cursor-pointer">
        <div className="font-bold">{title}</div>
        <div className="text-xs text-zinc-500">{desc}</div>
      </Label>
    </div>
  );
}
