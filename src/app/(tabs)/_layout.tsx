import { Tabs } from "expo-router";
import { ActivityIndicator, Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useAuth } from "@/providers/AuthProvider";

const tabIcons = {
  home: require("../../../assets/images/tabIcons/home_ic.svg"),
  matches: require("../../../assets/images/tabIcons/macthes_ic.svg"),
  leaderboard: require("../../../assets/images/tabIcons/leaderboard_ic.svg"),
  myBets: require("../../../assets/images/tabIcons/bets_ic.svg"),
  profile: require("../../../assets/images/tabIcons/profile_ic.svg"),
} as const;

export default function TabsLayout() {
  const { isLoading, user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const desktopTabBarWidth = Math.min(width - 32, 960);

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
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
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
            <Image
              source={tabIcons.home}
              style={[styles.icon, { tintColor: color }]}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Matches",
          tabBarIcon: ({ color }) => (
            <Image
              source={tabIcons.matches}
              style={[styles.icon, { tintColor: color }]}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ color }) => (
            <Image
              source={tabIcons.leaderboard}
              style={[styles.icon, { tintColor: color }]}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="my-bets"
        options={{
          title: "My Bets",
          tabBarIcon: ({ color }) => (
            <Image
              source={tabIcons.myBets}
              style={[styles.icon, { tintColor: color }]}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Image
              source={tabIcons.profile}
              style={[styles.icon, { tintColor: color }]}
            />
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
  icon: {
    width: 18,
    height: 18,
    resizeMode: "contain",
  },
});
