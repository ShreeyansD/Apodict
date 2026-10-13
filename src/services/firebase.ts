import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithPopup,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  collection, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  writeBatch,
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Use our own domain for sign-in only on the live site; everywhere else keep the default
const authDomain =
  typeof window !== 'undefined' && window.location.hostname === 'apodict.app'
    ? 'apodict.app'
    : (firebaseConfig as any).authDomain;
const app = initializeApp({ ...firebaseConfig, authDomain });

// Initialize Firestore (with explicit database ID per skill requirement)
const databaseId = (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-semestercommandc-c178a31e-a74c-4de6-9d81-3dcd800ef70e';
export const db = getFirestore(app, databaseId);

// Initialize Authentication
export const auth = getAuth(app);

// Validate Connection to Firestore per skill constraint
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Google Auth Provider
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});

export { GoogleAuthProvider };

// Skill requirement error handler
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { 
  signInWithPopup, 
  firebaseSignOut, 
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithPopup,
  doc, 
  collection, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  writeBatch 
};
export type { User };

// Firebase Cloud Messaging (lazily initialized only if supported)
import { getMessaging, getToken, deleteToken, isSupported, Messaging } from 'firebase/messaging';

let messagingInstance: Messaging | null = null;
let messagingPromise: Promise<Messaging | null> | null = null;

export async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (messagingInstance) return messagingInstance;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      try {
        const supported = await isSupported();
        if (supported) {
          messagingInstance = getMessaging(app);
          return messagingInstance;
        }
        return null;
      } catch (err) {
        console.warn('Firebase Messaging is not supported:', err);
        return null;
      }
    })();
  }
  return messagingPromise;
}

export { getToken, deleteToken, isSupported };
export type { Messaging };
