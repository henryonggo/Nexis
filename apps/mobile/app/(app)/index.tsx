import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Linking,
} from "react-native";
import { getMyEmployee } from "../../lib/attendance";
import {
  getMyPayslips,
  getPayslipSignedUrl,
  formatPeriod,
  formatRupiah,
  type Payslip,
} from "../../lib/payslips";
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

// ── Types ────────────────────────────────────────────────────────────────────

type Employee = { id: string; company_id: string; full_name: string };

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

const STATUS_BG: Record<LeaveStatus, string> = {
  pending: "#FEF3C7",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
  cancelled: "#F1F5F9",
};

const STATUS_TEXT: Record<LeaveStatus, string> = {
  pending: "#92400E",
  approved: "#166534",
  rejected: "#991B1B",
  cancelled: "#475569",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const s = status as LeaveStatus;
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: STATUS_BG[s] ?? "#F1F5F9" },
      ]}
    >
      <Text style={[styles.chipText, { color: STATUS_TEXT[s] ?? "#475569" }]}>
        {STATUS_LABEL[s] ?? status}
      </Text>
    </View>
  );
}

function RunStatusChip({ status }: { status: string }) {
  const isPaid = status === "paid" || status === "completed";
  return (
    <View style={[styles.chip, { backgroundColor: isPaid ? "#DCFCE7" : "#FEF3C7" }]}>
      <Text style={[styles.chipText, { color: isPaid ? "#166534" : "#92400E" }]}>
        {isPaid ? "Lunas" : "Menunggu"}
      </Text>
    </View>
  );
}

