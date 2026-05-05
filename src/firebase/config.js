import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB6yOygSIzIhgeTzV_q6t7iIWPtNOfulQA",
  authDomain: "library---app.firebaseapp.com",
  projectId: "library---app",
  storageBucket: "library---app.firebasestorage.app",
  messagingSenderId: "1023065900827",
  appId: "1:1023065900827:web:ae12a12e02a385d72cf5be",
  measurementId: "G-QKKCN8EFBR"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);