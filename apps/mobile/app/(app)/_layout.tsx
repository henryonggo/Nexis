import { Tabs } from "expo-router";

/**
 * Employee-facing tab shell.
 * Two visible tabs: Home (single-page dashboard) + Profile.
 * Other screens (leave, payslips, attendance, claims, performance) remain as
 * routable paths but are hidden from the tab bar — all employee self-service
 * surfaces live on the Home dashboard page.
 */
export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2452E6",
        tabBarInactiveTintColor: "#5B6675",
        tabBarStyle: { backgroundColor: "#FFFFFF", borderTopColor: "#E3E8EF" },
        headerStyle: { backgroundColor: "#FFFFFF" },
        headerTitleStyle: { color: "#0B1220", fontWeight: "700" },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Beranda" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />

      {/* Hidden routes — keep files for future use but remove from tab bar */}
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="leave" options={{ href: null }} />
      <Tabs.Screen name="claims" options={{ href: null }} />
      <Tabs.Screen name="performance" options={{ href: null }} />
      <Tabs.Screen name="payslips" options={{ href: null }} />
    </Tabs>
  );
}
