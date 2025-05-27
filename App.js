import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
GoogleSignin.configure({
  webClientId: '971166706801-8cmp8hpnje5ld6o5af087lh3kg137atb.apps.googleusercontent.com',
  offlineAccess: true, // Optional
  forceCodeForRefreshToken: true // Optional
});
const App = () => {
  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
};

export default App;