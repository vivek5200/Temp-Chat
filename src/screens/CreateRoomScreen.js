import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  SafeAreaView,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import Ionicons from 'react-native-vector-icons/Ionicons';
import { firebase } from "../firebase/config"; // Adjust based on your Firebase setup

const CreateRoomScreen = ({ navigation }) => {
  // Form state
  const [roomName, setRoomName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [expiryTime, setExpiryTime] = useState("30 min");
  const [customMinutes, setCustomMinutes] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");

  
  // UI state
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  
  // Constants
  const expiryOptions = ["30 min", "1 hour", "6 hours", "12 hours", "24 hours", "Custom"];
  const usingCustomTime = expiryTime === "Custom";

  // Check if room name exists in Firestore
  const checkRoomNameExists = async (name) => {
    const snapshot = await firebase
      .firestore()
      .collection("rooms")
      .where("name", "==", name.trim())
      .get();
      
    return !snapshot.empty;
  };

  // Handle expiry time selection
  const handleExpirySelection = (option) => {
    setExpiryTime(option);
    setShowExpiryModal(false);
  };

  // Create room with validation
  const handleCreateRoom = async () => {
    Keyboard.dismiss();
    
    if (!roomName.trim()) {
      setNameError("Room name is required");
      return;
    }

    setIsLoading(true);
    
    try {
      // Check for existing room name
      const nameExists = await checkRoomNameExists(roomName);
      if (nameExists) {
        setNameError("Room name already exists");
        return;
      }
      if (!displayName.trim()) {
        setDisplayNameError("Display name is required");
        return;
      }      
      // Calculate expiry time (in minutes)
      let minutes = 30;
      if (usingCustomTime) {
        minutes = parseInt(customMinutes) || 30;
      } else {
        minutes = parseInt(expiryTime) || 30;
      }

      // Create room document
      // In handleCreateRoom():
await firebase.firestore().collection("rooms").add({
  name: roomName.trim(),
  passcode: passcode.trim() || null,
  createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  expiresAt: firebase.firestore.Timestamp.fromDate(
    new Date(Date.now() + minutes * 60000)
  ),
  createdBy: firebase.auth().currentUser.uid,
  // Store two versions:
  members: [firebase.auth().currentUser.uid], // Simple array for querying
  memberDetails: { // Detailed info in a map
    [firebase.auth().currentUser.uid]: {
      displayName: displayName.trim()
    }
  }
});


      Alert.alert("Success", "Room created successfully!");
      navigation.goBack();
      
    } catch (error) {
      console.error("Error creating room:", error);
      Alert.alert("Error", "Failed to create room. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Clear name error when typing
  useEffect(() => {
    if (roomName.trim() && nameError) {
      setNameError("");
    }
  }, [roomName]);

  useEffect(() => {
    if (displayName.trim() && displayNameError) {
      setDisplayNameError("");
    }
  }, [displayName]);
  

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Room</Text>
          <TouchableOpacity>
            <Ionicons name="help-circle-outline" size={24} color="#F1F5F9" />
          </TouchableOpacity>
        </View>

        {/* Form */}
        <ScrollView 
          contentContainerStyle={styles.formContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Room Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Room Name</Text>
            <TextInput
              style={[styles.input, nameError && styles.inputError]}
              placeholder="Enter a unique room name..."
              placeholderTextColor="#6B7280"
              value={roomName}
              onChangeText={setRoomName}
              autoCapitalize="none"
              maxLength={30}
            />
            {nameError ? (
              <Text style={styles.errorText}>{nameError}</Text>
            ) : null}
          </View>

          {/* Passcode */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Room Passcode (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Set a passcode..."
              placeholderTextColor="#6B7280"
              secureTextEntry
              value={passcode}
              onChangeText={setPasscode}
              maxLength={20}
            />
          </View>

          <View style={styles.inputGroup}>
  <Text style={styles.label}>Your Name</Text>
  <TextInput
    style={[styles.input, displayNameError && styles.inputError]}
    placeholder="Enter the name you want to join with..."
    placeholderTextColor="#6B7280"
    value={displayName}
    onChangeText={setDisplayName}
    maxLength={30}
  />
  {displayNameError ? (
    <Text style={styles.errorText}>{displayNameError}</Text>
  ) : null}
</View>


          {/* Expiry Time */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Expire After</Text>
            <TouchableOpacity
              style={styles.pickerContainer}
              onPress={() => setShowExpiryModal(true)}
            >
              <Text style={styles.pickerText}>
                {usingCustomTime ? `${customMinutes} min (Custom)` : expiryTime}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>

            {usingCustomTime && (
              <View style={styles.customTimeContainer}>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  placeholder="Enter minutes (e.g., 45)"
                  placeholderTextColor="#6B7280"
                  keyboardType="numeric"
                  value={customMinutes}
                  onChangeText={(text) => setCustomMinutes(text.replace(/[^0-9]/g, ""))}
                />
                <Text style={styles.customTimeHint}>
                  Enter duration in minutes (max 10080)
                </Text>
              </View>
            )}
          </View>
          
        </ScrollView>

        {/* Create Button */}
        <TouchableOpacity
          style={[
            styles.createButton,
            {
              opacity: roomName && (!usingCustomTime || customMinutes) ? 1 : 0.6,
            },
          ]}
          onPress={handleCreateRoom}
          disabled={
            isLoading || !roomName || (usingCustomTime && !customMinutes)
          }
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createButtonText}>Create Room</Text>
          )}
        </TouchableOpacity>
          
        {/* Expiry Time Modal */}
        <Modal
          visible={showExpiryModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowExpiryModal(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowExpiryModal(false)}>
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>

          <View style={styles.modalContent}>
            {expiryOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.modalOption}
                onPress={() => handleExpirySelection(option)}
              >
                <Text style={styles.modalOptionText}>{option}</Text>
                {(option === expiryTime || (option === "Custom" && usingCustomTime)) && (
                  <Ionicons name="checkmark" size={20} color="#4F46E5" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Modal>
      </View>

      
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0F0F0F",
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  headerTitle: {
    color: "#F1F5F9",
    fontSize: 18,
    fontWeight: "600",
  },
  formContainer: {
    paddingTop: 24,
    paddingBottom: 16,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    color: "#F1F5F9",
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "#1C1C1E",
    color: "#F1F5F9",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  inputError: {
    borderColor: "#EF4444",
    borderWidth: 1,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  pickerContainer: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerText: {
    color: "#F1F5F9",
    fontSize: 16,
  },
  customTimeContainer: {
    marginTop: 8,
  },
  customTimeHint: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  visibilityContainer: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  visibilityText: {
    color: "#F1F5F9",
    fontSize: 16,
  },
  createButton: {
    backgroundColor: "#4F46E5",
    borderRadius: 25,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalOption: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalOptionText: {
    color: "#F1F5F9",
    fontSize: 16,
  },
});

export default CreateRoomScreen;