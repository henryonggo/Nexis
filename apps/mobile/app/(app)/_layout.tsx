import { Tabs } from "expo-router";

export default function AppTabs() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#2452E6", headerTitleStyle: { color: "#0B1220" } }}>
      <Tabs.Screen name="index" options={{ title: "Beranda" }} />
      <Tabs.Screen name="attendance" options={{ title: "Absensi" }} />
      <Tabs.Screen name="leave" options={{ title: "Cuti" }} />
      <Tabs.Screen name="claims" options={{ title: "Klaim" }} />
      <Tabs.Screen name="performance" options={{ title: "Kinerja" }} />
      <Tabs.Screen name="payslips" options={{ title: "Slip Gaji" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
    </Tabs>
  );
}
