import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

interface EmployeeCard {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  status: string;
  company: string;
}

export default function Profile() {
  const { session, signOut } = useAuth();
  const [rows, setRows] = useState<EmployeeCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    // RLS returns only the employee records linked to this user (self-read).
    supabase
      .from("employees")
      .select("id, full_name, position, department, status, companies(name)")
      .eq("user_id", session.user.id)
      .then(({ data }) => {
        const mapped =
          (data as unknown as (Omit<EmployeeCard, "company"> & { companies: { name: string } | null })[] | null)?.map(
            (e) => ({
              id: e.id,
              full_name: e.full_name,
              position: e.position,
              department: e.department,
              status: e.status,
              company: e.companies?.name ?? "—",
            }),
          ) ?? [];
        setRows(mapped);
        setLoading(false);
      });
  }, [session]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.h1}>Profil saya</Text>
      <Text style={styles.muted}>{session?.user.email}</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#2452E6" />
      ) : rows.length === 0 ? (
        <Text style={styles.note}>
          Belum ada data kepegawaian untuk akun ini. Hubungi admin perusahaan Anda.
        </Text>
      ) : (
        rows.map((e) => (
          <View key={e.id} style={styles.card}>
            <Text style={styles.company}>{e.company}</Text>
            <Text style={styles.name}>{e.full_name}</Text>
            <Text style={styles.muted}>
              {(e.position ?? "—") + " · " + (e.department ?? "—")}
            </Text>
            <Text style={styles.badge}>{e.status}</Text>
          </View>
        ))
      )}

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Keluar</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FA" },
  h1: { fontSize: 22, fontWeight: "700", color: "#0B1220" },
  muted: { color: "#5B6675", marginTop: 4 },
  note: { color: "#5B6675", marginTop: 20, lineHeight: 20 },
  card: {
    backgroundColor: "#fff",
    borderColor: "#E3E8EF",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  company: { color: "#2452E6", fontSize: 12, fontWeight: "600" },
  name: { fontSize: 18, fontWeight: "700", color: "#0B1220", marginTop: 2 },
  badge: { marginTop: 8, color: "#0EA5A4", fontSize: 12 },
  signOut: { marginTop: 28, padding: 14, alignItems: "center" },
  signOutText: { color: "#DC2626", fontWeight: "600" },
});
