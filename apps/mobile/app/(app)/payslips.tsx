import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Linking } from "react-native";
import { getMyEmployee } from "../../lib/attendance";
import {
  getMyPayslips,
  getPayslipSignedUrl,
  formatPeriod,
  formatRupiah,
  type Payslip,
} from "../../lib/payslips";

export default function Payslips() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const emp = await getMyEmployee();
        if (!emp) {
          setError("Akun ini belum tertaut ke data karyawan.");
          return;
        }
        setPayslips(await getMyPayslips(emp.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat slip gaji.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function openPayslip(slip: Payslip) {
    if (!slip.pdfPath) {
      setError("Slip gaji belum tersedia untuk diunduh.");
      return;
    }
    setError(null);
    setDownloadingId(slip.id);
    try {
      const url = await getPayslipSignedUrl(slip.pdfPath);
      await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuka slip gaji.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#1F6FEB" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.h1}>Slip Gaji</Text>
      <Text style={styles.muted}>Unduh slip gaji bulanan Anda.</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {payslips.length === 0 && !error && (
        <Text style={[styles.muted, { marginTop: 20 }]}>Belum ada slip gaji.</Text>
      )}

      {payslips.map((slip) => (
        <View key={slip.id} style={styles.card}>
          <View style={styles.flex}>
            <Text style={styles.period}>{formatPeriod(slip.periodYear, slip.periodMonth)}</Text>
            <Text style={styles.muted}>Take-home: {formatRupiah(slip.netPay)}</Text>
          </View>
          <Pressable
            style={[styles.btn, styles.btnPrimary, !slip.pdfPath && styles.btnDisabled]}
            onPress={() => openPayslip(slip)}
            disabled={!slip.pdfPath || downloadingId === slip.id}
          >
            <Text style={styles.btnPrimaryText}>
              {downloadingId === slip.id ? "Membuka…" : "Unduh PDF"}
            </Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  center: { alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  muted: { color: "#64748B", marginTop: 4 },
  error: { color: "#DC2626", marginTop: 12 },
  card: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  flex: { flex: 1 },
  period: { fontSize: 16, fontWeight: "600", color: "#0F172A" },
  btn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: "#1F6FEB" },
  btnPrimaryText: { color: "#fff", fontWeight: "600" },
  btnDisabled: { backgroundColor: "#94A3B8" },
});
