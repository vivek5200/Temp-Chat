import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

// Debounce Hook
const useDebouncedValue = (value, delay = 500) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

const JoinRoomScreen = ({ navigation }) => {
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [roomInfo, setRoomInfo] = useState(null);

  const debouncedRoomName = useDebouncedValue(roomName.trim());

  useEffect(() => {
    const checkRoom = async () => {
      try {
        const snapshot = await firestore()
          .collection('rooms')
          .where('name', '==', debouncedRoomName)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const roomDoc = snapshot.docs[0];
          const data = roomDoc.data();
          const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);

          if (new Date() > expiresAt) {
            setRoomInfo(null);
            setError('This room has expired');
          } else {
            setRoomInfo({ id: roomDoc.id, ...data });
            setError('');
          }
        } else {
          setRoomInfo(null);
          setError('Room not found');
        }
      } catch (err) {
        console.error('Room check error:', err);
        setError('Error checking room');
        setRoomInfo(null);
      }
    };

    if (debouncedRoomName.length >= 3) {
      checkRoom();
    } else {
      setRoomInfo(null);
      setError('');
    }
  }, [debouncedRoomName]);

  const handleJoinRoom = async () => {
    const trimmedName = userName.trim();
    if (!trimmedName) return setError('Please enter your name');
    if (!roomInfo) return setError('Please find a valid room first');
  
    const currentUser = auth().currentUser; // ✅ GET CURRENT USER
    if (!currentUser) {
      setError('No user is logged in');
      return;
    }
  
    setLoading(true);
    try {
      if (roomInfo.isPrivate && roomInfo.passcode !== passcode) {
        setError('Incorrect passcode');
        setLoading(false);
        return;
      }
  
      const roomRef = firestore().collection('rooms').doc(roomInfo.id);
  
      await roomRef.update({
        members: firestore.FieldValue.arrayUnion(currentUser.uid),
        [`memberDetails.${currentUser.uid}`]: {
          displayName: trimmedName
        }
      });
  
      setLoading(false);
      navigation.navigate('RoomChat', {
        roomId: roomInfo.id,
        roomName: roomInfo.name,
        userName: trimmedName, // <- this should be set properly
      });
    } catch (error) {
      console.error('Join error:', error);
      setError('Failed to join room. Please try again.');
      setLoading(false);
    }
  };
  

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
        keyboardVerticalOffset={60}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Join Room</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor="#6B7280"
            value={userName}
            onChangeText={setUserName}
          />

          <TextInput
            style={styles.input}
            placeholder="Room name"
            placeholderTextColor="#6B7280"
            value={roomName}
            onChangeText={setRoomName}
          />

          {/* Passcode Field */}
          {roomInfo?.isPrivate && (
            <View style={styles.passcodeContainer}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Enter room passcode"
                placeholderTextColor="#6B7280"
                secureTextEntry={!showPasscode}
                value={passcode}
                onChangeText={setPasscode}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPasscode(!showPasscode)}
              >
                <Ionicons
                  name={showPasscode ? 'eye-off' : 'eye'}
                  size={20}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.button,
              (!userName || !roomInfo || loading) && styles.buttonDisabled
            ]}
            onPress={handleJoinRoom}
            disabled={!userName || !roomInfo || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="enter-outline" size={20} color="#FFF" />
                <Text style={styles.buttonText}>Join Room</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  headerTitle: {
    color: '#F1F5F9',
    fontSize: 20,
    fontWeight: '600',
  },
  form: {
    flex: 1,
  },
  input: {
    backgroundColor: '#1C1C1E',
    color: '#F1F5F9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  passcodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
  },
  error: {
    color: '#EF4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default JoinRoomScreen;
