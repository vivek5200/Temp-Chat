import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  Modal
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const ChatScreen = ({ route, navigation }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [recipientData, setRecipientData] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editMessageId, setEditMessageId] = useState(null);

  const { chatId, recipientId, recipientName, recipientAvatar } = route.params;

  useEffect(() => {
    const fetchRecipientData = async () => {
      try {
        const userDoc = await firestore().collection('users').doc(recipientId).get();
        if (userDoc.exists) {
          setRecipientData(userDoc.data());

          const statusRef = firestore().collection('status').doc(recipientId);
          const unsubscribe = statusRef.onSnapshot((doc) => {
            if (doc.exists) {
              setIsOnline(doc.data().state === 'online');
            }
          });

          return () => unsubscribe();
        }
      } catch (error) {
        console.error('Error fetching recipient data:', error);
      }
    };

    fetchRecipientData();

    const messagesRef = firestore()
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('createdAt', 'desc');

    const unsubscribeMessages = messagesRef.onSnapshot((querySnapshot) => {
      const messagesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
      }));
      setMessages(messagesData);
      setLoading(false);
    });

    return () => unsubscribeMessages();
  }, [chatId, recipientId]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const currentUser = auth().currentUser;
    if (!currentUser) return;

    try {
      if (editMode && editMessageId) {
        // Edit existing message
        await firestore()
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .doc(editMessageId)
          .update({
            text: input,
            edited: true
          });

        setEditMode(false);
        setEditMessageId(null);
        setInput('');
      } else {
        // Send new message
        const newMessage = {
          text: input,
          from: currentUser.uid,
          createdAt: firestore.FieldValue.serverTimestamp(),
          read: false,
          edited: false
        };

        await firestore()
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .add(newMessage);

        await firestore()
          .collection('chats')
          .doc(chatId)
          .update({
            lastMessage: {
              text: input,
              timestamp: firestore.FieldValue.serverTimestamp(),
            },
            lastMessageAt: firestore.FieldValue.serverTimestamp(),
          });

        setInput('');
      }
    } catch (error) {
      console.error('Error sending/editing message:', error);
    }
  };

  const handleLongPress = (message) => {
    const isMe = message.from === auth().currentUser?.uid;
    if (!isMe) return;

    Alert.alert(
      'Message Options',
      'What would you like to do?',
      [
        {
          text: 'Edit',
          onPress: () => {
            setEditMode(true);
            setEditMessageId(message.id);
            setInput(message.text);
          }
        },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await firestore()
                .collection('chats')
                .doc(chatId)
                .collection('messages')
                .doc(message.id)
                .delete();
            } catch (error) {
              console.error('Error deleting message:', error);
            }
          },
          style: 'destructive'
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const renderMessage = ({ item }) => {
    const isMe = item.from === auth().currentUser?.uid;
    const time = item.createdAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';

    return (
      <TouchableOpacity onLongPress={() => handleLongPress(item)}>
        <View
          style={[
            styles.messageBubble,
            isMe ? styles.myMessage : styles.theirMessage,
          ]}
        >
          {!isMe && recipientAvatar && (
            <Image source={{ uri: recipientAvatar }} style={styles.avatarInMessage} />
          )}
          <View style={styles.messageContent}>
            <Text style={styles.messageText}>
              {item.text} {item.edited ? <Text style={{ fontSize: 10, color: '#9CA3AF' }}>(edited)</Text> : null}
            </Text>
            <View style={styles.metaContainer}>
              <Text style={styles.timestamp}>{time}</Text>
              {isMe && (
                <MaterialCommunityIcons
                  name={item.read ? 'check-all' : 'check'}
                  size={14}
                  color={item.read ? '#6366F1' : '#9CA3AF'}
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F1F5F9" />
        </TouchableOpacity>

        {recipientAvatar && (
          <Image source={{ uri: recipientAvatar }} style={styles.avatar} />
        )}

        <View style={styles.userInfo}>
          <Text style={styles.username}>{recipientName}</Text>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: isOnline ? '#10B981' : '#9CA3AF' }
              ]}
            />
            <Text style={styles.status}>
              {typing ? 'typing...' : isOnline ? 'online' : 'offline'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={{ marginLeft: 'auto' }}>
          <MaterialCommunityIcons name="dots-vertical" size={24} color="#F1F5F9" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContainer}
        renderItem={renderMessage}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>Start a conversation with {recipientName}</Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <TouchableOpacity>
          <MaterialCommunityIcons name="paperclip" size={22} color="#6B7280" />
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor="#6B7280"
          value={input}
          onChangeText={setInput}
          multiline
        />
        <TouchableOpacity onPress={sendMessage} disabled={!input.trim()}>
          <MaterialCommunityIcons
            name={editMode ? 'content-save' : 'send'}
            size={22}
            color={input.trim() ? '#6366F1' : '#6B7280'}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 12,
  },
  avatarInMessage: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  userInfo: {
    marginLeft: 12,
  },
  username: {
    color: '#F1F5F9',
    fontWeight: 'bold',
    fontSize: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  status: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  chatContainer: {
    padding: 16,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChatText: {
    color: '#6B7280',
    fontSize: 16,
  },
  messageBubble: {
    padding: 12,
    marginVertical: 4,
    borderRadius: 16,
    maxWidth: '80%',
    flexDirection: 'row',
  },
  messageContent: {
    flex: 1,
  },
  myMessage: {
    backgroundColor: '#4F46E5',
    alignSelf: 'flex-end',
    marginLeft: 40,
  },
  theirMessage: {
    backgroundColor: '#1F1F1F',
    alignSelf: 'flex-start',
    marginRight: 40,
  },
  messageText: {
    color: '#F1F5F9',
    fontSize: 15,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 10,
    color: '#D1D5DB',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
  },
  textInput: {
    flex: 1,
    marginHorizontal: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1F1F1F',
    color: '#F1F5F9',
    fontSize: 15,
    borderRadius: 25,
    maxHeight: 100,
  },
});

export default ChatScreen;