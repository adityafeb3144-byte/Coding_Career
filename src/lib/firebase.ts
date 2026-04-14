import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp, Timestamp, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Connection test as per guidelines
async function testConnection() {
  try {
    console.log("Testing Firestore connection...");
    // Attempt to reach the server directly
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection verified.");
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
      console.error("CRITICAL: Firestore connection failed. Please check your Firebase configuration or project status.");
    }
  }
}
testConnection();

export const signInWithGoogle = async () => {
  console.log("signInWithGoogle: Initializing popup...");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("signInWithGoogle: Success", result.user.uid);
    return result.user;
  } catch (error: any) {
    console.error("signInWithGoogle: Error", error.code, error.message);
    throw error;
  }
};

export const logout = () => auth.signOut();

export const checkConnection = async () => {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    console.error("Connection check failed:", error);
    return false;
  }
};

// Helper to handle Firestore errors as per guidelines
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function calculateStreak(lastActiveStr: string | null, currentStreak: number): { newStreak: number, shouldUpdate: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!lastActiveStr) {
    return { newStreak: 1, shouldUpdate: true };
  }

  const lastActive = new Date(lastActiveStr);
  lastActive.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - lastActive.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    // Yesterday was the last activity, increment streak
    return { newStreak: currentStreak + 1, shouldUpdate: true };
  } else if (diffDays > 1) {
    // Missed a day, reset to 1
    return { newStreak: 1, shouldUpdate: true };
  } else if (diffDays === 0 && currentStreak === 0) {
    // First activity of the day but streak was 0
    return { newStreak: 1, shouldUpdate: true };
  }

  return { newStreak: currentStreak, shouldUpdate: false };
}
