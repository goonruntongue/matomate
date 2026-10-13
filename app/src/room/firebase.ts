// Firebase (project "matomate", free Spark plan): Google / guest sign-in and the Realtime Database
// that carries the room. These values identify the project; they are public by design
// (access is decided by database.rules.json, not by keeping them secret).
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const app = initializeApp({
  apiKey: 'AIzaSyAxkzA87Rm0LSSG-7QzoNmj19pKfw3O-Ls',
  authDomain: 'matomate.firebaseapp.com',
  databaseURL: 'https://matomate-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'matomate',
  storageBucket: 'matomate.firebasestorage.app',
  messagingSenderId: '269336374346',
  appId: '1:269336374346:web:af8268600e38f040be8ab3',
});

export const auth = getAuth(app);
export const db = getDatabase(app);

/** The game master. More admins can be added under /admins/{uid} in the database. */
export const ADMIN_EMAIL = 'goonruntongue@gmail.com';
