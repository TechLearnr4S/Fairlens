import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '../../firebase';
import type { User } from './types';

export const authService = {
  async login(email: string, password: string): Promise<{user: User, token: string}> {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken();
    
    // Map Firebase user back to our internal User structure
    const user: User = {
      id: userCredential.user.uid,
      email: userCredential.user.email || '',
      name: userCredential.user.displayName || userCredential.user.email?.split('@')[0] || 'User',
      role: 'auditor' // Firebase Auth doesn't have custom roles mapped by default unless using Custom Claims
    };
    
    return { user, token: idToken };
  },

  async loginWithGoogle(): Promise<{user: User, token: string}> {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const idToken = await userCredential.user.getIdToken();

    const user: User = {
      id: userCredential.user.uid,
      email: userCredential.user.email || '',
      name: userCredential.user.displayName || userCredential.user.email?.split('@')[0] || 'User',
      role: 'auditor'
    };

    return { user, token: idToken };
  },

  async signup(email: string, password: string, name: string): Promise<{user: User, token: string}> {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Update profile with name
    if (userCredential.user) {
      await updateProfile(userCredential.user, { displayName: name });
    }
    
    const idToken = await userCredential.user.getIdToken();
    
    const user: User = {
      id: userCredential.user.uid,
      email: userCredential.user.email || '',
      name: name,
      role: 'auditor'
    };
    
    return { user, token: idToken };
  },

  async logout(): Promise<void> {
    await signOut(auth);
  },
  
  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  }
};
