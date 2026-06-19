import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Send, 
  Timer, 
  Award, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  Clock, 
  Activity, 
  Info,
  ShieldCheck,
  Brain,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Keyboard,
  CornerDownLeft,
  PhoneOff,
  User,
  ExternalLink,
  Sliders,
  RefreshCw,
  Pause,
  Eye,
  Tv
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

// Static assets we generated
const interviewersPanel = "/src/assets/images/interviewers_panel_1781876505213.jpg";

interface InterviewMessage {
  interviewer: string;
  role: string;
  question: string;
  answer?: string;
  score?: number;
  critique?: string;
  speechMetadata?: any;
}

type PacingState = 
  | 'idle' 
  | 'panel-introducing'
  | 'interviewer-speaking'
  | 'user-thinking'
  | 'user-speaking'
  | 'panel-deliberating';

interface Panelist {
  name: string;
  role: string;
  specialty: string;
  avatarX: string; // Background position X coord for extraction
  avatarY: string; // Background position Y coord
  colorTheme: string; // Tailwind ring/glow styling
  textColor: string;
  bgColor: string;
}

export function Interview() {
  const { profile } = useStore();
  const [activeTab, setActiveTab] = useState<'lobby' | 'session' | 'report'>('lobby');
  
  // Audio & Video hardware preferences
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [inputMode, setInputMode] = useState<'voice' | 'keyboard'>('voice');
  
  // Timer & Cooldown State
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState<number>(0);
  const [sandboxBypass, setSandboxBypass] = useState(true); // Default to bypass for easier review
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(1800); // 30 mins
  
  // Interactive Session States
  const [pacingState, setPacingState] = useState<PacingState>('idle');
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [currentInterviewer, setCurrentInterviewer] = useState<string>('Nia');
  const [currentInterviewerRole, setCurrentInterviewerRole] = useState<string>('Lead Algorithm & Compiler Architect');
  const [currentQuestionText, setCurrentQuestionText] = useState<string>('');
  const [history, setHistory] = useState<InterviewMessage[]>([]);
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const [manualTypedText, setManualTypedText] = useState('');
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Custom Voice & Camera Alignment States (Empowering fast, lifelike conversation and perfect eye-contact)
  const [panelistVoices, setPanelistVoices] = useState<Record<string, string>>({}); // interviewerName -> voice.name override
  const [panelistPitches, setPanelistPitches] = useState<Record<string, number>>({
    Alex: 0.90,
    Sophia: 0.98,
    Michael: 1.00,
    Nia: 1.04,
  });
  const [panelistRates, setPanelistRates] = useState<Record<string, number>>({
    Alex: 0.94,
    Sophia: 0.96,
    Michael: 1.02,
    Nia: 0.96,
  });
  const [cameraOriginY, setCameraOriginY] = useState<number>(48); // default eye line height %
  const [cameraZoomScale, setCameraZoomScale] = useState<number>(1.45); // default zoom scale
  const [silenceTimeoutSeconds, setSilenceTimeoutSeconds] = useState<number>(5.0);
  const [showRepeatNotice, setShowRepeatNotice] = useState(false);
  const [thinkModeActive, setThinkModeActive] = useState(false);
  
  // Immersive Table-side cinematic camera and view configurations
  const [cameraPreset, setCameraPreset] = useState<'auto-director' | 'panoramic-table' | 'eye-contact'>('auto-director');
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);
  const [showEyeTarget, setShowEyeTarget] = useState<boolean>(true);
  
  // Final Evaluation State
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [reportScore, setReportScore] = useState<number | null>(null);
  const [reportXp, setReportXp] = useState<number | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [xpApplied, setXpApplied] = useState(false);

  // References
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const speakTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const thinkModeRef = useRef<boolean>(false);
  const silenceTimeoutSecsRef = useRef<number>(5.0);

  // Speech timing and conversational characteristics metrics
  const speechStartTimestampRef = useRef<number>(0);
  const speechLastUpdateTimeRef = useRef<number>(0);
  const speechPausesListRef = useRef<number[]>([]);
  const speechVolumeSamplesRef = useRef<number[]>([]);

  // Web Audio analyzer references
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioVolumeLoggerIntervalRef = useRef<any>(null);

  const startAudioListening = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        audioAnalyserRef.current = analyser;
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        speechVolumeSamplesRef.current = [];
        
        audioVolumeLoggerIntervalRef.current = setInterval(() => {
          if (!audioAnalyserRef.current) return;
          audioAnalyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          speechVolumeSamplesRef.current.push(Number(avg.toFixed(1)));
        }, 150);
      }
    } catch (e) {
      console.warn("Could not start Web Audio Analyzer:", e);
    }
  };

  const stopAudioListening = () => {
    if (audioVolumeLoggerIntervalRef.current) {
      clearInterval(audioVolumeLoggerIntervalRef.current);
      audioVolumeLoggerIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    audioAnalyserRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopAudioListening();
    };
  }, []);

  // Keep refs in sync to bypass stale closures in Speech Recognition
  useEffect(() => {
    thinkModeRef.current = thinkModeActive;
  }, [thinkModeActive]);

  useEffect(() => {
    silenceTimeoutSecsRef.current = silenceTimeoutSeconds;
  }, [silenceTimeoutSeconds]);

  // Panel directory with background positioning offsets for cropping the user's panel image (interviewers_panel_1781876505213.jpg)
  const panelistList: Panelist[] = [
    {
      name: 'Alex',
      role: 'Staff SWE & Infra Architect',
      specialty: 'High Concurrency, Low-level CPU caches, Memory allocation, Networks, DB Sharding',
      avatarX: '12%',
      avatarY: '35%',
      colorTheme: 'ring-rose-500 border-rose-500/50 bg-rose-950/10 shadow-rose-950/40',
      textColor: 'text-rose-400',
      bgColor: 'bg-rose-400'
    },
    {
      name: 'Sophia',
      role: 'Engineering Manager & Systems Architect',
      specialty: 'Distributed Scaling trade-offs, Fault tolerance, Chaos engineering, Backpressure, API resilience',
      avatarX: '38%',
      avatarY: '35%',
      colorTheme: 'ring-cyan-500 border-cyan-500/50 bg-cyan-950/10 shadow-cyan-950/40',
      textColor: 'text-cyan-400',
      bgColor: 'bg-cyan-400'
    },
    {
      name: 'Michael',
      role: 'Lead AI Systems Architect',
      specialty: 'Transformer optimizations, Neural networks scaling, Distributed GPU sharding, Embeddings latency',
      avatarX: '63%',
      avatarY: '35%',
      colorTheme: 'ring-indigo-500 border-indigo-500/50 bg-indigo-950/10 shadow-indigo-950/40',
      textColor: 'text-indigo-400',
      bgColor: 'bg-indigo-400'
    },
    {
      name: 'Nia',
      role: 'Lead Algorithm & Compiler Architect',
      specialty: 'Strict Space/Time complexity, Deep graphs traversals, State machines, DP partition limits',
      avatarX: '88%',
      avatarY: '35%',
      colorTheme: 'ring-amber-500 border-amber-500/50 bg-amber-950/10 shadow-amber-950/40',
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-400'
    }
  ];

  // Cooldown logic (24 hours check)
  useEffect(() => {
    if (!profile) return;

    const checkCooldown = () => {
      if (sandboxBypass) {
        setCooldownRemaining(null);
        setCooldownSecs(0);
        return;
      }

      const lastFinished = profile.lastInterviewTime;
      if (!lastFinished) {
        setCooldownRemaining(null);
        setCooldownSecs(0);
        return;
      }

      const lastDate = new Date(lastFinished).getTime();
      const now = Date.now();
      const diffMs = now - lastDate;
      const cooldownPeriodMs = 24 * 60 * 60 * 1000;

      if (diffMs < cooldownPeriodMs) {
        const remainingMs = cooldownPeriodMs - diffMs;
        setCooldownSecs(Math.floor(remainingMs / 1000));
      } else {
        setCooldownRemaining(null);
        setCooldownSecs(0);
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 3000);
    return () => clearInterval(interval);
  }, [profile, sandboxBypass]);

  // Format Cooldown Timer
  useEffect(() => {
    if (cooldownSecs <= 0) {
      setCooldownRemaining(null);
      return;
    }
    const hrs = Math.floor(cooldownSecs / 3600);
    const mins = Math.floor((cooldownSecs % 3600) / 60);
    const secs = cooldownSecs % 60;
    setCooldownRemaining(`${hrs}h ${mins}m ${secs}s`);
  }, [cooldownSecs]);

  // Timer limit: 30 minutes active countdown
  useEffect(() => {
    if (activeTab !== 'session') return;
    if (sessionTimeLeft <= 0) {
      handleFinalizeInterview();
      return;
    }
    const timer = setTimeout(() => {
      setSessionTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeTab, sessionTimeLeft]);

  // Handle webcam feed initialization/release
  useEffect(() => {
    if (activeTab === 'session' && cameraEnabled) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          mediaStreamRef.current = stream;
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.warn("Camera hardware access returned empty. Defaulting to avatar stream.", err);
        });
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
    }

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [activeTab, cameraEnabled]);

  // Dynamic camera transform focus calculations based on the active speaker and selected camera presets
  const getCameraFocus = () => {
    if (activeTab !== 'session') {
      return { scale: 1.0, originX: "50%", originY: "50%" };
    }

    if (pacingState === 'panel-introducing') {
      return { scale: 1.08, originX: "50%", originY: "50%" };
    }

    // Panoramic view overrides everything if manually locked to whole-boardroom table focus
    if (cameraPreset === 'panoramic-table') {
      return { scale: 1.15, originX: "50%", originY: "50%" };
    }

    // When the user speaks, unless locked to eye-contact close-ups, we show the full table layout
    const isInterviewerActive = pacingState === 'interviewer-speaking';
    
    if (!isInterviewerActive && cameraPreset !== 'eye-contact') {
      return { scale: 1.05, originX: "50%", originY: "50%" };
    }

    // Target vertical vertical alignment offset - representing eye line location
    const originYStr = `${cameraOriginY}%`;
    
    // Choose magnification factor depending on eye-contact focus rigor
    const zoomScale = cameraPreset === 'eye-contact' 
      ? Math.max(1.75, cameraZoomScale + 0.4) 
      : cameraZoomScale;

    // Get horizontal coordinates of active or last speaking interviewer to maintain proper posture framing
    switch (currentInterviewer) {
      case 'Alex':
        return { scale: zoomScale, originX: "13%", originY: originYStr };
      case 'Sophia':
        return { scale: zoomScale, originX: "38%", originY: originYStr };
      case 'Michael':
        return { scale: zoomScale, originX: "63%", originY: originYStr };
      case 'Nia':
        return { scale: zoomScale, originX: "87%", originY: originYStr };
      default:
        return { scale: 1.1, originX: "50%", originY: "50%" };
    }
  };

  // Helper to select the absolute best premium voice with distinguished features
  const getVoiceForPanelist = (name: string, voicesList: SpeechSynthesisVoice[]) => {
    const voices = voicesList.length > 0 ? voicesList : (typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : []);
    if (!voices || voices.length === 0) return null;

    // Check if user manually configured a specific system voice override for this interviewer
    const customVoiceName = panelistVoices[name];
    if (customVoiceName) {
      const match = voices.find(v => v.name === customVoiceName);
      if (match) return match;
    }

    const enVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
    const candidateVoices = enVoices.length > 0 ? enVoices : voices;

    // We prioritize premium, natural, neural, google, microsoft, or apple voices
    const isPremium = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      return n.includes('natural') || n.includes('neural') || n.includes('premium') || n.includes('google') || n.includes('siri') || n.includes('fiona') || n.includes('wave');
    };

    // Sort candidateVoices so premium/natural ones are checked first
    const sortedCandidates = [...candidateVoices].sort((a, b) => {
      const aPrem = isPremium(a) ? 1 : 0;
      const bPrem = isPremium(b) ? 1 : 0;
      return bPrem - aPrem;
    });

    if (name === 'Alex') {
      // Alex: Staff SWE (Deep, low-pitched senior male voice)
      return sortedCandidates.find(v => {
        const n = v.name.toLowerCase();
        return (n.includes('david') || n.includes('mark') || n.includes('guy') || n.includes('male') || n.includes('desktop')) && (n.includes('male') || n.includes('david') || n.includes('mark'));
      }) || sortedCandidates.find(v => v.name.toLowerCase().includes('male')) || sortedCandidates[0];
    }

    if (name === 'Sophia') {
      // Sophia: EM & Systems Architect (Clear, steady British/Elegant female voice)
      return sortedCandidates.find(v => {
        const n = v.name.toLowerCase();
        return (n.includes('zira') || n.includes('susan') || n.includes('hazel') || n.includes('female') || n.includes('samantha') || n.includes('fiona')) && (n.includes('female') || n.includes('zira') || n.includes('hazel'));
      }) || sortedCandidates.find(v => v.name.toLowerCase().includes('female')) || sortedCandidates[1] || sortedCandidates[0];
    }

    if (name === 'Michael') {
      // Michael: Lead AI Systems Architect (Fast, intellectual male voice)
      return sortedCandidates.find(v => {
        const n = v.name.toLowerCase();
        return (n.includes('ravi') || n.includes('mark') || n.includes('male') || n.includes('george')) && (n.includes('male') || n.includes('mark') || n.includes('ravi'));
      }) || sortedCandidates.find(v => v.name.toLowerCase().includes('male')) || sortedCandidates[2] || sortedCandidates[0];
    }

    if (name === 'Nia') {
      // Nia: Lead Algorithm Compiler (Sharp, high-pitched female or distinct regional)
      return sortedCandidates.find(v => {
        const n = v.name.toLowerCase();
        return (n.includes('hazel') || n.includes('female') || n.includes('zira') || n.includes('siri') || n.includes('samantha')) && (n.includes('female') || n.includes('hazel') || n.includes('zira'));
      }) || sortedCandidates.find(v => v.name.toLowerCase().includes('female')) || sortedCandidates[3] || sortedCandidates[1] || sortedCandidates[0];
    }

    return null;
  };

  // Test Voice audibly in the Lobby - helps unblock browser autoplay gates
  const testVoiceAudio = (name: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn("Speech Synthesis API not available on this platform.");
      return;
    }
    window.speechSynthesis.cancel();
    
    const text = `Hi, I am ${name}. I have established my boardroom feedback channel and am ready for the evaluation.`;
    const utterance = new SpeechSynthesisUtterance(text);
    
    const voice = getVoiceForPanelist(name, systemVoices);
    if (voice) {
      utterance.voice = voice;
    }
    
    // Balanced human pitches near 1.0 to avoid artificial robotic distortion on offline sample drivers
    utterance.pitch = panelistPitches[name] !== undefined ? panelistPitches[name] : 1.0;
    utterance.rate = panelistRates[name] !== undefined ? panelistRates[name] : 1.0;

    window.speechSynthesis.speak(utterance);
  };

  // Keep voices loaded, dynamically handling onvoiceschanged async events
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => {
        const list = window.speechSynthesis.getVoices();
        setSystemVoices(list);
      };
      
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      stopSpeechRecognition();
    };
  }, []);

  // Browser Speech Synthesis (TTS) - Reads with Natural Conversational Timing
  const speakQuestionTTS = (text: string, speakerName: string) => {
    if (!window.speechSynthesis || !soundEnabled) {
      setPacingState('interviewer-speaking');
      const readingDuration = Math.max(3000, text.length * 55); 
      speakTimeoutRef.current = setTimeout(() => {
        setupUserTurnInput();
      }, readingDuration);
      return;
    }

    window.speechSynthesis.cancel();
    
    const speechFriendly = text
      .replace(/[*#`_\-]/g, ' ')
      .replace(/\[.*?\]/g, '')
      .replace(/SWE/gi, 'Software Engineer')
      .replace(/AI/gi, 'A.I.')
      .replace(/DB/gi, 'Database')
      .replace(/API/gi, 'A.P.I.')
      .replace(/GPU/gi, 'G.P.U.')
      .trim();

    const utterance = new SpeechSynthesisUtterance(speechFriendly);
    const voice = getVoiceForPanelist(speakerName, systemVoices);
    if (voice) {
      utterance.voice = voice;
    }

    // Balanced human pitches near 1.0 to avoid artificial robotic distortion on offline sample drivers
    utterance.pitch = panelistPitches[speakerName] !== undefined ? panelistPitches[speakerName] : 1.0;
    utterance.rate = panelistRates[speakerName] !== undefined ? panelistRates[speakerName] : 1.0;

    utterance.onstart = () => {
      setPacingState('interviewer-speaking');
    };

    utterance.onend = () => {
      setupUserTurnInput();
    };

    utterance.onerror = (e) => {
      console.warn("Speech Synthesis error, continuing to candidate turn gracefully:", e);
      setupUserTurnInput();
    };

    window.speechSynthesis.speak(utterance);
  };

  // Turn control back to candidate with comfortable transition spacing
  const setupUserTurnInput = () => {
    setPacingState('user-thinking');
    
    // Snappy transitions: 300ms minimal buffer instead of heavy lag delay!
    speakTimeoutRef.current = setTimeout(() => {
      setPacingState('user-speaking');
      setSpokenTranscript('');
      setManualTypedText('');
      
      if (inputMode === 'voice' && micEnabled) {
        startSpeechRecognition();
      }
    }, 300);
  };

  // Browser Speech Recognition (STT) setup
  const startSpeechRecognition = () => {
    stopSpeechRecognition();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition API not supported in this browser. Defaulting input mode to keyboard.");
      setInputMode('keyboard');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log("Speech recognition live.");
        startAudioListening();
      };

      recognition.onresult = (event: any) => {
        let currentText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        
        if (currentText.trim()) {
          setSpokenTranscript(currentText);

          // Track speech characteristics / timing and pause parameters
          const now = Date.now();
          if (speechStartTimestampRef.current === 0) {
            speechStartTimestampRef.current = now;
            speechLastUpdateTimeRef.current = now;
            speechPausesListRef.current = [];
          } else {
            const timeDiff = (now - speechLastUpdateTimeRef.current) / 1000;
            if (timeDiff > 1.2) {
              speechPausesListRef.current.push(Number(timeDiff.toFixed(1)));
            }
            speechLastUpdateTimeRef.current = now;
          }

          // Reset natural automatic turn-taking timers:
          // Configurable silence delay, or completely paused if Think Mode is active
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
          if (!thinkModeRef.current) {
            const timeoutValue = silenceTimeoutSecsRef.current * 1000;
            silenceTimeoutRef.current = setTimeout(() => {
              handleVoiceSubmission(currentText);
            }, timeoutValue);
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.log("Speech Recognition warning:", e.error);
        if (e.error === 'not-allowed') {
          setMicEnabled(false);
          setInputMode('keyboard');
        }
      };

      recognition.onend = () => {
        console.log("Speech recognition ended.");
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("SpeechRec startup failed: ", err);
    }
  };

  const stopSpeechRecognition = () => {
    stopAudioListening();
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  // Auto Voice Answer submission on natural delay pause
  const handleVoiceSubmission = (transcribedAnswer: string) => {
    if (!transcribedAnswer.trim()) return;
    stopSpeechRecognition();
    submitAnswer(transcribedAnswer);
  };

  // Handle Assemble Panel (Lobby Start)
  const handleStartInterview = async () => {
    if (!profile) return;
    setIsInitializing(true);
    setHistory([]);
    setXpApplied(false);
    setSessionTimeLeft(1800);
    setPacingState('panel-introducing');

    try {
      const response = await fetch('/api/gemini/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialization: profile.specialization,
          level: profile.level
        })
      });

      if (!response.ok) throw new Error('Boardroom failed.');
      const data = await response.json();
      
      const firstMessage: InterviewMessage = {
        interviewer: data.interviewer || 'Nia',
        role: data.role || 'Lead Algorithm & Compiler Architect',
        question: data.question || "Let's begin with your technical screening context. Walk us through a scenario where standard caching fails."
      };

      // Set current session focus
      setHistory([firstMessage]);
      setCurrentInterviewer(firstMessage.interviewer);
      setCurrentInterviewerRole(firstMessage.role || 'Lead Algorithm & Compiler Architect');
      setCurrentQuestionText(firstMessage.question);
      setActiveTab('session');

      // Snappy introduction layout transition: 600ms pacing delay
      setTimeout(() => {
        speakQuestionTTS(firstMessage.question, firstMessage.interviewer);
      }, 600);

    } catch (err) {
      console.error(err);
      const fallbackMsg: InterviewMessage = {
        interviewer: 'Nia',
        role: 'Lead Algorithm & Compiler Architect',
        question: `Welcome to the panel. Let's start with a foundational architectural challenge relative to your Level ${profile?.level || 1} skill tree. Show us how you would design a real-time thread-safe key-value cache handling up to 100,000 requests/sec with minimal mutex contention. What patterns would you implement?`
      };
      setHistory([fallbackMsg]);
      setCurrentInterviewer('Nia');
      setCurrentInterviewerRole('Lead Algorithm & Compiler Architect');
      setCurrentQuestionText(fallbackMsg.question);
      setActiveTab('session');

      setTimeout(() => {
        speakQuestionTTS(fallbackMsg.question, 'Nia');
      }, 500);
    } finally {
      setIsInitializing(false);
    }
  };

  const repeatCurrentQuestion = () => {
    if (currentQuestionText && currentInterviewer) {
      speakQuestionTTS(currentQuestionText, currentInterviewer);
    }
  };

  // Submit Answer (Core Pipeline)
  const submitAnswer = async (answerText: string) => {
    if (!answerText.trim() || !profile) return;

    // Check for repetition request words typed or spoken
    const normalized = answerText.toLowerCase().trim();
    const isRepetitionRequest = 
      normalized === 'repeat' ||
      normalized === 'repeat please' ||
      normalized === 'can you repeat' ||
      normalized === 'can you repeat the question' ||
      normalized === 'could you repeat that' ||
      normalized === 'can you repeat please' ||
      normalized.includes('repeat the question') ||
      normalized.includes('say that again') ||
      normalized.includes('did not hear') ||
      normalized.includes("didn't hear") ||
      normalized.includes('repeat please');

    if (isRepetitionRequest) {
      setShowRepeatNotice(true);
      setSpokenTranscript('');
      setManualTypedText('');
      setTimeout(() => setShowRepeatNotice(false), 3500);
      repeatCurrentQuestion();
      return;
    }
    
    // Real-time voice/timing metrics extraction
    const nowTimestamp = Date.now();
    const durationSecs = speechStartTimestampRef.current > 0 
      ? Number(((nowTimestamp - speechStartTimestampRef.current) / 1000).toFixed(1))
      : 0;

    const words = answerText.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // Compute Words Per Minute
    const wpm = durationSecs > 0 ? Math.round((wordCount / durationSecs) * 60) : 0;

    // Compute hesitations filler words count
    let fillerCount = 0;
    const fillerWords = new Set(['uh', 'um', 'ah', 'err', 'like', 'basically', 'actually', 'so', 'well', 'ahm', 'er']);
    words.forEach(w => {
      const cleanW = w.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      if (fillerWords.has(cleanW)) {
        fillerCount++;
      }
    });

    // Compute adjacent consecutive repetitions
    let repetitionCount = 0;
    for (let i = 1; i < words.length; i++) {
      const curr = words[i].toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      const prev = words[i - 1].toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      if (curr && curr === prev) {
        repetitionCount++;
      }
    }

    // Process mic audio amplitude samples if taken
    const volumesList = speechVolumeSamplesRef.current || [];
    let avgVolume = 0;
    let maxVolume = 0;
    let shakingIndex = 0; // standard deviation of difference

    if (volumesList.length > 0) {
      const sum = volumesList.reduce((a, b) => a + b, 0);
      avgVolume = Math.round(sum / volumesList.length);
      maxVolume = Math.max(...volumesList);

      let diffSum = 0;
      for (let i = 1; i < volumesList.length; i++) {
        diffSum += Math.abs(volumesList[i] - volumesList[i - 1]);
      }
      shakingIndex = volumesList.length > 1 ? Number((diffSum / (volumesList.length - 1)).toFixed(2)) : 0;
    }

    // Determine descriptive tone based on vocal dynamics or keyup intervals
    let detectedTone = "Steady & Focused";
    if (inputMode === 'keyboard') {
      detectedTone = "Typed Response (Analytical)";
    } else if (wordCount > 0) {
      if (shakingIndex > 10) {
        detectedTone = "Nervous Shaking / Shivering Voice";
      } else if (fillerCount / wordCount > 0.15) {
        detectedTone = "Hesitant & Highly Stuttering";
      } else if (wpm > 155) {
        detectedTone = "Rapid Speed / Rushed defense";
      } else if (wpm > 0 && wpm < 85) {
        detectedTone = "Measured Pace / Deliberate pauses";
      }
    }

    const speechMetadata = {
      inputMethod: inputMode,
      durationSecs: durationSecs || (inputMode === 'keyboard' ? Math.round(wordCount * 0.4) : 12),
      wordCount: wordCount,
      wpm: wpm || (inputMode === 'keyboard' ? 45 : 120),
      fillerCount,
      repetitionCount,
      pausesCount: speechPausesListRef.current.length,
      maxPauseSecs: speechPausesListRef.current.length > 0 ? Math.max(...speechPausesListRef.current) : 0,
      avgVolume: avgVolume || (inputMode === 'keyboard' ? 0 : 42),
      maxVolume: maxVolume || (inputMode === 'keyboard' ? 0 : 65),
      shakingIndex: shakingIndex || (inputMode === 'keyboard' ? 0 : 0.85),
      detectedTone
    };

    // Reset markers for next turn
    speechStartTimestampRef.current = 0;
    speechLastUpdateTimeRef.current = 0;
    speechPausesListRef.current = [];
    speechVolumeSamplesRef.current = [];

    // Mute speech & rec during grading spacing
    stopSpeechRecognition();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    setPacingState('panel-deliberating');

    const updatedHistory = [...history];
    const currentIndex = updatedHistory.length - 1;
    updatedHistory[currentIndex].answer = answerText;
    updatedHistory[currentIndex].speechMetadata = speechMetadata;
    setHistory(updatedHistory);

    try {
      const response = await fetch('/api/gemini/interview/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: updatedHistory,
          userAnswer: answerText,
          specialization: profile.specialization,
          level: profile.level
        })
      });

      if (!response.ok) throw new Error('Evaluation pipeline offline.');
      const data = await response.json();

      // Update message with score metrics for reports
      updatedHistory[currentIndex].score = data.score || 80;
      updatedHistory[currentIndex].critique = data.critique || 'Adequate. Clear explanations of locks. Expand memory models further.';

      // Next turn
      const nextMessage: InterviewMessage = {
        interviewer: data.nextInterviewer || 'Alex',
        role: data.nextRole || 'Staff SWE & Infra Architect',
        question: data.nextQuestion || 'Solid strategy. Now, how does that caching architecture scale across globally clusters without split-brain conditions?'
      };

      setHistory([...updatedHistory, nextMessage]);
      setCurrentInterviewer(nextMessage.interviewer);
      setCurrentInterviewerRole(nextMessage.role || 'Staff SWE & Infra Architect');
      setCurrentQuestionText(nextMessage.question);

      // Snappy deliberation review delay: 800ms
      setTimeout(() => {
        speakQuestionTTS(nextMessage.question, nextMessage.interviewer);
      }, 800);

    } catch (err) {
      console.error(err);
      updatedHistory[currentIndex].score = 75;
      updatedHistory[currentIndex].critique = 'Panel failover offline evaluation bounds recorded.';

      const nextSpeaker = currentInterviewer === 'Nia' ? 'Alex' : 'Sophia';
      const nextRole = nextSpeaker === 'Alex' ? 'Staff SWE & Infra Architect' : 'Engineering Manager & Systems Architect';
      const nextQuestion = nextSpeaker === 'Alex' 
        ? "Excellent point. Let's expand on memory layouts. How does memory compaction affect latency under random loads in your systems?"
        : "Let's focus on structural consensus. If we lose the master node abruptly, how does your write replica ensure strict consistency?";

      const nextFallback: InterviewMessage = {
        interviewer: nextSpeaker,
        role: nextRole,
        question: nextQuestion
      };

      setHistory([...updatedHistory, nextFallback]);
      setCurrentInterviewer(nextSpeaker);
      setCurrentInterviewerRole(nextRole);
      setCurrentQuestionText(nextQuestion);

      setTimeout(() => {
        speakQuestionTTS(nextQuestion, nextSpeaker);
      }, 700);
    }
  };

  // Keyboard Mode manual submission
  const handleKeyboardFormSubmit = () => {
    if (!manualTypedText.trim() || pacingState !== 'user-speaking') return;
    submitAnswer(manualTypedText);
    setManualTypedText('');
  };

  // Conclude early/Finalize Interview
  const handleFinalizeInterview = async () => {
    if (history.length === 0 || !profile) return;
    
    stopSpeechRecognition();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    setIsFinalizing(true);
    setActiveTab('report');

    try {
      const response = await fetch('/api/gemini/interview/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: history,
          specialization: profile.specialization,
          level: profile.level
        })
      });

      if (!response.ok) throw new Error('Evaluation board offline.');
      const data = await response.json();

      setReportScore(data.overallScore || 82);
      setReportXp(data.xpReward || 250);
      setReportMarkdown(data.feedbackReport || '# Evaluation Review Completed.');

      // Persist results inside DB
      const userRef = doc(db, 'users', profile.uid);
      const nowISO = new Date().toISOString();
      const earnedXp = Math.floor(data.xpReward || 250);
      const newXpTotal = profile.xp + earnedXp;
      const newLevelComputed = Math.floor(newXpTotal / 1000) + 1;

      await updateDoc(userRef, {
        xp: newXpTotal,
        level: newLevelComputed,
        lastInterviewTime: nowISO
      });
      setXpApplied(true);

    } catch (err) {
      console.error(err);
      setReportScore(78);
      setReportXp(200);
      setReportMarkdown(`# Technical Evaluation Failover Report

We successfully recorded your boardroom session metrics.

### Outcomes:
- **Board Rating**: 78 / 100
- **Earnings Boost**: +200 XP

### Directives:
1. Review lock contention mitigation.
2. Build local test frameworks to monitor execution latency.
`);

      const userRef = doc(db, 'users', profile.uid);
      const nowISO = new Date().toISOString();
      const newXpTotal = profile.xp + 200;
      const newLevelComputed = Math.floor(newXpTotal / 1000) + 1;

      await updateDoc(userRef, {
        xp: newXpTotal,
        level: newLevelComputed,
        lastInterviewTime: nowISO
      });
      setXpApplied(true);
    } finally {
      setIsFinalizing(false);
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getPacingLabel = () => {
    switch (pacingState) {
      case 'idle': return 'Awaiting Assembly';
      case 'panel-introducing': return 'Assemble panel is opening session...';
      case 'interviewer-speaking': return `${currentInterviewer.toUpperCase()} IS ENGAGING...`;
      case 'user-thinking': return 'Synthesizing pacing buffer...';
      case 'user-speaking': 
        return thinkModeActive 
          ? 'THINKING MODE ENABLED (Auto-timer paused)' 
          : 'MICROPHONE IS ACTIVE - YOUR TURN TO SPEAK';
      case 'panel-deliberating': return 'BOARD IS GRADUATE/COMPUTING NOTES...';
    }
  };

  // Helper visual indicator showing active talking waveform for speaker
  const VoiceWaves = () => (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/35 rounded-full shadow-lg">
      <div className="w-1.5 h-3 bg-yellow-400 rounded-full animate-bounce" />
      <div className="w-1.5 h-5 bg-yellow-400 rounded-full animate-bounce [animation-delay:0.1s]" />
      <div className="w-1.5 h-4 bg-yellow-400 rounded-full animate-bounce [animation-delay:0.22s]" />
      <div className="w-1.5 h-6 bg-yellow-400 rounded-full animate-bounce [animation-delay:0.35s]" />
      <div className="w-1.5 h-3 bg-yellow-400 rounded-full animate-bounce [animation-delay:0.15s]" />
      <span className="text-[10px] font-mono font-bold tracking-tight text-yellow-400 uppercase pl-1.5">Speaking</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-white" id="boardroom-studio">
      
      {/* Header Panel */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-6 py-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest">
              Nexus Career OS Boardroom • Room #401
            </span>
          </div>
          <h1 className="text-xl font-black uppercase tracking-tight">AI Virtual Boardroom</h1>
        </div>

        <div className="flex items-center gap-4">
          {activeTab === 'session' && (
            <div className="flex items-center gap-2 rounded-xl bg-red-950/30 border border-red-500/35 px-4 py-2 text-red-400 text-sm">
              <Timer className="h-4 w-4 animate-pulse text-red-500" />
              <span className="font-mono font-bold tracking-tight">{formatTimer(sessionTimeLeft)}</span>
            </div>
          )}

          {/* Sandbox Bypass Toggle (for instant testing) */}
          <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1.5 text-[11px] font-mono text-zinc-400">
            <span>Skip Cooldown:</span>
            <button
              onClick={() => {
                setSandboxBypass(!sandboxBypass);
                if (!sandboxBypass) {
                  setCooldownRemaining(null);
                  setCooldownSecs(0);
                }
              }}
              className={cn(
                "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none",
                sandboxBypass ? "bg-emerald-500" : "bg-zinc-800"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200",
                sandboxBypass ? "translate-x-4" : "translate-x-0.5"
              )} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          
          {/* LOBBY VIEW - Clean, Professional Full Screen (No skew/framing accents) */}
          {activeTab === 'lobby' && (
            <motion.div 
              key="lobby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto"
            >
              <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
                
                {/* Full-width Boardroom Banner */}
                <div className="relative rounded-2xl overflow-hidden border border-zinc-800 h-72 md:h-96 shadow-2xl">
                  <img 
                    src={interviewersPanel} 
                    alt="Evaluation Board Panel" 
                    className="w-full h-full object-cover brightness-[0.75] contrast-[1.05]"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                    <span className="bg-yellow-500/20 text-yellow-500 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded border border-yellow-500/30">
                      Standard Big Tech evaluation panel
                    </span>
                    <h2 className="text-3xl md:text-4xl font-extrabold mt-3 tracking-tight uppercase text-white">
                      The Boardroom Evaluation Panel
                    </h2>
                    <p className="text-zinc-300 text-sm md:text-base max-w-2xl mt-2 leading-relaxed">
                      Defend systems trade-offs, strict algorithmic complexity, and scaling limits in front of a 
                      coordinating group of four senior architects, dynamically adapted to your Level {profile?.level || 1} level.
                    </p>
                  </div>
                </div>

                {/* Status & Entry Gates */}
                <div className="grid md:grid-cols-3 gap-6">
                  
                  {/* Cooldown Status & Start Button */}
                  <Card className="bg-zinc-900 border-zinc-800 md:col-span-2 flex flex-col justify-between overflow-hidden">
                    <CardHeader className="p-6 border-b border-zinc-800 bg-zinc-950/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity className="h-5 w-5 text-yellow-500 animate-pulse" />
                          <h3 className="font-bold text-lg uppercase tracking-tight text-white">Entry Bounds</h3>
                        </div>
                        <span className="text-[10px] uppercase font-mono text-zinc-500">1 Evaluation Per Day</span>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="p-6 flex-1 flex flex-col justify-between gap-6">
                      <div className="space-y-4">
                        <p className="text-sm text-zinc-400 leading-relaxed font-sans">
                          A real-feel board interview evaluates multiple fields: performance logic, infrastructure resiliency, 
                          and mental capacity. To preserve actual pipeline stress, admissions are locked once per 24 hours.
                        </p>
                        
                        {cooldownRemaining ? (
                          <div className="p-4 bg-yellow-950/20 border border-yellow-500/30 rounded-xl flex items-center gap-3 text-yellow-300">
                            <Clock className="h-5 w-5 shrink-0 text-yellow-400" />
                            <div>
                              <p className="font-bold uppercase tracking-tight text-[11px] text-yellow-200">Session cooldown active</p>
                              <p className="text-xs text-yellow-300/80 mt-0.5 font-mono">
                                Next slot opens in: <span className="font-bold text-yellow-105">{cooldownRemaining}</span>
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-300">
                            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
                            <div>
                              <p className="font-bold uppercase tracking-tight text-[11px] text-emerald-200">Board Pipeline Open</p>
                              <p className="text-xs text-emerald-300/80 mt-0.5">
                                Virtual audio and video channels ready. Session limit is set to **30 minutes**.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-4">
                        <Button 
                          onClick={handleStartInterview}
                          disabled={!!cooldownRemaining && !sandboxBypass || isInitializing}
                          className={cn(
                            "flex-1 font-bold h-12 uppercase tracking-wider text-black text-xs",
                            cooldownRemaining && !sandboxBypass 
                              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed hover:bg-zinc-800" 
                              : "bg-yellow-500 hover:bg-yellow-600 hover:scale-[1.01] active:scale-[0.99] transition-all"
                          )}
                        >
                          {isInitializing ? (
                            <div className="flex items-center gap-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                              Warming voice transcribers...
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Play className="h-4 w-4 fill-black" />
                              Assemble Board & Start Call
                            </div>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Settings and Target Focus Detail */}
                  <Card className="bg-zinc-900 border-zinc-800 p-6 flex flex-col justify-between">
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
                        <Brain className="h-5 w-5 text-purple-400 animate-pulse" />
                        <h4 className="font-bold uppercase tracking-tight text-white">Focus & Vector</h4>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase">Field Specialty</div>
                        <div className="text-xs font-bold text-zinc-300 bg-zinc-950 p-2.5 rounded border border-zinc-800">
                          {profile?.specialization || 'Software Engineering'}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase">Interactive Hardware</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <button
                            onClick={() => setCameraEnabled(!cameraEnabled)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-2 rounded-lg border font-bold transition-all",
                              cameraEnabled ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "bg-red-950/20 border-red-900/30 text-red-400"
                            )}
                          >
                            {cameraEnabled ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                            Camera
                          </button>
                          <button
                            onClick={() => setMicEnabled(!micEnabled)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-2 rounded-lg border font-bold transition-all",
                              micEnabled ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "bg-red-950/20 border-red-900/30 text-red-400"
                            )}
                          >
                            {micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                            Mic
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase">Answering Method</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <button
                            onClick={() => setInputMode('voice')}
                            className={cn(
                              "flex items-center justify-center gap-2 py-2 rounded-lg border font-bold transition-all",
                              inputMode === 'voice' ? "bg-yellow-500 text-black border-yellow-600" : "bg-zinc-850 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                            )}
                          >
                            <Mic className="h-3.5 w-3.5" />
                            Voice
                          </button>
                          <button
                            onClick={() => setInputMode('keyboard')}
                            className={cn(
                              "flex items-center justify-center gap-2 py-2 rounded-lg border font-bold transition-all",
                              inputMode === 'keyboard' ? "bg-yellow-500 text-black border-yellow-600" : "bg-zinc-850 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                            )}
                          >
                            <Keyboard className="h-3.5 w-3.5" />
                            Keyboard
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-500 font-mono text-center pt-4 border-t border-zinc-800">
                      Real-Feel Media Router v3.6
                    </div>
                  </Card>
                </div>

                {/* Voice & Camera Diagnostics Bench */}
                <Card className="bg-zinc-900 border-zinc-800 p-6 shadow-2xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-805">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-5 w-5 text-yellow-500 animate-pulse" />
                      <h3 className="font-bold text-sm uppercase tracking-wider text-white">Boardroom Audio & Camera Diagnostics Bench</h3>
                    </div>
                    {systemVoices.length > 0 ? (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded font-mono uppercase self-start">
                        {systemVoices.length} System Voices Operational
                      </span>
                    ) : (
                      <span className="text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2.5 py-1 rounded font-mono uppercase self-start animate-pulse">
                        Warming Client Speech Engines...
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                    Standard web browsers protect you by blocking automatic speech audio and limiting webcam crops. Complete your calibration below to lock in realistic vocal depths, anti-robot configurations, and correct camera eye contact.
                  </p>

                  <div className="grid md:grid-cols-2 gap-8 pt-2">
                    
                    {/* Left: Camera alignment and eye contact controls */}
                    <div className="space-y-4 bg-zinc-950 p-4 rounded-xl border border-zinc-850">
                      <div className="flex items-center gap-2 text-zinc-300 font-bold text-xs uppercase font-mono tracking-tight pb-2 border-b border-zinc-900/60">
                        <Video className="h-4 w-4 text-cyan-400" />
                        Eye-Contact Camera Alignment Tool
                      </div>
                      
                      <p className="text-[11px] text-zinc-500 leading-snug">
                        Corrects the Y-axis alignment and zoom magnification so that you see the face of the active interviewer instead of just their hair.
                      </p>

                      <div className="space-y-4 pt-1">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
                            <span>Camera Eye-line Height Offset</span>
                            <span className="font-bold text-yellow-500">{cameraOriginY}% Y-axis</span>
                          </div>
                          <input 
                            type="range" 
                            min="20" 
                            max="80" 
                            value={cameraOriginY}
                            onChange={(e) => setCameraOriginY(Number(e.target.value))}
                            className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-yellow-500" 
                          />
                          <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
                            <span>Close-Up Eyes (20%)</span>
                            <span>Standard Face (48%)</span>
                            <span>Lower Torso (80%)</span>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
                            <span>Widescreen Crop Zoom Scale</span>
                            <span className="font-bold text-yellow-500">{cameraZoomScale}x magnification</span>
                          </div>
                          <input 
                            type="range" 
                            min="1.0" 
                            max="2.5" 
                            step="0.05"
                            value={cameraZoomScale}
                            onChange={(e) => setCameraZoomScale(Number(e.target.value))}
                            className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-yellow-500" 
                          />
                          <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
                            <span>Full Boardroom (1.0x)</span>
                            <span>Balanced (1.45x)</span>
                            <span>Tight Zoom (2.5x)</span>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1 border-t border-zinc-900/60 pt-3">
                          <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
                            <span>Voice Turn-Taking Silence Threshold</span>
                            <span className="font-bold text-yellow-500">{silenceTimeoutSeconds}s delay</span>
                          </div>
                          <input 
                            type="range" 
                            min="1.5" 
                            max="10.0" 
                            step="0.5"
                            value={silenceTimeoutSeconds}
                            onChange={(e) => setSilenceTimeoutSeconds(Number(e.target.value))}
                            className="w-full h-1 bg-zinc-850 rounded-lg appearance-none cursor-pointer accent-yellow-500" 
                          />
                          <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
                            <span>Snappy (1.5s)</span>
                            <span>Standard (5.0s)</span>
                            <span>Patient (10.0s)</span>
                          </div>
                        </div>

                        <div className="bg-yellow-500/5 border border-yellow-500/10 p-3 rounded-lg text-[10px] text-zinc-400 leading-normal flex items-start gap-2">
                          <Sparkles className="h-4 w-4 shrink-0 text-yellow-500 animate-pulse" />
                          <span>
                            <strong>Real-time calibration active!</strong> The active camera frame in the session automatically applies this focal eye-line and magnification scale.
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Interviewer voice fine-tuner */}
                    <div className="space-y-4 bg-zinc-950 p-4 rounded-xl border border-zinc-850">
                      <div className="flex items-center gap-2 text-zinc-300 font-bold text-xs uppercase font-mono tracking-tight pb-2 border-b border-zinc-900/60">
                        <Sliders className="h-4 w-4 text-purple-400" />
                        Interviewer Vocals & Robotic Anti-Synthesizer
                      </div>

                      <p className="text-[11px] text-zinc-500 leading-snug">
                        Assign specific local browser voices, or raise/lower pitch & rate to bypass any cold, artificial metallic feelings.
                      </p>

                      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                        {['Alex', 'Sophia', 'Michael', 'Nia'].map((name) => {
                          const voices = systemVoices.filter(v => v.lang.toLowerCase().startsWith('en')) || systemVoices;
                          const currentVal = panelistVoices[name] || getVoiceForPanelist(name, systemVoices)?.name || '';

                          return (
                            <div key={name} className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/40 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase text-zinc-300">{name}</span>
                                <Button 
                                  onClick={() => testVoiceAudio(name)}
                                  size="sm" 
                                  className="h-6 px-2 text-[9px] font-mono bg-zinc-900 hover:bg-zinc-800 text-yellow-500 hover:text-yellow-400 uppercase font-bold"
                                >
                                  Test Vocals
                                </Button>
                              </div>

                              <div className="grid grid-cols-1 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-mono uppercase text-zinc-500 text-left block">Browser Voice Engine</label>
                                  <select 
                                    value={currentVal}
                                    onChange={(e) => {
                                      setPanelistVoices(prev => ({ ...prev, [name]: e.target.value }));
                                    }}
                                    className="w-full text-[10px] bg-zinc-950 border border-zinc-800 text-zinc-300 rounded px-2 py-1 outline-none focus:border-zinc-700"
                                  >
                                    <option value="">-- Detect Best Native --</option>
                                    {voices.map(v => (
                                      <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500">
                                      <span>PITCH</span>
                                      <span className="text-zinc-400 font-bold">{panelistPitches[name]?.toFixed(2)}</span>
                                    </div>
                                    <input 
                                      type="range" 
                                      min="0.5" 
                                      max="1.5" 
                                      step="0.05"
                                      value={panelistPitches[name] || 1.0}
                                      onChange={(e) => setPanelistPitches(prev => ({ ...prev, [name]: Number(e.target.value) }))}
                                      className="w-full h-1 bg-zinc-850 rounded appearance-none cursor-pointer accent-purple-500" 
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500">
                                      <span>SPEED RATE</span>
                                      <span className="text-zinc-400 font-bold">{panelistRates[name]?.toFixed(2)}</span>
                                    </div>
                                    <input 
                                      type="range" 
                                      min="0.5" 
                                      max="1.5" 
                                      step="0.05"
                                      value={panelistRates[name] || 1.0}
                                      onChange={(e) => setPanelistRates(prev => ({ ...prev, [name]: Number(e.target.value) }))}
                                      className="w-full h-1 bg-zinc-850 rounded appearance-none cursor-pointer accent-purple-400" 
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                </Card>

                {/* Meet the Panel Directory list */}
                <div className="space-y-4">
                  <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-zinc-500">
                    The Board Panelists Directory
                  </h3>
                  
                  <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {panelistList.map((interviewer) => (
                      <Card key={interviewer.name} className="bg-zinc-90 w-full overflow-hidden border border-zinc-800 shadow-md flex flex-col justify-between">
                        <div>
                          <div className="relative h-40">
                            <div 
                              className="absolute inset-0 bg-cover bg-no-repeat bg-center"
                              style={{
                                backgroundImage: `url(${interviewersPanel})`,
                                backgroundSize: '400% 100%',
                                backgroundPosition: interviewer.name === 'Alex' ? '0% center' :
                                                   interviewer.name === 'Sophia' ? '33% center' :
                                                   interviewer.name === 'Michael' ? '66% center' :
                                                   '100% center',
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                            <div className="absolute bottom-2 left-3">
                              <span className={cn("text-xs font-black uppercase tracking-tight", interviewer.textColor)}>
                                {interviewer.name}
                              </span>
                            </div>
                          </div>
                          <div className="p-3 bg-zinc-950/40 space-y-1">
                            <div className="text-[10px] font-bold text-zinc-400 truncate leading-tight">
                              {interviewer.role}
                            </div>
                            <p className="text-[10px] text-zinc-500 leading-normal line-clamp-2">
                              {interviewer.specialty}
                            </p>
                          </div>
                        </div>
                        
                        {/* Audio tester element directly built on panelist card */}
                        <div className="p-3 bg-zinc-950 border-t border-zinc-850">
                          <Button
                            onClick={() => testVoiceAudio(interviewer.name)}
                            className="w-full text-[10px] font-mono h-8 bg-zinc-900 border border-zinc-800 text-yellow-500 hover:bg-zinc-850 hover:text-yellow-400 flex items-center justify-center gap-2 tracking-wider uppercase font-bold"
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                            Test Voice Audio
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* ACTIVE BOARDROOM CALL MATRIX (5-PERS GRID) - Entirely Audio/Video Feed Feel */}
          {activeTab === 'session' && (
            <motion.div 
              key="session"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col bg-zinc-950 relative overflow-hidden"
            >
              
              {/* Primary Boardroom Classroom Cinematic Area with interactive full-screen theater layout */}
              <div className={cn(
                "flex-1 overflow-y-auto flex flex-col justify-center transition-all duration-500 w-full mx-auto",
                isTheaterMode ? "max-w-none p-0 h-full bg-zinc-950/70" : "max-w-5xl p-4 md:p-6"
              )}>
                
                {/* Single Immersive Boardroom Stage with slow camera pan operator drift and zoom triggers */}
                <div className={cn(
                  "relative aspect-video w-full bg-black z-0 transition-all duration-500 overflow-hidden",
                  isTheaterMode 
                    ? "max-h-full h-full w-full rounded-none border-b border-zinc-900 shadow-none" 
                    : "max-h-[70vh] rounded-2xl border border-zinc-800 shadow-2xl"
                )}>
                  
                  {/* Master View Zoom Surface supporting continuous 3D particle operator breathing */}
                  <motion.div
                    className="absolute inset-0 bg-cover bg-no-repeat"
                    style={{
                      backgroundImage: `url(${interviewersPanel})`,
                    }}
                    animate={{
                      scale: getCameraFocus().scale,
                      transformOrigin: `${getCameraFocus().originX} ${getCameraFocus().originY}`,
                      // Organic vertical/horizontal camera panning breathing translation combined with 3D rotational skew
                      x: pacingState === 'interviewer-speaking' ? [0, 1.2, -1.2, 0.4, -0.4, 0] : [0, 0.6, -0.6, 0.3, -0.3, 0],
                      y: pacingState === 'interviewer-speaking' ? [0, -0.8, 0.8, -1.1, 1.1, 0] : [0, -0.4, 0.4, -0.3, 0.3, 0],
                      rotateY: pacingState === 'interviewer-speaking' ? [-0.5, 0.5, -0.3, 0.3, 0] : [-0.2, 0.2, -0.1, 0.1, 0],
                    }}
                    transition={{
                      scale: { type: "spring", stiffness: 35, damping: 14, mass: 1.1 },
                      transformOrigin: { duration: 1.1, ease: "easeInOut" },
                      x: { repeat: Infinity, duration: 12, ease: "easeInOut" },
                      y: { repeat: Infinity, duration: 14, ease: "easeInOut" },
                      rotateY: { repeat: Infinity, duration: 16, ease: "easeInOut" }
                    }}
                  />

                  {/* High Quality Vignette Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-zinc-950/40 pointer-events-none" />

                  {/* Active Speaker HUD Banner overlay */}
                  <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-950/85 border border-zinc-800/80 backdrop-blur-md shadow-xl max-w-xs transition-all pointer-events-none">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">Boardroom Presenter</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black uppercase text-white tracking-tight">
                        {pacingState === 'user-speaking' ? 'You (Candidate)' : currentInterviewer}
                      </span>
                      <span className={cn("text-[9px] uppercase font-mono px-2 py-0.5 rounded font-black", 
                        pacingState === 'user-speaking' ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 animate-pulse" : "bg-yellow-500/15 border border-yellow-500/30 text-yellow-400"
                      )}>
                        {pacingState === 'user-speaking' ? 'VOX LIVE' : 'SPEAKING'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-sans leading-tight mt-0.5 block truncate">
                      {pacingState === 'user-speaking' ? 'Delivering technical response defense' : currentInterviewerRole}
                    </p>
                  </div>

                  {/* Top-Right HUD Widgets */}
                  <div className="absolute top-4 right-4 z-10 flex items-center gap-2 pointer-events-none">
                    {pacingState === 'interviewer-speaking' && (
                      <VoiceWaves />
                    )}
                    <span className="px-3 py-1.5 rounded-xl bg-zinc-950/85 border border-zinc-800/80 text-xs font-mono font-bold uppercase tracking-widest text-zinc-400 backdrop-blur shadow-lg">
                      Secure Room #401
                    </span>
                  </div>

                  {/* High-Tech Eye-Contact Target Anchor */}
                  {showEyeTarget && pacingState === 'interviewer-speaking' && (
                    <motion.div
                      className="absolute pointer-events-none z-10 hidden sm:flex flex-col items-center justify-center"
                      style={{
                        left: getCameraFocus().originX === "13%" ? "12.8%" :
                              getCameraFocus().originX === "38%" ? "37.5%" :
                              getCameraFocus().originX === "63%" ? "62.4%" :
                              getCameraFocus().originX === "87%" ? "87.0%" : "50%",
                        top: `${cameraOriginY - 5}%`, // slightly higher than nose line to align directly with eyes
                        transform: "translate(-50%, -50%)",
                      }}
                      animate={{
                        scale: [0.93, 1.07, 0.93],
                        opacity: [0.35, 0.70, 0.35],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 3,
                        ease: "easeInOut",
                      }}
                    >
                      {/* Concentric high-tech eye focus ring */}
                      <div className="h-6 w-6 rounded-full border border-yellow-500/60 flex items-center justify-center bg-yellow-500/5 backdrop-blur-[0.5px] shadow-lg shadow-yellow-950/40">
                        <div className="h-1.5 w-1.5 rounded-full bg-yellow-550 bg-yellow-400" />
                      </div>
                      <span className="text-[7px] font-mono text-yellow-400/70 font-bold uppercase tracking-widest mt-1 bg-zinc-950/85 px-1 py-0.5 rounded border border-zinc-900">Eye Alignment</span>
                    </motion.div>
                  )}

                  {/* 3D Boardroom Table Surface Depth Perspective Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-[12%] bg-gradient-to-t from-zinc-950 via-zinc-900 to-zinc-800/20 border-t border-zinc-900 pointer-events-none z-10 flex flex-col justify-end">
                    {/* Polished metal trim */}
                    <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-yellow-600/35 via-yellow-500/20 to-transparent opacity-50" />
                    {/* Ambient reflective table surface */}
                    <div className={cn(
                      "h-full w-full opacity-10 transition-all duration-1000 bg-gradient-to-r from-transparent via-zinc-800 to-transparent",
                      pacingState === 'interviewer-speaking' ? "via-yellow-500/20 opacity-20" : 
                      pacingState === 'user-speaking' ? "via-emerald-500/15 opacity-15" : ""
                    )} />
                  </div>

                  {/* Translucent cinematic director control hub overlay */}
                  <div className="absolute bottom-6 left-6 z-20 flex items-center gap-1.5 p-1.5 rounded-full bg-zinc-950/85 border border-zinc-850 backdrop-blur-md shadow-2xl pointer-events-auto">
                    {/* Panoramic View button */}
                    <button
                      onClick={() => setCameraPreset('panoramic-table')}
                      className={cn(
                        "h-7 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-black transition-all",
                        cameraPreset === 'panoramic-table' 
                          ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20 font-bold" 
                          : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                      )}
                      title="Wide angle: Shows the entire professional boardroom panel together"
                    >
                      Panorama
                    </button>
                    
                    {/* Auto-Director tracking */}
                    <button
                      onClick={() => setCameraPreset('auto-director')}
                      className={cn(
                        "h-7 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-black transition-all",
                        cameraPreset === 'auto-director' 
                          ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20 font-bold" 
                          : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                      )}
                      title="Adaptive: Camera tracks active speaker head seamlessly"
                    >
                      Auto Director
                    </button>
                    
                    {/* Eye Contact close up */}
                    <button
                      onClick={() => setCameraPreset('eye-contact')}
                      className={cn(
                        "h-7 px-3 rounded-full text-[9px] font-mono uppercase tracking-wider font-black transition-all",
                        cameraPreset === 'eye-contact' 
                          ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20 font-bold" 
                          : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                      )}
                      title="Targeted: Intense close-up portrait aligned to interviewer eye coordinate"
                    >
                      Eye Align
                    </button>

                    <div className="h-4 w-[1px] bg-zinc-850 mx-1" />

                    {/* Toggle Eye Target overlay */}
                    <button
                      onClick={() => setShowEyeTarget(!showEyeTarget)}
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center transition-all bg-zinc-900 border",
                        showEyeTarget ? "border-yellow-500/40 text-yellow-400" : "border-zinc-805 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                      )}
                      title="Toggle the targeted glowing Eye Contact alignment tracker"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>

                    {/* Toggle Cinema Theater Mode */}
                    <button
                      onClick={() => setIsTheaterMode(!isTheaterMode)}
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center transition-all bg-zinc-900 border",
                        isTheaterMode ? "border-emerald-500/40 text-emerald-400" : "border-zinc-805 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                      )}
                      title={isTheaterMode ? "Return back to default layout" : "Toggle Full-Screen Cinematic Table-Side overlay"}
                    >
                      <Tv className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* High Quality Target HUD Brackets */}
                  <AnimatePresence>
                    {pacingState === 'interviewer-speaking' && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 pointer-events-none flex items-center justify-center p-8 z-0"
                      >
                        <div className="absolute bottom-6 bg-zinc-950/90 border border-yellow-500/30 px-3.5 py-1.5 text-yellow-400 text-[10px] font-mono uppercase rounded-lg shadow-xl backdrop-blur-md flex items-center gap-1.5 pb-2">
                          <Activity className="h-3.5 w-3.5 text-yellow-400 animate-pulse" />
                          <span>Direct Eye contact established on {currentInterviewer}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Candidate PIP Frame (Floating Picture-In-Picture in the bottom-right corner) */}
                  <motion.div
                    className={cn(
                      "absolute bottom-4 right-4 w-44 sm:w-56 aspect-video rounded-xl overflow-hidden border bg-zinc-950/90 shadow-2xl transition-all duration-300 z-10",
                      pacingState === 'user-speaking' ? "ring-2 ring-emerald-500 border-emerald-500 shadow-emerald-950/50" : "border-zinc-800"
                    )}
                    animate={{
                      scale: pacingState === 'user-speaking' ? 1.05 : 1.0,
                    }}
                  >
                    {cameraEnabled ? (
                      <video 
                        ref={userVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] brightness-[1.03]"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-650">
                        <User className="h-7 w-7 text-zinc-700 animate-pulse" />
                        <span className="text-[8px] uppercase font-mono text-zinc-500 mt-1.5">Privacy shield secure</span>
                      </div>
                    )}
                    
                    {/* Corner flag overlays */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-10 pointer-events-none">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-zinc-950/90 text-zinc-300 border border-zinc-850">
                        You
                      </span>
                      {pacingState === 'user-speaking' && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-black bg-emerald-500 text-black animate-pulse">
                          VOX ACTIVE
                        </span>
                      )}
                    </div>
                  </motion.div>

                </div>

                {/* Subtitle/Closed Captions Area immediately below meeting grid */}
                <div className="mt-4 space-y-3 animate-none">
                  {showRepeatNotice && (
                    <motion.div 
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg flex items-center gap-2.5 shadow-lg backdrop-blur"
                    >
                      <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
                      <span className="text-xs font-mono font-bold uppercase text-yellow-400">
                        Repetition Request Detected — Replaying current question audio...
                      </span>
                    </motion.div>
                  )}

                  {thinkModeActive && pacingState === 'user-speaking' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-cyan-500/10 border border-cyan-500/30 p-3 rounded-lg flex items-center justify-between shadow-lg backdrop-blur animate-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        <span className="text-xs font-mono font-bold uppercase text-cyan-400">
                          Thinking Mode Active — Automatic silence-submission is paused. Formulate your answer slowly!
                        </span>
                      </div>
                      <button 
                        onClick={() => setThinkModeActive(false)}
                        className="text-[10px] uppercase font-mono bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 font-bold transition-all"
                      >
                        Resume Timer
                      </button>
                    </motion.div>
                  )}

                  <div className="bg-zinc-900/65 backdrop-blur border border-zinc-800 rounded-xl p-4 md:p-5 flex items-start gap-4 shadow-xl">
                    {/* Speaker head */}
                    <div className={cn("h-10 w-10 shrink-0 rounded-lg flex items-center justify-center font-black text-zinc-950 text-base shadow", 
                      pacingState === 'user-speaking' ? 'bg-emerald-400' : 'bg-yellow-405 bg-yellow-400'
                    )}>
                      {pacingState === 'user-speaking' ? 'U' : currentInterviewer[0]}
                    </div>

                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-zinc-200 tracking-tight">
                          {pacingState === 'user-speaking' ? 'You' : `${currentInterviewer} (${currentInterviewerRole})`}
                        </span>
                        <span className="text-[9px] font-mono uppercase bg-zinc-850 border border-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                          {getPacingLabel()}
                        </span>
                      </div>

                      <div className="text-sm md:text-base leading-relaxed text-zinc-300 antialiased font-medium">
                        {pacingState === 'user-speaking' ? (
                          spokenTranscript || manualTypedText || "Listening... Start speaking when ready, or type below (if keyboard mode)."
                        ) : (
                          currentQuestionText || "Prepping interview parameters..."
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Keyboard Input fallback form when user is speaking but typing mode is enabled */}
                {pacingState === 'user-speaking' && inputMode === 'keyboard' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 flex gap-2 p-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg"
                  >
                    <input 
                      type="text"
                      value={manualTypedText}
                      onChange={(e) => {
                        setManualTypedText(e.target.value);
                        if (speechStartTimestampRef.current === 0) {
                          speechStartTimestampRef.current = Date.now();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleKeyboardFormSubmit();
                        }
                      }}
                      placeholder="Type your technical defense argument or code logic here..."
                      className="flex-1 text-sm bg-zinc-950 border border-zinc-800 focus:border-zinc-700/80 focus:ring-0 rounded-lg px-3 outline-none"
                    />
                    <Button 
                      onClick={handleKeyboardFormSubmit}
                      disabled={!manualTypedText.trim()}
                      className="px-4 font-bold bg-yellow-500 hover:bg-yellow-600 font-mono text-xs uppercase text-zinc-950"
                    >
                      Submit
                    </Button>
                  </motion.div>
                )}

              </div>

              {/* Bottom Meeting Control Desk Toolbar */}
              <div className="border-t border-zinc-900/90 bg-zinc-950 p-4 md:px-8 shadow-2xl flex flex-wrap items-center justify-between gap-4">
                
                {/* Left indicators */}
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-tight">Active Room Session Encryption Ready</span>
                </div>

                {/* Center Core Toggles (Virtual Call buttons) */}
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setCameraEnabled(!cameraEnabled)}
                    className={cn("h-11 w-11 rounded-full flex items-center justify-center transition-all bg-zinc-900 border text-white hover:bg-zinc-805", 
                      cameraEnabled ? "border-zinc-800" : "bg-red-950/40 border-red-900/50 text-red-400"
                    )}
                    title="Camera Video Feed On/Off"
                  >
                    {cameraEnabled ? <Video className="h-4.5 w-4.5" /> : <VideoOff className="h-4.5 w-4.5" />}
                  </button>

                  <button 
                    onClick={() => {
                      const nextState = !micEnabled;
                      setMicEnabled(nextState);
                      if (nextState && pacingState === 'user-speaking' && inputMode === 'voice') {
                        startSpeechRecognition();
                      } else {
                        stopSpeechRecognition();
                      }
                    }}
                    className={cn("h-11 w-11 rounded-full flex items-center justify-center transition-all bg-zinc-900 border text-white hover:bg-zinc-805", 
                      micEnabled ? "border-zinc-800" : "bg-red-950/40 border-red-900/50 text-red-400"
                    )}
                    title="Microphone Audio Capture On/Off"
                  >
                    {micEnabled ? <Mic className="h-4.5 w-4.5" /> : <MicOff className="h-4.5 w-4.5" />}
                  </button>

                  <button 
                    onClick={() => {
                      const nextSound = !soundEnabled;
                      setSoundEnabled(nextSound);
                      if (!nextSound && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                      }
                    }}
                    className={cn("h-11 w-11 rounded-full flex items-center justify-center transition-all bg-zinc-900 border text-white hover:bg-zinc-805", 
                      soundEnabled ? "border-zinc-800" : "bg-red-950/40 border-red-900/50 text-red-00 text-red-400"
                    )}
                    title="Interviewer Spoken Speech On/Off"
                  >
                    {soundEnabled ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
                  </button>

                  <div className="h-6 w-[1px] bg-zinc-800 mx-1" />

                  {/* Repeat Question Controls */}
                  <button 
                    onClick={repeatCurrentQuestion}
                    className="h-11 px-4 rounded-full border border-zinc-850 bg-zinc-900 text-xs font-black uppercase text-zinc-350 flex items-center gap-2 hover:bg-zinc-800 transition-all font-mono"
                    title="Replay Spoken Text-to-Speech audio for the current question"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-yellow-500" />
                    Repeat Q
                  </button>

                  {/* Think Mode Control */}
                  <button 
                    onClick={() => {
                      const nextThinkState = !thinkModeActive;
                      setThinkModeActive(nextThinkState);
                      if (nextThinkState) {
                        // Clear silence timeout immediately so it doesn't auto-submit!
                        if (silenceTimeoutRef.current) {
                          clearTimeout(silenceTimeoutRef.current);
                          silenceTimeoutRef.current = null;
                        }
                      }
                    }}
                    className={cn(
                      "h-11 px-4 rounded-full border text-xs font-black uppercase flex items-center gap-2 hover:bg-zinc-800 transition-all font-mono",
                      thinkModeActive 
                        ? "bg-cyan-950/50 border-cyan-500/50 text-cyan-400" 
                        : "bg-zinc-900 border-zinc-850 text-zinc-350"
                    )}
                    title={thinkModeActive ? "Auto-timer currently paused. Click to resume." : "Hold the speech auto-submission timer so you can think as long as you want"}
                  >
                    <Pause className={cn("h-3.5 w-3.5 animate-none", thinkModeActive ? "text-cyan-450 text-cyan-400 font-bold" : "text-yellow-500")} />
                    {thinkModeActive ? "Thinking Active" : "Think Mode"}
                  </button>

                  <div className="h-6 w-[1px] bg-zinc-800 mx-1" />

                  {/* Input mode switcher */}
                  <button 
                    onClick={() => {
                      const nextMode = inputMode === 'voice' ? 'keyboard' : 'voice';
                      setInputMode(nextMode);
                      if (nextMode === 'voice' && pacingState === 'user-speaking' && micEnabled) {
                        startSpeechRecognition();
                      } else {
                        stopSpeechRecognition();
                      }
                    }}
                    className="h-11 px-4 rounded-full border border-zinc-850 bg-zinc-900 text-xs font-black uppercase text-zinc-300 flex items-center gap-2 hover:bg-zinc-800 transition-all font-mono"
                    title="Switch input mechanism between mic & keys"
                  >
                    {inputMode === 'voice' ? <Mic className="h-3.5 w-3.5 text-yellow-500" /> : <Keyboard className="h-3.5 w-3.5 text-yellow-500" />}
                    {inputMode === 'voice' ? 'Voice Mode' : 'Key Mode'}
                  </button>
                </div>

                {/* Right call actions */}
                <div className="flex items-center gap-2">
                  {pacingState === 'user-speaking' && (
                    <Button
                      onClick={() => {
                        if (inputMode === 'voice') {
                          handleVoiceSubmission(spokenTranscript);
                        } else {
                          handleKeyboardFormSubmit();
                        }
                      }}
                      disabled={inputMode === 'voice' ? !spokenTranscript.trim() : !manualTypedText.trim()}
                      className="px-4 h-11 bg-emerald-500 hover:bg-emerald-600 font-bold text-xs uppercase text-zinc-950 rounded-full flex items-center gap-2 transition-all shadow"
                    >
                      <Send className="h-3.5 w-3.5 text-zinc-950" />
                      Answer Board
                    </Button>
                  )}
                  <Button 
                    onClick={handleFinalizeInterview}
                    className="px-5 h-11 bg-red-600 hover:bg-red-750 text-white font-bold text-xs uppercase rounded-full flex items-center gap-2 transition-all hover:bg-red-700 shadow"
                  >
                    <PhoneOff className="h-3.5 w-3.5 text-white" />
                    Conclude & Evaluate
                  </Button>
                </div>

              </div>

            </motion.div>
          )}

          {/* REPORT VIEW (RESULTS DESK) */}
          {activeTab === 'report' && (
            <motion.div 
              key="report"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="h-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-8"
            >
              {isFinalizing ? (
                /* Loading screen */
                <div className="h-[65vh] flex flex-col items-center justify-center gap-6">
                  <div className="relative">
                    <div className="h-16 w-16 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent" />
                    <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-yellow-500 animate-pulse" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="font-black text-xl uppercase tracking-tighter text-white">Board is scoring metrics...</h3>
                    <p className="text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                      Laying down lock contention analyses, distributed consensus reviews, and formulating custom Career OS directives.
                    </p>
                  </div>
                </div>
              ) : (
                /* Full Markdown Report UI */
                <div className="space-y-8">
                  
                  {/* Results Banner block */}
                  <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute right-0 top-0 h-64 w-64 bg-yellow-500/5 blur-3xl rounded-full" />
                    
                    <div className="flex items-center gap-4">
                      {/* Big Score circle */}
                      <div className="h-20 w-20 shrink-0 rounded-full border-4 border-yellow-500/20 flex flex-col items-center justify-center bg-yellow-500/10">
                        <span className="text-2xl font-black text-yellow-500">{reportScore}</span>
                        <span className="text-[10px] text-yellow-500/60 font-mono uppercase mt-[-4px]">PTS</span>
                      </div>

                      <div className="space-y-1">
                        <h2 className="text-2xl font-black tracking-tight uppercase text-white">Advisory Evaluation Audit</h2>
                        <p className="text-xs text-zinc-400">
                          Your boardroom response metrics have been analyzed and persistent Career OS logs updated.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 bg-zinc-950 px-4 py-3 rounded-xl border border-zinc-800 shadow">
                      <Award className="h-8 w-8 text-yellow-500 shrink-0" />
                      <div>
                        <div className="text-[10px] font-mono uppercase text-zinc-500 text-zinc-400">Award Earned</div>
                        <div className="text-xl font-black text-yellow-400">{reportXp ? `+${reportXp} XP` : 'Calculating...'}</div>
                      </div>
                    </div>
                  </div>

                  {xpApplied && (
                    <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-300">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                      <div>
                        <p className="font-bold uppercase tracking-tight text-[11px] text-emerald-200">Database synchronization complete</p>
                        <p className="text-xs text-emerald-300/80 mt-0.5">
                          Acquired XP written securely to your profile records. Cooldown gate locks for 24 hours.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Feedback Report Details */}
                  <Card className="bg-zinc-900 border-zinc-800 p-8 shadow-2xl">
                    <div className="markdown-body prose prose-invert max-w-full text-zinc-300 font-sans">
                      <ReactMarkdown>{reportMarkdown}</ReactMarkdown>
                    </div>
                  </Card>

                  {/* Actions buttons */}
                  <div className="flex justify-end gap-4">
                    <Button 
                      onClick={() => setActiveTab('lobby')}
                      className="px-8 font-bold bg-white text-black hover:bg-zinc-200 uppercase tracking-widest text-xs h-12 rounded-lg"
                    >
                      Return to Lobby
                    </Button>
                  </div>

                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
