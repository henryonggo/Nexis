import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { getMyEmployee } from "../../lib/attendance";
import {
  getMyGoals,
  updateMyGoalProgress,
  getMyReviews,
  acknowledgeReview,
  GOAL_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  type MyGoal,
  type MyReview,
} from "../../lib/performance";

type Employee = { id: string; company_id: string; full_name: string };

export default function Performance() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [goals, setGoals] = useState<MyGoal[]>([]);
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(emp: Employee) {
    const [g, r] = await Promise.all([getMyGoals(emp.id), getMyReviews(emp.id)]);
    setGoals(g);
    setReviews(r);
    setDrafts(Object.fromEntries(g.map((x) => [x.id, String(x.progress)])));
  }

  useEffect(() => {
    (async () => {
      try {
        const emp = await getMyEmployee();
        if (!emp) {
          setError("Akun ini belum tertaut ke data karyawan.");
          return;
        }
        setEmployee(emp);
        await load(emp);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data kinerja.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveProgress(goalId: string) {
    if (!employee) return;
    const value = Number(drafts[goalId] ?? "0");
    setBusyId(goalId);
    setError(null);
    try {
      await updateMyGoalProgress(goalId, value);
      await load(employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan progres.");
    } finally {
      setBusyId(null);
    }
  }

  async function ack(reviewId: string) {
    if (!employee) return;
    setBusyId(reviewId);
    setError(null);
    try {
      await acknowledgeReview(reviewId);
      await load(employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyetujui penilaian.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#2452E6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.h1}>Kinerja & KPI</Text>
      <Text style={styles.muted}>Pantau sasaran dan lihat hasil penilaian Anda.</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>Sasaran saya</Text>
      {goals.length === 0 && <Text style={styles.muted}>Belum ada sasaran.</Text>}
      {goals.map((g) => (
        <View key={g.id} style={styles.card}>
          <Text style={styles.goalTitle}>{g.title}</Text>
          {g.description ? <Text style={styles.muted}>{g.description}</Text> : null}
          <Text style={styles.metaRow}>
            Bobot {g.weight}% · {GOAL_STATUS_LABEL[g.status]}
          </Text>
          <View style={styles.progressRow}>
            <TextInput
              style={styles.progressInput}
              value={drafts[g.id] ?? ""}
              onChangeText={(v) => setDrafts((d) => ({ ...d, [g.id]: v.replace(/[^\d]/g, "") }))}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={styles.muted}>%</Text>
            <Pressable
              style={[styles.btn, styles.btnPrimary, busyId === g.id && styles.btnDisabled]}
              onPress={() => saveProgress(g.id)}
              disabled={busyId === g.id}
            >
              <Text style={styles.btnPrimaryText}>
                {busyId === g.id ? "Menyimpan…" : "Simpan"}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Text style={styles.section}>Penilaian saya</Text>
      {reviews.length === 0 && <Text style={styles.muted}>Belum ada penilaian.</Text>}
      {reviews.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.goalTitle}>
            Nilai: {r.overallRating !== null ? `${r.overallRating}/5` : "—"}
          </Text>
          {r.summary ? <Text style={styles.muted}>{r.summary}</Text> : null}
          <Text style={styles.metaRow}>{REVIEW_STATUS_LABEL[r.status]}</Text>
          {r.status === "submitted" && (
            <Pressable
              style={[styles.btn, styles.btnPrimary, styles.ackBtn, busyId === r.id && styles.btnDisabled]}
              onPress={() => ack(r.id)}
              disabled={busyId === r.id}
            >
              <Text style={styles.btnPrimaryText}>
                {busyId === r.id ? "Memproses…" : "Setujui penilaian"}
              </Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FA" },
  center: { alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 22, fontWeight: "700", color: "#0B1220" },
  muted: { color: "#5B6675", marginTop: 4 },
  section: { marginTop: 28, fontSize: 16, fontWeight: "700", color: "#0B1220" },
  error: { color: "#DC2626", marginTop: 12 },
  card: {
    marginTop: 14,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E3E8EF",
  },
  goalTitle: { fontSize: 15, fontWeight: "600", color: "#0B1220" },
  metaRow: { color: "#334155", fontSize: 13, marginTop: 6 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  progressInput: {
    width: 64,
    borderWidth: 1,
    borderColor: "#E3E8EF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#0B1220",
  },
  btn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  ackBtn: { marginTop: 12 },
  btnPrimary: { backgroundColor: "#2452E6" },
  btnPrimaryText: { color: "#fff", fontWeight: "600" },
  btnDisabled: { backgroundColor: "#94A3B8" },
});
