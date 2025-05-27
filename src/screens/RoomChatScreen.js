import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import Ionicons from 'react-native-vector-icons/Ionicons';

const RoomChatScreen = ({ route, navigation }) => {
  const { roomId, roomName, userName } = route.params;
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [roomExpired, setRoomExpired] = useState(false);
  const flatListRef = useRef();

  useEffect(() => {
    const unsubscribeRoom = firestore()
      .collection('rooms')
      .doc(roomId)
      .onSnapshot(doc => {
        const data = doc.data();
        if (!doc.exists || (data.expiresAt && data.expiresAt.toDate() < new Date())) {
          setRoomExpired(true);
          Alert.alert('Room Expired', 'This room has expired and will now close.');
          navigation.goBack();
        }
      });

    const unsubscribeMessages = firestore()
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .onSnapshot(snapshot => {
        const msgs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(msgs);
      });

    return () => {
      unsubscribeRoom();
      unsubscribeMessages();
    };
  }, [roomId]);

  const sendMessage = async () => {
    if (!messageText.trim()) return;
  
    const messagePayload = {
      text: messageText.trim(),
      senderName: userName || 'Anonymous',
      senderId: auth().currentUser?.uid || 'unknown',
      createdAt: firestore.FieldValue.serverTimestamp(),
    };
  
    // Check for undefined values before sending
    if (!messagePayload.text || !messagePayload.senderName || !messagePayload.senderId) {
      console.error('Invalid message payload:', messagePayload);
      Alert.alert('Error', 'Message data is incomplete.');
      return;
    }
  
    try {
      await firestore()
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .add(messagePayload);
  
      setMessageText('');
    } catch (error) {
      console.error('Send message error:', error);
      Alert.alert('Send Failed', error.message);
    }
  };
  

  const renderItem = ({ item }) => (
    <View style={styles.messageContainer}>
      <Text style={styles.sender}>{item.senderName}</Text>
      <Text style={styles.message}>{item.text}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{roomName}</Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          onContentSizeChange={() => flatListRef.current.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current.scrollToEnd({ animated: true })}
          contentContainerStyle={{ paddingBottom: 16 }}
        />

        {!roomExpired && (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message"
              placeholderTextColor="#6B7280"
              value={messageText}
              onChangeText={setMessageText}
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
              <Ionicons name="send" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
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
    marginBottom: 16,
  },
  headerTitle: {
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: '600',
  },
  messageContainer: {
    marginBottom: 12,
  },
  sender: {
    color: '#A5B4FC',
    fontWeight: '600',
    fontSize: 14,
  },
  message: {
    color: '#F1F5F9',
    fontSize: 16,
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: 16,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#6366F1',
    padding: 10,
    borderRadius: 999,
  },
});

export default RoomChatScreen;
