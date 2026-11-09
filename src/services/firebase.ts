import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { ChatMessage, PersonalityMode } from '../types';

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// CRITICAL: Initialize Firestore with firestoreDatabaseId from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// SKILL SPECIFICATION: Standardized Firestore Error Handler
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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on boot (CRITICAL CONSTRAINT in SKILL.md)
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase connection: Client is offline or database initializing.');
      return false;
    }
    // Expected if test doc does not exist yet; connection is verified
    return true;
  }
}

// User Profile interface
export interface UserProfileData {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Save or sync user profile in Firestore
export async function syncUserProfile(user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const now = new Date().toISOString();

  try {
    const existing = await getDoc(userRef);
    if (!existing.exists()) {
      const newProfile: UserProfileData = {
        id: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || 'JIYA User',
        email: user.email || '',
        photoURL: user.photoURL || '',
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(userRef, newProfile);
    } else {
      // Update basic fields if changed
      const updateData: Partial<UserProfileData> = {
        displayName: user.displayName || user.email?.split('@')[0] || 'JIYA User',
        photoURL: user.photoURL || '',
        updatedAt: now,
      };
      await setDoc(userRef, updateData, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

// Google Login with Popup
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  if (result.user) {
    await syncUserProfile(result.user);
  }
  return result.user;
}

// Email & Password Registration
export async function registerWithEmail(
  email: string,
  pass: string,
  displayName: string
): Promise<User> {
  const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  const user = userCredential.user;

  // Set display name on Firebase auth user
  if (displayName.trim()) {
    await updateProfile(user, { displayName: displayName.trim() });
  }

  // Send verification email
  try {
    await sendEmailVerification(user);
  } catch (err) {
    console.warn('Could not send verification email immediately:', err);
  }

  // Create profile document
  await syncUserProfile(user);
  return user;
}

// Email & Password Sign In
export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const userCredential = await signInWithEmailAndPassword(auth, email.trim(), pass);
  const user = userCredential.user;
  await syncUserProfile(user);
  return user;
}

// Password Reset Email
export async function sendResetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

// Re-send verification email
export async function resendVerification(): Promise<void> {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  }
}

// Sign Out
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

// ----------------------------------------------------
// User-Specific Private Chat Data Synchronization
// ----------------------------------------------------

export async function fetchUserMessages(userId: string): Promise<ChatMessage[]> {
  const messagesCol = collection(db, 'users', userId, 'messages');
  try {
    const q = query(messagesCol, orderBy('createdAt', 'asc'), limit(100));
    const querySnapshot = await getDocs(q);
    const loaded: ChatMessage[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      loaded.push({
        id: data.id || docSnap.id,
        role: data.role,
        content: data.content,
        mode: data.mode as PersonalityMode,
        timestamp: data.timestamp || '',
        audioVoiceName: data.audioVoiceName,
      });
    });

    return loaded;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${userId}/messages`);
  }
}

export async function saveUserMessageToFirestore(userId: string, msg: ChatMessage): Promise<void> {
  const messageDoc = doc(db, 'users', userId, 'messages', msg.id);
  const payload = {
    id: msg.id,
    userId,
    role: msg.role,
    content: msg.content,
    mode: msg.mode,
    timestamp: msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: new Date().toISOString(),
    ...(msg.audioVoiceName ? { audioVoiceName: msg.audioVoiceName } : {}),
  };

  try {
    await setDoc(messageDoc, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/messages/${msg.id}`);
  }
}

export async function clearUserMessagesFromFirestore(userId: string): Promise<void> {
  const messagesCol = collection(db, 'users', userId, 'messages');
  try {
    const snapshot = await getDocs(messagesCol);
    const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.all(deletePromises);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/messages`);
  }
}
