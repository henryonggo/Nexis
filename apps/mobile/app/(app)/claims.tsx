import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { getMyEmployee } from "../../lib/attendance";
import {
  getClaimTypes,
  getMyClaims,
  submitClaim,
  uploadReceipt,
  parseRupiah,
  formatRupiah,
  type ClaimType,
  type MyClaim,
  type ClaimStatus,
} from "../../lib/claims";

type Employee = { id: string; company_id: string; full_name: string };

const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  paid: "Dibayar",
};

const STATUS_COLOR: Record<ClaimStatus, string> = {
  pending: "#B45309",
  approved: "#16A34A",
  rejected: "#DC2626",
  paid: "#16A34A",
};

export default function Claims() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [types, setTypes] = useState<ClaimType[]>([]);
  const [claims, setClaims] = useState<MyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeId, setTypeId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  async function load(emp: Employee) {
    const [t, c] = await Promise.all([getClaimTypes(emp.company_id), getMyClaims(emp.id)]);
    setTypes(t);
    setClaims(c);
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
        setError(e instanceof Error ? e.message : "Gagal memuat data klaim.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function startCapture() {
    setError(null);
    if (!camPerm?.granted) {
      const res = await requestCamPerm();
      if (!res.granted) {
        setError("Izin kamera diperlukan untuk memotret struk.");
        return;
      }
    }
    setCapturing(true);
  }

  async function takeReceipt() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
    if (photo?.uri) setReceiptUri(photo.uri);
    setCapturing(false);
  }

  async function submit() {
    if (!employee || !typeId) return;
    const value = parseRupiah(amount);
    if (value <= 0) {
      setError("Masukkan jumlah rupiah yang valid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let receiptPath: string | undefined;
      if (receiptUri) {
        receiptPath = await uploadReceipt(employee.company_id, employee.id, receiptUri);
      }
      await submitClaim({
        companyId: employee.company_id,
        employeeId: employee.id,
        claimTypeId: typeId,
        amount: value,
        description: description.trim() || undefined,
        receiptPath,
      });
      setAmount("");
      setDescription("");
      setReceiptUri(null);
      await load(employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim klaim.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#1F6FEB" />
      </View>
    );
  }

  if (capturing) {
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.cameraBar}>
          <Text style={styles.cameraHint}>Foto struk/bukti pembayaran</Text>
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => setCapturing(false)}>
              <Text style={styles.btnGhostText}>Batal</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={takeReceipt}>
              <Text style={styles.btnPrimaryText}>Ambil foto</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.h1}>Klaim Reimbursement</Text>
      <Text style={styles.muted}>Ajukan penggantian biaya dengan bukti struk.</Text>

      <Text style={styles.label}>Jenis klaim</Text>
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

      <Text style={styles.label}>Jumlah (Rp)</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
        keyboardType="number-pad"
      />
      {parseRupiah(amount) > 0 && (
        <Text style={styles.muted}>{formatRupiah(parseRupiah(amount))}</Text>
      )}

      <Text style={styles.label}>Keterangan (opsional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Contoh: taksi ke kantor klien"
        multiline
      />

      <Pressable style={[styles.btn, styles.btnGhost, { marginTop: 14 }]} onPress={startCapture}>
        <Text style={styles.btnGhostText}>
          {receiptUri ? "Struk terlampir ✓ — ganti" : "Foto struk"}
        </Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.btn, styles.btnPrimary, (busy || !typeId) && styles.btnDisabled]}
        onPress={submit}
        disabled={busy || !typeId}
      >
        <Text style={styles.btnPrimaryText}>{busy ? "Mengirim…" : "Ajukan klaim"}</Text>
      </Pressable>

      <Text style={styles.section}>Riwayat</Text>
      {claims.length === 0 && <Text style={styles.muted}>Belum ada klaim.</Text>}
      {claims.map((c) => (
        <View key={c.id} style={styles.histRow}>
          <View style={styles.flex}>
            <Text style={styles.histType}>{c.claimTypeName}</Text>
            <Text style={styles.muted}>{formatRupiah(c.amount)}</Text>
            {c.decisionNote ? <Text style={styles.note}>Catatan: {c.decisionNote}</Text> : null}
          </View>
          <Text style={[styles.status, { color: STATUS_COLOR[c.status] }]}>
            {STATUS_LABEL[c.status]}
          </Text>
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
  section: { marginTop: 28, fontSize: 16, fontWeight: "700", color: "#0F172A" },
  label: { marginTop: 14, marginBottom: 6, color: "#334155", fontWeight: "600", fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: "#1F6FEB", borderColor: "#1F6FEB" },
  chipText: { color: "#334155" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
  },
  multiline: { height: 72, textAlignVertical: "top" },
  btn: { borderRadius: 8, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 18 },
  btnPrimary: { backgroundColor: "#1F6FEB" },
  btnPrimaryText: { color: "#fff", fontWeight: "600" },
  btnGhost: { borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff" },
  btnGhostText: { color: "#0F172A", fontWeight: "600" },
  btnDisabled: { backgroundColor: "#94A3B8" },
  row: { flexDirection: "row", gap: 12, marginTop: 12 },
  flex: { flex: 1 },
  error: { color: "#DC2626", marginTop: 12 },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  histType: { color: "#0F172A", fontWeight: "600" },
  note: { color: "#64748B", fontSize: 12, marginTop: 2 },
  status: { fontWeight: "700", fontSize: 13 },
  cameraWrap: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraBar: { padding: 20, backgroundColor: "#0F172A" },
  cameraHint: { color: "#fff", textAlign: "center", marginBottom: 12 },
});
