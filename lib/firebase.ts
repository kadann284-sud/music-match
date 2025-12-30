import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA3WBuG_ynTgPKFM5TN28yw8tY7JkmoRf4",
  authDomain: "music-match-b270c.firebaseapp.com",
  projectId: "music-match-b270c",
  storageBucket: "music-match-b270c.firebasestorage.app",
  messagingSenderId: "1018669646500",
  appId: "1:1018669646500:web:5854cd0c67758fe8fe5c31"
};
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
