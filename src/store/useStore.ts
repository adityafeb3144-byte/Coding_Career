import { create } from 'zustand';
import { User } from 'firebase/auth';

interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  level: number;
  xp: number;
  marketPower: number;
  streak: number;
  specialization: string;
  intensity: string;
  weeklyHours: number;
  lastActive?: string | null;
  lastActivity?: any;
  lastMarketSkillAdded?: string;
}

interface AppState {
  user: User | null;
  profile: UserProfile | null;
  isAuthReady: boolean;
  activeTab: string;
  mentorPrompt: string | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setAuthReady: (ready: boolean) => void;
  setActiveTab: (tab: string) => void;
  setMentorPrompt: (prompt: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  profile: null,
  isAuthReady: false,
  activeTab: 'dashboard',
  mentorPrompt: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setAuthReady: (ready) => set({ isAuthReady: ready }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setMentorPrompt: (prompt) => set({ mentorPrompt: prompt }),
}));
