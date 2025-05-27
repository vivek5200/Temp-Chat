import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, SafeAreaView, StatusBar, Image, Alert, ActivityIndicator
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { useFocusEffect } from '@react-navigation/native';

const HomeScreen = ({ navigation, route }) => {
  const [activeTab, setActiveTab] = useState('chats');
  const [username, setUsername] = useState('');
  const [personalChats, setPersonalChats] = useState([]);
  const [temporaryRooms, setTemporaryRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const currentUser = auth().currentUser;
    if (currentUser) {
      setUsername(currentUser.displayName || 'User');
      fetchPersonalChats(currentUser.uid);
      fetchTemporaryRooms(currentUser.uid);
    }
  }, []);

  useEffect(() => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;
  
    setUsername(currentUser.displayName || 'User');
  
    // Unsubscribe function to clean up all listeners
    const unsubscribers = [];
  
    // Listen for user document changes
    const userUnsub = firestore()
      .collection('users')
      .doc(currentUser.uid)
      .onSnapshot(async (userDoc) => {
        const userData = userDoc.data();
        if (!userData?.chats) {
          setPersonalChats([]);
          return;
        }
  
        // For each chat, set up a listener
        userData.chats.forEach((chatId) => {
          const chatUnsub = firestore()
            .collection('chats')
            .doc(chatId)
            .onSnapshot(async (chatDoc) => {
              if (!chatDoc.exists) return;
  
              const chatData = chatDoc.data();
              const otherUserId = chatData.participants.find(
                (id) => id !== currentUser.uid
              );
  
              if (!otherUserId) return;
  
              const otherUserDoc = await firestore()
                .collection('users')
                .doc(otherUserId)
                .get();
              const otherUserData = otherUserDoc.data();
  
              setPersonalChats((prevChats) => {
                // Remove the old version of this chat if it exists
                const filteredChats = prevChats.filter(
                  (chat) => chat.id !== chatId
                );
  
                // Add the updated chat
                return [
                  {
                    id: chatId,
                    userId: otherUserId,
                    name:
                      otherUserData.displayName ||
                      otherUserData.username ||
                      'Unknown',
                    lastMessage:
                      chatData.lastMessage?.text || 'No messages yet',
                    time: formatTimestamp(chatData.lastMessage?.timestamp),
                    unread: 0,
                    avatar:
                      otherUserData.photoURL ||
                      'https://randomuser.me/api/portraits/lego/5.jpg',
                  },
                  ...filteredChats,
                ];
              });
            });
  
          unsubscribers.push(chatUnsub);
        });
      });
  
    unsubscribers.push(userUnsub);
  
    fetchTemporaryRooms(currentUser.uid);
  
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []); 

  useFocusEffect(
    React.useCallback(() => {
      const currentUser = auth().currentUser;
      if (!currentUser) return;
  
      const unsubscribe = firestore()
        .collection('rooms')
        .where('members', 'array-contains', currentUser.uid)
        .where('expiresAt', '>', new Date())
        .orderBy('expiresAt', 'asc')
        .onSnapshot((snapshot) => {
          const rooms = snapshot.docs.map((doc) => {
            const data = doc.data();
            const userDetails = data.memberDetails?.[currentUser.uid] || {};
            
            return {
              id: doc.id,
              name: data.name,
              isPrivate: !!data.passcode,
              expiresAt: data.expiresAt.toDate(),
              createdAt: data.createdAt.toDate(),
              createdBy: data.createdBy,
              passcode: data.passcode || '',
              displayName: userDetails.displayName || 'You',
              lastMessage: data.isPrivate ? 'Private room' : 'Public room',
              time: formatTimestamp(data.createdAt),
              expiresIn: getTimeRemaining(data.expiresAt.toDate()),
            };
          });
  
          setTemporaryRooms(rooms);
          
          // Schedule cleanup for new rooms
          rooms.forEach((room) => {
            scheduleRoomCleanup(room.id, room.expiresAt);
          });
        });
  
      return () => unsubscribe();
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      const currentUser = auth().currentUser;
      if (currentUser) {
        fetchTemporaryRooms(currentUser.uid);
      }
    }, [])
  );

  useEffect(() => {
    if (route.params?.newChat) {
      handleNewChat(route.params.newChat);
      // Clear the params after handling to avoid duplicate calls
      navigation.setParams({ newChat: undefined, userProfile: undefined });
    }
  }, [route.params?.newChat]);

  const fetchPersonalChats = async (userId) => {
    try {
      setLoading(true);
      setError(null);
      
      const userDoc = await firestore().collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        setPersonalChats([]);
        return;
      }

      const userData = userDoc.data();
      if (!userData.chats || userData.chats.length === 0) {
        setPersonalChats([]);
        return;
      }

      const chats = [];
      
      for (const chatId of userData.chats) {
        try {
          const chatDoc = await firestore().collection('chats').doc(chatId).get();
          
          if (chatDoc.exists) {
            const chatData = chatDoc.data();
            const otherUserId = chatData.participants.find(id => id !== userId);
            
            if (otherUserId) {
              const otherUserDoc = await firestore().collection('users').doc(otherUserId).get();
              
              if (otherUserDoc.exists) {
                const otherUserData = otherUserDoc.data();
                chats.push({
                  id: chatId,
                  userId: otherUserId,
                  name: otherUserData.displayName || otherUserData.username || 'Unknown',
                  lastMessage: chatData.lastMessage?.text || 'No messages yet',
                  time: formatTimestamp(chatData.lastMessage?.timestamp),
                  unread: 0,
                  avatar: otherUserData.photoURL || 'https://randomuser.me/api/portraits/lego/5.jpg'
                });
              }
            }
          }
        } catch (chatError) {
          console.error(`Error processing chat ${chatId}:`, chatError);
        }
      }

      setPersonalChats(chats);
    } catch (error) {
      console.error('Error fetching chats:', error);
      setError('Failed to load chats. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemporaryRooms = async (userId) => {
    try {
      const now = new Date();
    const roomsSnapshot = await firestore()
      .collection('rooms')
      .where('members', 'array-contains', userId) // Now matches simple UID
      .where('expiresAt', '>', now)
      .orderBy('expiresAt', 'asc')
      .get();

    const rooms = roomsSnapshot.docs.map(doc => {
      const data = doc.data();
      const userDetails = data.memberDetails?.[userId] || {};
      
      return {
        id: doc.id,
        name: data.name,
        isPrivate: !!data.passcode,
        expiresAt: data.expiresAt.toDate(),
        createdAt: data.createdAt.toDate(),
        createdBy: data.createdBy,
        passcode: data.passcode || '',
        displayName: userDetails.displayName || 'You'
      };
    });

    setTemporaryRooms(rooms);
  
      const formattedRooms = rooms.map(room => ({
        id: room.id,
        name: room.name,
        lastMessage: room.isPrivate ? 'Private room' : 'Public room',
        time: formatTimestamp(room.createdAt),
        expiresIn: getTimeRemaining(room.expiresAt),
        expiresAt: room.expiresAt, // Keep the full date for cleanup
        isPrivate: room.isPrivate,
        passcode: room.passcode
      }));
  
      setTemporaryRooms(formattedRooms);
      
      // Schedule cleanup for each room
      rooms.forEach(room => {
        scheduleRoomCleanup(room.id, room.expiresAt);
      });
    } catch (error) {
      console.error('Error fetching temporary rooms:', error);
    }
  };

  const scheduleRoomCleanup = (roomId, expiryDate) => {
    const now = new Date();
    const timeUntilExpiry = expiryDate - now;
  
    if (timeUntilExpiry > 0) {
      setTimeout(async () => {
        try {
          // Delete the room and all its messages
          await deleteRoomAndMessages(roomId);
          
          // Update local state if the component is still mounted
          setTemporaryRooms(prev => prev.filter(room => room.id !== roomId));
        } catch (error) {
          console.error('Error cleaning up room:', error);
        }
      }, timeUntilExpiry);
    }
  };
  
  const deleteRoomAndMessages = async (roomId) => {
    try {
      // Delete all messages in the room first
      const messagesRef = firestore().collection('rooms').doc(roomId).collection('messages');
      const messagesSnapshot = await messagesRef.get();
      
      const deleteBatch = firestore().batch();
      messagesSnapshot.forEach(doc => {
        deleteBatch.delete(doc.ref);
      });
      await deleteBatch.commit();
  
      // Then delete the room itself
      await firestore().collection('rooms').doc(roomId).delete();
      
      console.log(`Room ${roomId} and its messages deleted successfully`);
    } catch (error) {
      console.error('Error deleting room:', error);
      throw error;
    }
  };

  const getTimeRemaining = (expiryDate) => {
    const now = new Date();
    const diff = expiryDate - now;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hours`;
    return `${Math.floor(minutes / 1440)} days`;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const handleNewChat = async (newChatUserId, userProfile) => {
  try {
    const currentUserId = auth().currentUser?.uid;
    if (!currentUserId) {
      Alert.alert('Error', 'Not authenticated');
      return;
    }

    // Use the provided userProfile if available
    const getUserProfile = async () => {
      if (userProfile) {
        return userProfile;
      }
      const userDoc = await firestore().collection('users').doc(newChatUserId).get();
      return userDoc.exists ? userDoc.data() : null;
    };

    // Check both local state and Firestore for existing chat
    const existingChat = personalChats.find(chat => chat.userId === newChatUserId);
    if (existingChat) {
      navigation.navigate('Chat', {
        chatId: existingChat.id,
        recipientName: existingChat.name,
        recipientAvatar: existingChat.avatar,
        recipientId: existingChat.userId
      });
      return;
    }

    // Check Firestore for existing chats between these users
    const querySnapshot = await firestore()
      .collection('chats')
      .where('participants', 'array-contains', currentUserId)
      .get();

    const existingFirestoreChat = querySnapshot.docs.find(doc => 
      doc.data().participants.includes(newChatUserId)
    );

    if (existingFirestoreChat) {
      const userData = await getUserProfile();
      if (userData) {
        const chatData = existingFirestoreChat.data();
        
        const chatToAdd = {
          id: existingFirestoreChat.id,
          userId: newChatUserId,
          name: userData.displayName || userData.username || 'Unknown',
          lastMessage: chatData.lastMessage?.text || 'Say hello!',
          time: formatTimestamp(chatData.lastMessage?.timestamp) || 'Just now',
          unread: 1,
          avatar: userData.photoURL || 'https://randomuser.me/api/portraits/lego/5.jpg'
        };

        setPersonalChats(prev => {
          if (prev.some(chat => chat.id === chatToAdd.id)) {
            return prev;
          }
          return [chatToAdd, ...prev];
        });
        
        navigation.navigate('Chat', {
          chatId: existingFirestoreChat.id,
          recipientName: chatToAdd.name,
          recipientAvatar: chatToAdd.avatar,
          recipientId: newChatUserId
        });
      }
      return;
    }

    // Create new chat if none exists
    const chatRef = firestore().collection('chats').doc();
    const newChatData = {
      id: chatRef.id,
      participants: [currentUserId, newChatUserId],
      createdAt: firestore.FieldValue.serverTimestamp(),
      lastMessage: null
    };
    
    await chatRef.set(newChatData);

    // Update both users' chat lists
    const batch = firestore().batch();
    batch.update(firestore().collection('users').doc(currentUserId), {
      chats: firestore.FieldValue.arrayUnion(chatRef.id)
    });
    batch.update(firestore().collection('users').doc(newChatUserId), {
      chats: firestore.FieldValue.arrayUnion(chatRef.id)
    });
    await batch.commit();

    // Get recipient data
    const userData = await getUserProfile();
    if (userData) {
      const newChat = {
        id: chatRef.id,
        userId: newChatUserId,
        name: userData.displayName || userData.username || 'Unknown',
        lastMessage: 'Say hello!',
        time: 'Just now',
        unread: 1,
        avatar: userData.photoURL || 'https://randomuser.me/api/portraits/lego/5.jpg'
      };

      setPersonalChats(prev => [newChat, ...prev]);
      
      setTimeout(() => {
        navigation.navigate('Chat', {
          chatId: chatRef.id,
          recipientName: newChat.name,
          recipientAvatar: newChat.avatar,
          recipientId: newChat.userId
        });
      }, 100);
    }
  } catch (error) {
    console.error('Error creating new chat:', error);
    Alert.alert('Error', 'Failed to create new chat. Please try again.');
  }
};
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', onPress: () => navigation.replace('Auth'), style: 'destructive' }
    ]);
  };

  const openSearchScreen = () => {
    navigation.navigate('SearchUser');
  };

  const navigateToChat = (chat) => {
    navigation.navigate('Chat', { 
      chatId: chat.id,
      recipientName: chat.name,
      recipientAvatar: chat.avatar,
      recipientId: chat.userId
    });
  };

  const navigateToRoom = (room) => {
    navigation.navigate('RoomChat', { 
      roomId: room.id,
      roomName: room.name,
      userName: room.displayName,
    });
  };

  const handleDeleteChat = async (chatId) => {
    try {
      const currentUserId = auth().currentUser?.uid;
      if (!currentUserId) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }
  
      // Delete all messages in the chat first
      const messagesRef = firestore().collection('chats').doc(chatId).collection('messages');
      const messagesSnapshot = await messagesRef.get();
      
      const deleteBatch = firestore().batch();
      messagesSnapshot.forEach(doc => {
        deleteBatch.delete(doc.ref);
      });
      await deleteBatch.commit();
  
      // Then delete the chat document itself
      await firestore().collection('chats').doc(chatId).delete();
  
      // Remove the chat from the current user's chat list
      await firestore().collection('users').doc(currentUserId).update({
        chats: firestore.FieldValue.arrayRemove(chatId)
      });
  
      // Update the local state to remove the deleted chat
      setPersonalChats(prevChats => prevChats.filter(chat => chat.id !== chatId));
  
      console.log('Chat and messages deleted successfully');
    } catch (error) {
      console.error('Error deleting chat:', error);
      Alert.alert('Error', 'Failed to delete chat. Please try again.');
    }
  };

  const handleLongPress = (chatItem) => {
    Alert.alert(
      'Delete Chat',
      `Are you sure you want to delete the chat with ${chatItem.name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteChat(chatItem.id),
        },
      ]
    );
  };

  if (loading && personalChats.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#4a8cff" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchPersonalChats(auth().currentUser?.uid)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Image
            source={{ uri: auth().currentUser?.photoURL || 'https://randomuser.me/api/portraits/men/1.jpg' }}
            style={styles.profileIcon}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.appTitle}>TempChat</Text>
          <Text style={styles.welcomeText}>Hi, {username}! 😊</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chats' && styles.activeTab]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabText, activeTab === 'chats' && styles.activeTabText]}>
            Personal Chats
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rooms' && styles.activeTab]}
          onPress={() => setActiveTab('rooms')}
        >
          <Text style={[styles.tabText, activeTab === 'rooms' && styles.activeTabText]}>
            Temporary Rooms
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'rooms' ? (
        <>
          {/* Room Actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('CreateRoom')}
            >
              <Text style={styles.actionButtonText}>➕ Create Room</Text>
              <Text style={styles.actionSubtext}>Start a new temporary chat room</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('JoinRoom')}
            >
              <Text style={styles.actionButtonText}>🔑 Join Room</Text>
              <Text style={styles.actionSubtext}>Enter an existing chat room</Text>
            </TouchableOpacity>
          </View>

          {/* Rooms List */}
          <Text style={styles.sectionTitle}>Your Temporary Rooms</Text>
          {temporaryRooms.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No active rooms</Text>
              <Text style={styles.emptyStateSubtext}>Create or join a room to start chatting</Text>
            </View>
          ) : (
            <FlatList
              data={temporaryRooms}
              keyExtractor={item => item.id}
              // In the FlatList renderItem for rooms:
renderItem={({ item }) => {
  const isExpired = new Date() > new Date(item.expiresAt);
  if (isExpired) return null; // Don't render expired rooms

  return (
    <TouchableOpacity 
      style={styles.roomItem}
      onPress={() => navigateToRoom(item)}
    >
      <View style={styles.roomHeader}>
        <Text style={styles.roomName}>{item.name}</Text>
        <Text style={styles.roomTime}>{item.time}</Text>
      </View>
      <Text style={styles.roomMessage}>{item.lastMessage}</Text>
      <Text style={styles.roomExpiry}>Expires in: {item.expiresIn}</Text>
    </TouchableOpacity>
  );
}}
            />
          )}
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.addChatButton} onPress={openSearchScreen}>
            <Text style={styles.addChatButtonText}>➕ New Chat</Text>
          </TouchableOpacity>

          {personalChats.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No chats yet</Text>
              <Text style={styles.emptyStateSubtext}>Start a new chat to begin messaging</Text>
            </View>
          ) : (
            <FlatList
              data={personalChats}
              keyExtractor={item => item.id}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.chatItem}
                  onPress={() => navigateToChat(item)}
                  onLongPress={() => handleLongPress(item)}
                  delayLongPress={200}
                  activeOpacity={0.7}
                >
                  <Image 
                    source={{ uri: item.avatar }} 
                    style={styles.chatAvatar} 
                    onError={() => console.log('Error loading avatar')}
                  />
                  <View style={styles.chatContent}>
                    <View style={styles.chatHeader}>
                      <Text style={styles.chatName}>{item.name}</Text>
                      <Text style={styles.chatTime}>{item.time}</Text>
                    </View>
                    <Text style={styles.chatMessage}>{item.lastMessage}</Text>
                  </View>
                  {item.unread > 0 && <View style={styles.unreadBadge} />}
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    padding: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#252525'
  },
  profileIcon: { 
    width: 40, 
    height: 40, 
    borderRadius: 20 
  },
  headerCenter: { 
    alignItems: 'center' 
  },
  appTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#ffffff' 
  },
  welcomeText: { 
    fontSize: 14, 
    color: '#aaaaaa' 
  },
  logoutText: { 
    color: '#ff4444', 
    fontWeight: 'bold' 
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  tab: { 
    flex: 1, 
    paddingVertical: 16, 
    alignItems: 'center' 
  },
  activeTab: { 
    borderBottomWidth: 2, 
    borderBottomColor: '#4a8cff' 
  },
  tabText: { 
    color: '#aaaaaa', 
    fontWeight: '600' 
  },
  activeTabText: { 
    color: '#ffffff' 
  },
  actionsContainer: { 
    padding: 16 
  },
  actionButton: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  actionSubtext: { 
    color: '#777777', 
    fontSize: 14 
  },
  sectionTitle: {
    color: '#aaaaaa',
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f0f0f',
  },
  addChatButton: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  addChatButtonText: { 
    color: '#4a8cff', 
    fontWeight: '600' 
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  chatAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  chatContent: { 
    flex: 1 
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chatName: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  chatTime: { 
    color: '#777777', 
    fontSize: 14 
  },
  chatMessage: { 
    color: '#aaaaaa', 
    fontSize: 14 
  },
  unreadBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4a8cff',
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#252525',
    marginHorizontal: 16,
  },
  roomItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  roomName: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  roomTime: { 
    color: '#777777', 
    fontSize: 14 
  },
  roomMessage: { 
    color: '#aaaaaa', 
    fontSize: 14, 
    marginBottom: 4 
  },
  roomExpiry: { 
    color: '#4a8cff', 
    fontSize: 12 
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: '#aaaaaa',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff4444',
    textAlign: 'center',
    margin: 20,
  },
  retryButton: {
    backgroundColor: '#4a8cff',
    padding: 12,
    borderRadius: 8,
    alignSelf: 'center',
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});

export default HomeScreen;