function BreakdownRow({
  label,
  amount,
  isDeduction = false,
  isBold = false,
}: {
  label: string;
  amount: number;
  isDeduction?: boolean;
  isBold?: boolean;
}) {
  if (amount === 0) return null;
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, isBold && styles.breakdownLabelBold]}>{label}</Text>
      <Text
        style={[
          styles.breakdownAmount,
          isDeduction && styles.breakdownDeduction,
          isBold && styles.breakdownAmountBold,
        ]}
      >
        {isDeduction ? `− ${formatRupiah(amount)}` : formatRupiah(amount)}
      </Text>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceView[]>([]);
  const [requests, setRequests] = useState<MyLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [leaveFormOpen, setLeaveFormOpen] = useState(false);

  // Leave form
  const [typeId, setTypeId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  async function loadAll(emp: Employee) {
    const [slips, t, b, r] = await Promise.all([
      getMyPayslips(emp.id),
      getLeaveTypes(emp.company_id),
      getMyBalances(emp.id),
      getMyLeaveRequests(emp.id),
    ]);
    setPayslips(slips);
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
          setError("Akun ini belum tertaut ke data karyawan. Hubungi HR Anda.");
          return;
        }
        setEmployee(emp);
        await loadAll(emp);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function openPayslip(slip: Payslip) {
    if (!slip.pdfPath) return;
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

  async function submitLeave() {
    if (!employee || !typeId) return;
    if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
      setLeaveError("Gunakan format tanggal YYYY-MM-DD.");
      return;
    }
    setLeaveBusy(true);
    setLeaveError(null);
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
      setLeaveFormOpen(false);
      await loadAll(employee);
    } catch (e) {
      setLeaveError(e instanceof Error ? e.message : "Gagal mengirim pengajuan.");
    } finally {
      setLeaveBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={C.blue} size="large" />
      </View>
    );
  }

  if (error && !employee) {
    return (
      <View style={[styles.screen, styles.center, { padding: 32 }]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const latest = payslips[0] ?? null;
  const history = payslips.slice(1, 7);
  const estimate =
    isValidISODate(startDate) && isValidISODate(endDate)
      ? estimateLeaveDays(startDate, endDate)
      : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <Text style={styles.greeting}>
        Selamat datang, {employee?.full_name?.split(" ")[0] ?? "—"} 👋
      </Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── Gaji Hero Card ───────────────────────────────────────────────── */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroLabel}>Gaji Bulan Ini</Text>
          {latest && <RunStatusChip status={latest.status} />}
        </View>

        {latest ? (
          <>
            <Text style={styles.heroAmount}>{formatRupiah(latest.netPay)}</Text>
            <Text style={styles.heroPeriod}>{formatPeriod(latest.periodYear, latest.periodMonth)}</Text>

            {/* Expandable breakdown */}
            <Pressable
              style={styles.breakdownToggle}
              onPress={() => setBreakdownOpen((v) => !v)}
            >
              <Text style={styles.breakdownToggleText}>
                {breakdownOpen ? "Sembunyikan rincian ▲" : "Lihat rincian ▼"}
              </Text>
            </Pressable>

            {breakdownOpen && (
              <View style={styles.breakdown}>
                <BreakdownRow label="Gaji Pokok" amount={latest.baseSalary} />
                <BreakdownRow label="Tunjangan" amount={latest.allowances} />
                <BreakdownRow label="Lembur" amount={latest.overtimePay} />
                <View style={styles.divider} />
                <BreakdownRow label="BPJS Kesehatan" amount={latest.bpjsKesEmployee} isDeduction />
                <BreakdownRow label="BPJS JHT" amount={latest.jhtEmployee} isDeduction />
                <BreakdownRow label="BPJS JP" amount={latest.jpEmployee} isDeduction />
                <BreakdownRow label="PPh 21" amount={latest.pph21} isDeduction />
                <BreakdownRow label="Potongan Pinjaman" amount={latest.loanDeduction} isDeduction />
                <View style={styles.divider} />
                <BreakdownRow label="Gaji Bersih" amount={latest.netPay} isBold />
              </View>
            )}

            <Pressable
              style={[styles.downloadBtn, !latest.pdfPath && styles.downloadBtnDisabled]}
              onPress={() => openPayslip(latest)}
              disabled={!latest.pdfPath || downloadingId === latest.id}
            >
              <Text style={styles.downloadBtnText}>
                {downloadingId === latest.id ? "Membuka…" : "⬇  Unduh Slip Gaji"}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={[styles.heroPeriod, { marginTop: 12 }]}>
            Belum ada slip gaji tersedia.
          </Text>
        )}
      </View>

      {/* ── Riwayat Gaji ─────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Riwayat Gaji</Text>
          {history.map((slip) => (
            <View key={slip.id} style={styles.historyRow}>
              <View style={styles.flex}>
                <Text style={styles.historyPeriod}>
                  {formatPeriod(slip.periodYear, slip.periodMonth)}
                </Text>
                <Text style={styles.historyNet}>{formatRupiah(slip.netPay)}</Text>
              </View>
              {slip.pdfPath && (
                <Pressable
                  onPress={() => openPayslip(slip)}
                  disabled={downloadingId === slip.id}
                  style={styles.historyDl}
                >
                  <Text style={styles.historyDlText}>
                    {downloadingId === slip.id ? "…" : "PDF"}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {/* ── Cuti & Izin ──────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cuti &amp; Izin</Text>

        {balances.length > 0 ? (
          <View style={styles.balanceGrid}>
            {balances.map((b) => (
              <View key={b.leaveTypeId} style={styles.balanceTile}>
                <Text style={styles.balanceDays}>{b.available}</Text>
                <Text style={styles.balanceUnit}>hari</Text>
                <Text style={styles.balanceName} numberOfLines={2}>
                  {b.leaveTypeName}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyNote}>Saldo cuti belum dikonfigurasi.</Text>
        )}

        <Pressable
          style={styles.primaryBtn}
          onPress={() => setLeaveFormOpen((v) => !v)}
        >
          <Text style={styles.primaryBtnText}>
            {leaveFormOpen ? "Batal" : "+ Ajukan Cuti"}
          </Text>
        </Pressable>

        {leaveFormOpen && (
          <View style={styles.leaveForm}>
            <Text style={styles.formLabel}>Jenis cuti</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeScroll}
            >
              {types.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.typeChip, typeId === t.id && styles.typeChipActive]}
                  onPress={() => setTypeId(t.id)}
                >
                  <Text
                    style={[styles.typeChipText, typeId === t.id && styles.typeChipTextActive]}
                  >
                    {t.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.formLabel}>Tanggal mulai</Text>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              placeholderTextColor={C.muted}
            />

            <Text style={styles.formLabel}>Tanggal selesai</Text>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              placeholderTextColor={C.muted}
            />

            <Text style={styles.formLabel}>Alasan (opsional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={reason}
              onChangeText={setReason}
              placeholder="Contoh: keperluan keluarga"
              multiline
              placeholderTextColor={C.muted}
            />

            {estimate > 0 && (
              <Text style={styles.estimateNote}>
                Estimasi {estimate} hari kerja
              </Text>
            )}
            {leaveError && <Text style={styles.errorText}>{leaveError}</Text>}

            <Pressable
              style={[styles.primaryBtn, (leaveBusy || !typeId) && styles.primaryBtnDisabled]}
              onPress={submitLeave}
              disabled={leaveBusy || !typeId}
            >
              <Text style={styles.primaryBtnText}>
                {leaveBusy ? "Mengirim…" : "Kirim Pengajuan"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Riwayat Pengajuan ────────────────────────────────────────────── */}
      {requests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Riwayat Pengajuan</Text>
          {requests.map((r) => (
            <View key={r.id} style={styles.requestRow}>
              <View style={styles.flex}>
                <Text style={styles.requestType}>{r.leaveTypeName}</Text>
                <Text style={styles.requestDates}>
                  {r.startDate === r.endDate
                    ? r.startDate
                    : `${r.startDate} – ${r.endDate}`}
                  {" · "}
                  {r.days} hari
                </Text>
                {r.decisionNote ? (
                  <Text style={styles.decisionNote}>"{r.decisionNote}"</Text>
                ) : null}
              </View>
              <StatusChip status={r.status} />
            </View>
          ))}
        </View>
      )}

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg: "#F7F8FA",
  white: "#FFFFFF",
  ink: "#0B1220",
  muted: "#5B6675",
  border: "#E3E8EF",
  blue: "#2452E6",
  blueLight: "#EEF2FF",
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 16 },
  center: { alignItems: "center", justifyContent: "center" },

  greeting: {
    fontSize: 20,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 16,
  },

  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: "#991B1B", fontSize: 13 },

  // ── Hero card ─────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  heroLabel: { fontSize: 13, fontWeight: "600", color: C.muted, letterSpacing: 0.4 },
  heroAmount: { fontSize: 32, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  heroPeriod: { fontSize: 13, color: C.muted, marginTop: 2 },

  breakdownToggle: { marginTop: 14 },
  breakdownToggleText: { fontSize: 13, color: C.blue, fontWeight: "600" },

  breakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownLabel: { fontSize: 13, color: C.muted },
  breakdownLabelBold: { color: C.ink, fontWeight: "700" },
  breakdownAmount: { fontSize: 13, color: C.ink },
  breakdownAmountBold: { fontWeight: "700" },
  breakdownDeduction: { color: "#DC2626" },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 4 },

  downloadBtn: {
    marginTop: 16,
    backgroundColor: C.blue,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  downloadBtnDisabled: { backgroundColor: "#94A3B8" },
  downloadBtnText: { color: C.white, fontWeight: "700", fontSize: 14 },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 12,
  },

  // ── History rows ──────────────────────────────────────────────────────────
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  flex: { flex: 1 },
  historyPeriod: { fontSize: 13, color: C.muted },
  historyNet: { fontSize: 15, fontWeight: "700", color: C.ink, marginTop: 2 },
  historyDl: {
    backgroundColor: C.blueLight,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  historyDlText: { color: C.blue, fontWeight: "700", fontSize: 12 },

  // ── Leave balance tiles ───────────────────────────────────────────────────
  balanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  balanceTile: {
    flex: 1,
    minWidth: 90,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    alignItems: "center",
  },
  balanceDays: { fontSize: 28, fontWeight: "800", color: C.blue },
  balanceUnit: { fontSize: 11, color: C.muted, marginTop: -2 },
  balanceName: {
    fontSize: 11,
    color: C.muted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 15,
  },
  emptyNote: { color: C.muted, fontSize: 13, marginBottom: 12 },

  // ── Primary button ────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: C.blue,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryBtnDisabled: { backgroundColor: "#94A3B8" },
  primaryBtnText: { color: C.white, fontWeight: "700", fontSize: 14 },

  // ── Leave form ────────────────────────────────────────────────────────────
  leaveForm: {
    marginTop: 14,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 0,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.muted,
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  typeScroll: { marginBottom: 2 },
  typeChip: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  typeChipActive: { backgroundColor: C.blue, borderColor: C.blue },
  typeChipText: { fontSize: 13, color: "#334155" },
  typeChipTextActive: { color: C.white, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.ink,
    fontSize: 14,
  },
  inputMultiline: { height: 72, textAlignVertical: "top" },
  estimateNote: { fontSize: 12, color: C.muted, marginTop: 6 },

  // ── Request rows ──────────────────────────────────────────────────────────
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  requestType: { fontSize: 14, fontWeight: "600", color: C.ink },
  requestDates: { fontSize: 12, color: C.muted, marginTop: 2 },
  decisionNote: { fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: 2 },

  // ── Status chips ──────────────────────────────────────────────────────────
  chip: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  chipText: { fontSize: 11, fontWeight: "700" },

  bottomPad: { height: 32 },
});
