import { View, Text, StyleSheet } from "react-native";
import { useAuth } from "../../lib/auth";

export default function Home() {
  const { session } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Selamat datang 👋</Text>
      <Text style={styles.muted}>{session?.user.email}</Text>
      <Text style={styles.note}>
        Absensi (clock-in dengan GPS + selfie), slip gaji, dan pengajuan cuti hadir di Stage 3–5.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#F8FAFC" },
  h1: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  muted: { color: "#64748B", marginTop: 4 },
  note: { color: "#64748B", marginTop: 20, lineHeight: 20 },
});
