
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAycZZx53LflnPQxPqxWsGUV5j3Oz7Bl3k",
    authDomain: "aureum-board.firebaseapp.com",
    projectId: "aureum-board",
    storageBucket: "aureum-board.firebasestorage.app",
    messagingSenderId: "584654648988",
    appId: "1:584654648988:web:a3964514e6a1873d281f59"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };
