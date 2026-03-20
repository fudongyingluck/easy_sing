import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
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
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#666',
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: '#eee',
            backgroundColor: '#fff'
          }
        }}
      >
        <Tab.Screen
          name="Practice"
          component={PracticeScreen}
          options={{
            tabBarLabel: '练习'
          }}
        />
        <Tab.Screen
          name="Recordings"
          component={RecordingsScreen}
          options={{
            tabBarLabel: '记录'
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: '设置'
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  )
}
