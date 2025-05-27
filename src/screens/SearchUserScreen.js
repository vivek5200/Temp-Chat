import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, FlatList, Image, ActivityIndicator, Alert
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const SearchUserScreen = ({ navigation }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    const user = auth().currentUser;
    if (user) {
      setCurrentUserId(user.uid);
    }
  }, []);

  const handleSearch = async () => {
    if (!search.trim() || search.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const searchTerm = search.toLowerCase();
      
      // Search by username (exact match first)
      const usernameQuery = firestore()
        .collection('users')
        .where('username', '==', searchTerm)
        .limit(5);

      // Search by displayName (partial match)
      const displayNameQuery = firestore()
        .collection('users')
        .where('displayName', '>=', searchTerm)
        .where('displayName', '<=', searchTerm + '\uf8ff')
        .limit(10);

      const [usernameSnapshot, displayNameSnapshot] = await Promise.all([
        usernameQuery.get(),
        displayNameQuery.get(),
      ]);

      // Combine results and remove duplicates
      const allUsers = [...usernameSnapshot.docs, ...displayNameSnapshot.docs]
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(user => user.id !== currentUserId); // Exclude current user

      // Remove duplicates by user ID
      const uniqueUsers = allUsers.filter(
        (user, index, self) => index === self.findIndex(u => u.id === user.id)
      );

      setResults(uniqueUsers);
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = (user) => {
    navigation.navigate('Home', {
      newChat: user.id,
      userProfile: {
        id: user.id,
        name: user.displayName || user.username,
        avatar: user.photoURL,
        username: user.username
      }
    });
  };

  // Debounce search to avoid excessive queries
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim().length >= 3) {
        handleSearch();
      } else if (search.trim().length === 0) {
        setResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  const renderUserItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.resultItem} 
      onPress={() => handleSelectUser(item)}
    >
      <Image 
        source={{ uri: item.photoURL || 'https://i.pravatar.cc/150?img=3' }} 
        style={styles.avatar} 
        onError={() => console.log('Error loading avatar')}
      />
      <View style={styles.userInfo}>
        <Text style={styles.name}>
          {item.displayName || item.username || 'Unknown User'}
        </Text>
        <Text style={styles.username}>@{item.username}</Text>
      </View>
      <Icon name="message-circle" size={24} color="#4a8cff" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Icon name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          placeholder="Search by username or name..."
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={setSearch}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4a8cff" />
        </View>
      ) : results.length === 0 && search.length >= 3 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No users found</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 0,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#2a2a2a',
  },
  userInfo: {
    flex: 1,
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  username: {
    color: '#888',
    fontSize: 14,
    marginBottom: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#252525',
    marginLeft: 62,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
});

export default SearchUserScreen;