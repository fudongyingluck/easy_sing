import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StatusBar } from 'react-native'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PracticeScreen } from './screens/PracticeScreen'
import { RecordingsScreen } from './screens/RecordingsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TemplatesScreen } from './screens/TemplatesScreen'
import { initStorage } from './services/storage'
import { ThemeProvider, useTheme } from './context/ThemeContext'

const Tab = createBottomTabNavigator()

function AppNavigator() {
  const { colors, isDark } = useTheme()

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#FF6B6B',
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
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
          name="Templates"
          component={TemplatesScreen}
          options={{
            tabBarLabel: '模板',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="layers-outline" size={size} color={color} />
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
    </>
  )
}

export default function App() {
  useEffect(() => {
    initStorage()
  }, [])

  return (
    <ThemeProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </ThemeProvider>
  )
}
