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
  getLeaveTypes,
  getMyBalances,
  getMyLeaveRequests,
  submitLeaveRequest,
  estimateLeaveDays,
  isValidISODate,
  type LeaveType,
  type LeaveBalanceView,
  type MyLeaveRequest,
  type LeaveStatus,
} from "../../lib/leave";

type Employee = { id: string; company_id: string; full_name: string };

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

const STATUS_COLOR: Record<LeaveStatus, string> = {
  pending: "#B45309",
  approved: "#16A34A",
  rejected: "#DC2626",
  cancelled: "#5B6675",
};

export default function Leave() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceView[]>([]);
  const [requests, setRequests] = useState<MyLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeId, setTypeId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  async function load(emp: Employee) {
    const [t, b, r] = await Promise.all([
      getLeaveTypes(emp.company_id),
      getMyBalances(emp.id),
      getMyLeaveRequests(emp.id),
    ]);
    setTypes(t);
    setBalances(b);
    setRequests(r);
    if (!typeId && t[0]) setTypeId(t[0].id);
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
        setError(e instanceof Error ? e.message : "Gagal memuat data cuti.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const estimate =
    isValidISODate(startDate) && isValidISODate(endDate)
      ? estimateLeaveDays(startDate, endDate)
      : 0;

  async function submit() {
    if (!employee || !typeId) return;
    if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
      setError("Gunakan format tanggal YYYY-MM-DD.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitLeaveRequest({
        companyId: employee.company_id,
        employeeId: employee.id,
        leaveTypeId: typeId,
        startDate,
        endDate,
        halfDay: false,
        reason: reason.trim() || undefined,
      });
      setStartDate("");
      setEndDate("");
      setReason("");
      await load(employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim permintaan cuti.");
    } finally {
      setBusy(false);
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
      <Text style={styles.h1}>Cuti</Text>
      <Text style={styles.muted}>Ajukan cuti dan lihat saldo Anda.</Text>

      {balances.length > 0 && (
        <View style={styles.balanceCard}>
          {balances.map((b) => (
            <View key={b.leaveTypeId} style={styles.balanceRow}>
              <Text style={styles.balanceName}>{b.leaveTypeName}</Text>
              <Text style={styles.balanceValue}>{b.available} hari</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.section}>Pengajuan baru</Text>

      <Text style={styles.label}>Jenis cuti</Text>
      <View style={styles.chips}>
        {types.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.chip, typeId === t.id && styles.chipActive]}
            onPress={() => setTypeId(t.id)}
          >
            <Text style={[styles.chipText, typeId === t.id && styles.chipTextActive]}>{t.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Tanggal mulai</Text>
      <TextInput
        style={styles.input}
        value={startDate}
        onChangeText={setStartDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
      />
      <Text style={styles.label}>Tanggal selesai</Text>
      <TextInput
        style={styles.input}
        value={endDate}
        onChangeText={setEndDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
      />
      <Text style={styles.label}>Alasan (opsional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={reason}
        onChangeText={setReason}
        placeholder="Contoh: keperluan keluarga"
        multiline
      />

      {estimate > 0 && (
        <Text style={styles.muted}>Estimasi {estimate} hari kerja.</Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.btn, styles.btnPrimary, (busy || !typeId) && styles.btnDisabled]}
        onPress={submit}
        disabled={busy || !typeId}
      >
        <Text style={styles.btnPrimaryText}>{busy ? "Mengirim…" : "Ajukan cuti"}</Text>
      </Pressable>

      <Text style={styles.section}>Riwayat</Text>
      {requests.length === 0 && <Text style={styles.muted}>Belum ada pengajuan.</Text>}
      {requests.map((r) => (
        <View key={r.id} style={styles.histRow}>
          <View style={styles.flex}>
            <Text style={styles.histType}>{r.leaveTypeName}</Text>
            <Text style={styles.muted}>
              {r.startDate} → {r.endDate} · {r.days} hari
            </Text>
            {r.decisionNote ? <Text style={styles.note}>Catatan: {r.decisionNote}</Text> : null}
          </View>
          <Text style={[styles.status, { color: STATUS_COLOR[r.status] }]}>
            {STATUS_LABEL[r.status]}
          </Text>
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
  balanceCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E3E8EF",
  },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  balanceName: { color: "#0B1220" },
  balanceValue: { color: "#0B1220", fontWeight: "700" },
  section: { marginTop: 28, fontSize: 16, fontWeight: "700", color: "#0B1220" },
  label: { marginTop: 14, marginBottom: 6, color: "#334155", fontWeight: "600", fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#E3E8EF",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: "#2452E6", borderColor: "#2452E6" },
  chipText: { color: "#334155" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#E3E8EF",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0B1220",
  },
  multiline: { height: 72, textAlignVertical: "top" },
  btn: { borderRadius: 8, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 18 },
  btnPrimary: { backgroundColor: "#2452E6" },
  btnPrimaryText: { color: "#fff", fontWeight: "600" },
  btnDisabled: { backgroundColor: "#94A3B8" },
  error: { color: "#DC2626", marginTop: 12 },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E3E8EF",
  },
  flex: { flex: 1 },
  histType: { color: "#0B1220", fontWeight: "600" },
  note: { color: "#5B6675", fontSize: 12, marginTop: 2 },
  status: { fontWeight: "700", fontSize: 13 },
});
