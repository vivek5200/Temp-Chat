import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import * as ImagePicker from 'react-native-image-picker';
import { launchImageLibrary } from 'react-native-image-picker';

const ProfileScreen = ({ navigation }) => {
  const user = auth().currentUser;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        if (user) {
          setDisplayName(user.displayName || '');
          setEmail(user.email || '');
          setPhotoURL(user.photoURL || '');

          const doc = await firestore().collection('users').doc(user.uid).get();
          if (doc.exists) {
            const data = doc.data();
            setUsername(data.username || '');
          }
        }
        setLoading(false);
      } catch (error) {
        console.log('Error fetching user details:', error);
        Alert.alert('Error', 'Unable to fetch user data.');
        setLoading(false);
      }
    };

    fetchUserDetails();
  }, []);

  const handleImagePicker = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Image picker error');
        return;
      }

      const uri = result.assets?.[0]?.uri;
      if (uri) {
        await uploadImage(uri);
      }
    } catch (error) {
      console.log('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri) => {
    if (!user) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Generate a unique filename
      const filename = `profile_${user.uid}_${Date.now()}.jpg`;
      const reference = storage().ref(`profile_pictures/${filename}`);

      // Upload the file
      const task = reference.putFile(uri);

      // Track upload progress
      task.on('state_changed', (taskSnapshot) => {
        const progress = (taskSnapshot.bytesTransferred / taskSnapshot.totalBytes) * 100;
        setUploadProgress(progress);
      });

      // Wait for upload to complete
      await task;

      // Get download URL
      const url = await reference.getDownloadURL();

      // Update user profile with new photo URL
      await user.updateProfile({ photoURL: url });
      await firestore()
        .collection('users')
        .doc(user.uid)
        .update({ photoURL: url });

      // Update local state
      setPhotoURL(url);
      Alert.alert('Success', 'Profile picture updated!');
    } catch (error) {
      console.log('Upload error:', error);
      Alert.alert('Error', 'Failed to upload image');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSave = async () => {
    try {
      await user.updateProfile({ displayName });

      await firestore().collection('users').doc(user.uid).set({
        username,
        displayName
      }, { merge: true });

      Alert.alert('Success', 'Profile updated!');
      setEditing(false);
    } catch (error) {
      console.log('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile.');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => auth().signOut().then(() => navigation.replace('Auth'))
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#4a8cff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.profileContainer}>
        <Image
          source={{ uri: photoURL || 'https://randomuser.me/api/portraits/lego/5.jpg' }}
          style={styles.avatar}
        />
        
        {uploading ? (
          <View style={styles.uploadProgressContainer}>
            <Text style={styles.uploadProgressText}>
              Uploading: {Math.round(uploadProgress)}%
            </Text>
          </View>
        ) : (
          <TouchableOpacity onPress={handleImagePicker}>
            <Text style={styles.changePhoto}>Change Photo</Text>
          </TouchableOpacity>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.label}>Display Name</Text>
          {editing ? (
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              style={styles.input}
            />
          ) : (
            <Text style={styles.info}>{displayName || 'N/A'}</Text>
          )}

          <Text style={styles.label}>Username</Text>
          {editing ? (
            <TextInput
              value={username}
              onChangeText={setUsername}
              style={styles.input}
              autoCapitalize="none"
            />
          ) : (
            <Text style={styles.info}>{username || 'N/A'}</Text>
          )}

          <Text style={styles.label}>Email</Text>
          <Text style={styles.info}>{email || 'N/A'}</Text>
        </View>

        {editing ? (
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleSave}
            disabled={uploading}
          >
            <Text style={styles.buttonText}>Save Changes</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.button} 
            onPress={() => setEditing(true)}
            disabled={uploading}
          >
            <Text style={styles.buttonText}>Edit Profile</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogout}
          disabled={uploading}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    padding: 20,
  },
  profileContainer: {
    alignItems: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#4a8cff',
  },
  changePhoto: {
    color: '#4a8cff',
    marginBottom: 30,
    fontSize: 16,
  },
  uploadProgressContainer: {
    height: 20,
    marginBottom: 30,
  },
  uploadProgressText: {
    color: '#4a8cff',
  },
  infoSection: {
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  label: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 12,
  },
  info: {
    color: '#fff',
    fontSize: 16,
    marginTop: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  input: {
    color: '#fff',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#4a8cff',
    paddingBottom: 6,
  },
  button: {
    backgroundColor: '#4a8cff',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  logoutButton: {
    marginTop: 30,
    padding: 12,
    width: '100%',
    alignItems: 'center',
  },
  logoutText: {
    color: '#ff4d4d',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default ProfileScreen;