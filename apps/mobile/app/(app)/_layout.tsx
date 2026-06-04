import { Tabs } from "expo-router";

export default function AppTabs() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#1F6FEB", headerTitleStyle: { color: "#0F172A" } }}>
      <Tabs.Screen name="index" options={{ title: "Beranda" }} />
      <Tabs.Screen name="attendance" options={{ title: "Absensi" }} />
      <Tabs.Screen name="payslips" options={{ title: "Slip Gaji" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
    </Tabs>
  );
}
