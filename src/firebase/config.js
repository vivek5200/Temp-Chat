// src/firebase/config.js

import firebase from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: '55141967059-s3uplnau5iabn4v5h1diup6ms91n49bj.apps.googleusercontent.com',
  offlineAccess: true,
});

// Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyAWTN2pxUJiCq4--vScEbquYmOz81XAKoU",
  authDomain: "temp-chat-8211e.firebaseapp.com",
  projectId: "temp-chat-8211e",
  storageBucket: "temp-chat-8211e.appspot.com",
  messagingSenderId: "55141967059",
  appId: "1:55141967059:web:02eaa2064ea03bbcdb6026",
  measurementId: "G-W63N5KKM58"
};

// Initialize only if not already initialized
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export { firebase, firestore, auth };