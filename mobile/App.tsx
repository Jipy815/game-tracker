import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import PresenceScreen from './screens/PresenceScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Presence" component={PresenceScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
