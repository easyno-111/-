import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA5xx2QMyzXni-15IqvrtEKOKJ2ocpnyHg',
  authDomain: 'teacher-app-portal.firebaseapp.com',
  databaseURL: 'https://teacher-app-portal-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'teacher-app-portal',
  storageBucket: 'teacher-app-portal.firebasestorage.app',
  messagingSenderId: '804602501820',
  appId: '1:804602501820:web:f02ac8f39482a1d3240eb9'
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getDatabase(firebaseApp);
