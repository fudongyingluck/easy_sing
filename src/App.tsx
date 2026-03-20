import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { MainScreen } from './screens/MainScreen'
import { RecordingsScreen } from './screens/RecordingsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { initStorage } from './services/storage'

const Stack = createNativeStackNavigator()

export default function App() {
  useEffect(() => {
    // 初始化存储
    initStorage()
  }, [])

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false
        }}
      >
        <Stack.Screen name="Main" component={MainScreen} />
        <Stack.Screen name="Recordings" component={RecordingsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
