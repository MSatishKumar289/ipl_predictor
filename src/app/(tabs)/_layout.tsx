import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/providers/AuthProvider";

export default function TabsLayout() {
  const { isLoading, user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= 1024;
  const desktopTabBarWidth = Math.min(width - 32, 960);
  const mobileTabBarPaddingBottom = Math.max(insets.bottom, 10);
  const mobileTabBarHeight = 62 + mobileTabBarPaddingBottom;

  if (isLoading) {
    return (
      <View style={styles.transitionScreen}>
        <ActivityIndicator size="large" color="#1E5AE0" />
        <Text style={styles.transitionText}>Loading account...</Text>
      </View>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1E5AE0",
        tabBarInactiveTintColor: "#93A1BC",
        sceneStyle: {
          backgroundColor: "#0A1325",
        },
        tabBarStyle: {
          backgroundColor: "#0C1831",
          borderTopColor: "#20324F",
          height: isDesktop ? 72 : mobileTabBarHeight,
          paddingTop: 8,
          paddingBottom: isDesktop ? 10 : mobileTabBarPaddingBottom,
          ...(isDesktop
            ? {
                width: desktopTabBarWidth,
                alignSelf: "center",
                borderWidth: 1,
                borderColor: "#20324F",
                borderRadius: 18,
                marginBottom: 12,
              }
            : null),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Ionicons name="home-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ color }) => (
            <Ionicons name="trophy-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="my-bets"
        options={{
          title: "My Bets",
          tabBarIcon: ({ color }) => (
            <Ionicons name="ticket-outline" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-outline" size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  transitionScreen: {
    flex: 1,
    backgroundColor: "#0A1325",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  transitionText: {
    color: "#DDE5F7",
    fontSize: 16,
    fontWeight: "600",
  },
});
