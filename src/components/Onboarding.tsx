import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { motion } from 'motion/react';
import { generateInitialRoadmap } from '../lib/gemini';

export function Onboarding() {
  const { user, setProfile } = useStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [specialization, setSpecialization] = useState('SWE');
  const [intensity, setIntensity] = useState('balanced');

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
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

      await setDoc(doc(db, 'users', user.uid), profileData);
      
      // Write to public profiles for leaderboard
      await setDoc(doc(db, 'public_profiles', user.uid), {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        level: 1,
        xp: 0,
        specialization: specialization
      });
      
      // Generate initial roadmap nodes
      const nodes = await generateInitialRoadmap(specialization, intensity);
      for (const node of nodes) {
        await setDoc(doc(db, 'users', user.uid, 'roadmap', node.id), {
          ...node,
          status: node.dependencies.length === 0 ? 'available' : 'locked'
        });
      }

      setProfile(profileData as any);
    } catch (error) {
      console.error("Onboarding failed", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
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
