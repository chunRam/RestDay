import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// TODO: 파이어베이스 콘솔에서 발급받은 실제 웹 설정(Config) 값으로 교체하세요.
const firebaseConfig = {
  apiKey: "AIzaSyA-G9sV_hsonXlc2O3v3_AshsPne9sPCFM",
  authDomain: "restdady.firebaseapp.com",
  projectId: "restdady",
  storageBucket: "restdady.firebasestorage.app",
  messagingSenderId: "650997922253",
  appId: "1:650997922253:web:42d20978d714994bc36c84"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
