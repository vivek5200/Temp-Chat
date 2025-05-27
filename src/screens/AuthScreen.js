import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const AuthScreen = ({ navigation }) => {
  // State management
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  });
  const [uiState, setUiState] = useState({
    loading: false,
    showPassword: false,
    verificationSent: false,
    showResetModal: false,
    resetEmail: '',
    checkingUsername: false,
    usernameAvailable: null
  });

  // Configure Google Sign-In
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
      offlineAccess: true,
    });
  }, []);

  // Debounced username availability check
  useEffect(() => {
    if (!isLogin && formData.username) {
      const timer = setTimeout(() => checkUsernameAvailability(), 500);
      return () => clearTimeout(timer);
    }
  }, [formData.username, isLogin]);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Reset availability check when username changes
    if (name === 'username') {
      setUiState(prev => ({ ...prev, usernameAvailable: null }));
    }
  };

  const toggleUIState = (key, value) => {
    setUiState(prev => ({ ...prev, [key]: value }));
  };

  // Check username availability in Firestore
  const checkUsernameAvailability = async () => {
    if (!formData.username.trim()) {
      setUiState(prev => ({ ...prev, usernameAvailable: null }));
      return;
    }

    toggleUIState('checkingUsername', true);
    try {
      const usernameLower = formData.username.trim().toLowerCase();
      const doc = await firestore().collection('usernames').doc(usernameLower).get();
      setUiState(prev => ({ 
        ...prev, 
        usernameAvailable: !doc.exists,
        checkingUsername: false
      }));
    } catch (error) {
      console.error('Username check error:', error);
      Alert.alert('Error', 'Failed to check username availability');
      toggleUIState('checkingUsername', false);
    }
  };

  // Handle email/password authentication
  const handleEmailAuth = async () => {
    // Validation
    if (!formData.email || !formData.password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    if (!isLogin) {
      if (!formData.username) {
        Alert.alert('Error', 'Please enter a username');
        return;
      }
      if (uiState.usernameAvailable === false) {
        Alert.alert('Error', 'Username is already taken');
        return;
      }
      if (uiState.usernameAvailable === null) {
        Alert.alert('Error', 'Please wait while we check username availability');
        return;
      }
    }

    toggleUIState('loading', true);
    try {
      if (isLogin) {
        await handleLogin();
      } else {
        await handleSignup();
      }
    } catch (error) {
      handleAuthError(error);
    } finally {
      toggleUIState('loading', false);
    }
  };

  const handleLogin = async () => {
    const userCredential = await auth().signInWithEmailAndPassword(
      formData.email, 
      formData.password
    );

    if (!userCredential.user.emailVerified) {
      await handleUnverifiedEmail(userCredential.user);
      return;
    }

    navigation.replace('Home');
  };

  const handleUnverifiedEmail = async (user) => {
    Alert.alert(
      'Email Not Verified',
      'Please verify your email before logging in.',
      [
        {
          text: 'Resend Verification',
          onPress: async () => {
            await user.sendEmailVerification();
            Alert.alert('Success', 'Verification email resent!');
          }
        },
        { 
          text: 'OK',
          onPress: async () => await auth().signOut()
        }
      ]
    );
  };

  const handleSignup = async () => {
    await firestore().runTransaction(async (transaction) => {
      // Check username availability atomically
      const usernameRef = firestore().collection('usernames')
        .doc(formData.username.toLowerCase());
      const usernameDoc = await transaction.get(usernameRef);
      
      if (usernameDoc.exists) {
        throw new Error('USERNAME_TAKEN');
      }

      // Create user
      const userCredential = await auth().createUserWithEmailAndPassword(
        formData.email, 
        formData.password
      );

      // Reserve username
      transaction.set(usernameRef, {
        uid: userCredential.user.uid,
        createdAt: firestore.FieldValue.serverTimestamp()
      });

      // Create user document
      const userRef = firestore().collection('users')
        .doc(userCredential.user.uid);
      transaction.set(userRef, {
        uid: userCredential.user.uid,
        email: formData.email,
        username: formData.username.toLowerCase(),
        displayName: formData.username,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // Update profile and send verification
      await userCredential.user.updateProfile({ 
        displayName: formData.username 
      });
      await userCredential.user.sendEmailVerification();
      
      toggleUIState('verificationSent', true);
      Alert.alert(
        'Verify Your Email',
        'A verification email has been sent. Please verify your email before logging in.',
        [{ text: 'OK', onPress: () => setIsLogin(true) }]
      );
    });
  };

  // Google Sign-In
  const signInWithGoogle = async () => {
    toggleUIState('loading', true);
    try {
      await GoogleSignin.hasPlayServices();
      const { idToken } = await GoogleSignin.signIn();
      const credential = auth.GoogleAuthProvider.credential(idToken);
      await auth().signInWithCredential(credential);
      navigation.replace('Home');
    } catch (error) {
      handleAuthError(error);
    } finally {
      toggleUIState('loading', false);
    }
  };

  // Password reset
  const handlePasswordReset = async () => {
    try {
      await auth().sendPasswordResetEmail(uiState.resetEmail);
      Alert.alert('Success', 'Password reset email sent. Check your inbox.');
      toggleUIState('showResetModal', false);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  // Error handling
  const handleAuthError = (error) => {
    let message = 'Authentication failed';
    const errorMap = {
      'auth/email-already-in-use': 'Email already in use',
      'auth/invalid-email': 'Invalid email address',
      'auth/weak-password': 'Password should be at least 6 characters',
      'auth/user-not-found': 'User not found',
      'auth/wrong-password': 'Wrong password',
      'auth/too-many-requests': 'Too many attempts. Try again later',
      'USERNAME_TAKEN': 'Username was just taken. Please try another.'
    };
    
    message = errorMap[error.code] || error.message || message;
    Alert.alert('Error', message);
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.innerContainer}>
        {/* Header */}
        <Image source={require('../../assets/logo.png')} style={styles.logo} />
        <Text style={styles.title}>TempChat</Text>

        {/* Auth Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, isLogin && styles.activeTab]}
            onPress={() => setIsLogin(true)}
          >
            <Text style={isLogin ? styles.activeTabText : styles.tabText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, !isLogin && styles.activeTab]}
            onPress={() => setIsLogin(false)}
          >
            <Text style={!isLogin ? styles.activeTabText : styles.tabText}>Sign Up</Text>
          </TouchableOpacity>
        </View>

        {/* Username Field (Signup only) */}
        {!isLogin && (
          <View style={styles.inputContainer}>
            <TextInput
              placeholder="Username"
              placeholderTextColor="#999"
              value={formData.username}
              onChangeText={(text) => handleChange('username', text)}
              style={styles.input}
              autoCapitalize="none"
            />
            {uiState.checkingUsername ? (
              <ActivityIndicator size="small" style={styles.statusIndicator} />
            ) : uiState.usernameAvailable === true ? (
              <Text style={[styles.statusIndicator, styles.available]}>✓ Available</Text>
            ) : uiState.usernameAvailable === false ? (
              <Text style={[styles.statusIndicator, styles.taken]}>✗ Taken</Text>
            ) : null}
          </View>
        )}

        {/* Email Field */}
        <View style={styles.inputContainer}>
        <TextInput
          placeholder="Email Address"
          placeholderTextColor="#999"
          value={formData.email}
          onChangeText={(text) => handleChange('email', text)}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        </View>

        {/* Password Field */}
        <View style={styles.inputContainer}>
          <TextInput
            placeholder="Password (min 6 characters)"
            placeholderTextColor="#999"
            value={formData.password}
            onChangeText={(text) => handleChange('password', text)}
            secureTextEntry={!uiState.showPassword}
            style={[styles.input, { flex: 1 }]}
          />
          <TouchableOpacity 
            style={styles.showButton}
            onPress={() => toggleUIState('showPassword', !uiState.showPassword)}
          >
            <Text style={styles.showButtonText}>
              {uiState.showPassword ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Forgot Password (Login only) */}
        {isLogin && (
          <TouchableOpacity 
            style={styles.forgotButton}
            onPress={() => toggleUIState('showResetModal', true)}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        )}

        {/* Verification Message */}
        {uiState.verificationSent && (
          <Text style={styles.verificationText}>
            Verification email sent! Please check your inbox.
          </Text>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.primaryButton, 
            uiState.loading && styles.disabledButton,
            !isLogin && uiState.usernameAvailable === false && styles.disabledButton
          ]}
          onPress={handleEmailAuth}
          disabled={
            uiState.loading || 
            (!isLogin && uiState.usernameAvailable === false)
          }
        >
          {uiState.loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isLogin ? 'Log In' : 'Sign Up'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Toggle Auth Mode */}
        <TouchableOpacity 
          style={styles.toggleAuth}
          onPress={() => {
            setIsLogin(!isLogin);
            toggleUIState('verificationSent', false);
          }}
        >
          <Text style={styles.toggleText}>
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Log In'}
          </Text>
        </TouchableOpacity>

        {/* Password Reset Modal */}
        <Modal 
          visible={uiState.showResetModal} 
          transparent 
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TextInput
                placeholder="Enter your email"
                placeholderTextColor="#999"
                value={uiState.resetEmail}
                onChangeText={(text) => toggleUIState('resetEmail', text)}
                style={styles.modalInput}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => toggleUIState('showResetModal', false)}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.resetButton]}
                  onPress={handlePasswordReset}
                >
                  <Text style={styles.modalButtonText}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  innerContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderColor: '#4a8cff',
  },
  tabText: {
    color: '#888',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 15,
  },
  input: {
    flex: 1,
    color: '#fff',
    paddingVertical: 15,
  },
  statusIndicator: {
    marginLeft: 10,
    fontSize: 15,
  },
  available: {
    color: '#4CAF50',
  },
  taken: {
    color: '#F44336',
  },
  showButton: {
    padding: 10,
  },
  showButtonText: {
    color: '#4a8cff',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 15,
  },
  forgotText: {
    color: '#888',
    fontSize: 14,
  },
  verificationText: {
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 15,
  },
  primaryButton: {
    backgroundColor: '#4a8cff',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  googleButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  googleButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  toggleAuth: {
    alignSelf: 'center',
  },
  toggleText: {
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#222',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#555',
  },
  resetButton: {
    backgroundColor: '#4a8cff',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default AuthScreen;