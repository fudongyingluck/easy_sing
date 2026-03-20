import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PracticeScreen } from './screens/PracticeScreen'
import { RecordingsScreen } from './screens/RecordingsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { initStorage } from './services/storage'

const Tab = createBottomTabNavigator()

export default function App() {
  useEffect(() => {
    // 初始化存储
    initStorage()
  }, [])

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#FF6B6B',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: '#eee',
            backgroundColor: '#fff',
            paddingTop: 4
          }
        }}
      >
        <Tab.Screen
          name="Practice"
          component={PracticeScreen}
          options={{
            tabBarLabel: '练习',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="musical-notes" size={size} color={color} />
            )
          }}
        />
        <Tab.Screen
          name="Recordings"
          component={RecordingsScreen}
          options={{
            tabBarLabel: '记录',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="folder" size={size} color={color} />
            )
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: '设置',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            )
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  )
}
