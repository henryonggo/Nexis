import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import {
  getMyEmployee,
  getTodayEvents,
  recordAttendance,
  uploadSelfie,
  nearestGeofence,
  type AttendanceKind,
  type Geofence,
} from "../../lib/attendance";
import { supabase } from "../../lib/supabase";

type Employee = { id: string; company_id: string; full_name: string };
type Event = { id: string; kind: AttendanceKind; event_at: string; is_valid: boolean };

const KIND_LABEL: Record<AttendanceKind, string> = {
  clock_in: "Masuk",
  clock_out: "Keluar",
  break_start: "Mulai istirahat",
  break_end: "Selesai istirahat",
};

function isPresent(kind: AttendanceKind) {
  return kind === "clock_in" || kind === "break_end";
}

export default function Attendance() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [fences, setFences] = useState<Geofence[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<AttendanceKind | null>(null);

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  async function refresh(emp: Employee) {
    setEvents((await getTodayEvents(emp.id)) as Event[]);
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
        const { data: fenceData } = await supabase
          .from("geofences")
          .select("id, name, latitude, longitude, radius_meters")
          .eq("company_id", emp.company_id);
        setFences((fenceData as Geofence[] | null) ?? []);
        await refresh(emp);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const last = events[0];
  const present = last ? isPresent(last.kind) : false;
  const nextKind: AttendanceKind = present ? "clock_out" : "clock_in";

  async function startCapture(kind: AttendanceKind) {
    setError(null);
    if (!camPerm?.granted) {
      const res = await requestCamPerm();
      if (!res.granted) {
        setError("Izin kamera diperlukan untuk selfie.");
        return;
      }
    }
    setPendingKind(kind);
  }

  async function captureAndRecord() {
    if (!employee || !pendingKind) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Selfie
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
      if (!photo?.uri) throw new Error("Gagal mengambil foto.");

      // 2. Location
      const loc = await Location.requestForegroundPermissionsAsync();
      if (!loc.granted) throw new Error("Izin lokasi diperlukan.");
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = pos.coords;

      // 3. Geofence pre-check (informational; server sets is_valid)
      const near = nearestGeofence(latitude, longitude, fences);
      const note = near && !near.inside
        ? `Di luar area ${near.fence.name} (~${Math.round(near.distance)} m)`
        : undefined;

      // 4. Upload selfie + record
      const selfieUrl = await uploadSelfie(employee.company_id, employee.id, photo.uri);
      await recordAttendance({
        companyId: employee.company_id,
        kind: pendingKind,
        latitude,
        longitude,
        selfieUrl,
        note,
      });

      setPendingKind(null);
      await refresh(employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal merekam kehadiran.");
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

  // Camera capture view
  if (pendingKind) {
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        <View style={styles.cameraBar}>
          <Text style={styles.cameraHint}>
            {KIND_LABEL[pendingKind]} — ambil selfie untuk konfirmasi
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setPendingKind(null)}
              disabled={busy}
            >
              <Text style={styles.btnGhostText}>Batal</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={captureAndRecord} disabled={busy}>
              <Text style={styles.btnPrimaryText}>{busy ? "Mengirim…" : "Ambil & rekam"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.h1}>Absensi</Text>
      <Text style={styles.muted}>{employee?.full_name}</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Status saat ini</Text>
        <Text style={[styles.statusValue, { color: present ? "#16A34A" : "#64748B" }]}>
          {last ? KIND_LABEL[last.kind] : "Belum absen hari ini"}
        </Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.btn, styles.btnPrimary, styles.fullBtn]}
        onPress={() => startCapture(nextKind)}
        disabled={!employee}
      >
        <Text style={styles.btnPrimaryText}>{KIND_LABEL[nextKind]}</Text>
      </Pressable>

      <View style={styles.row}>
        <Pressable
          style={[styles.btn, styles.btnGhost, styles.flex]}
          onPress={() => startCapture("break_start")}
        >
          <Text style={styles.btnGhostText}>Mulai istirahat</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnGhost, styles.flex]}
          onPress={() => startCapture("break_end")}
        >
          <Text style={styles.btnGhostText}>Selesai istirahat</Text>
        </Pressable>
      </View>

      <Text style={styles.logTitle}>Riwayat hari ini</Text>
      {events.length === 0 && <Text style={styles.muted}>Belum ada kejadian.</Text>}
      {events.map((ev) => (
        <View key={ev.id} style={styles.logRow}>
          <Text style={styles.logKind}>{KIND_LABEL[ev.kind]}</Text>
          <Text style={styles.muted}>
            {new Date(ev.event_at).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Jakarta",
            })}
          </Text>
          {!ev.is_valid && <Text style={styles.flag}>di luar area</Text>}
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
  statusCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statusLabel: { color: "#64748B", fontSize: 13 },
  statusValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  btn: { borderRadius: 8, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  fullBtn: { marginTop: 20 },
  btnPrimary: { backgroundColor: "#1F6FEB" },
  btnPrimaryText: { color: "#fff", fontWeight: "600" },
  btnGhost: { borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff" },
  btnGhostText: { color: "#0F172A", fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, marginTop: 12 },
  flex: { flex: 1 },
  logTitle: { marginTop: 28, fontWeight: "600", color: "#0F172A" },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  logKind: { color: "#0F172A", flex: 1 },
  flag: { color: "#DC2626", fontSize: 12 },
  error: { color: "#DC2626", marginTop: 12 },
  cameraWrap: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraBar: { padding: 20, backgroundColor: "#0F172A" },
  cameraHint: { color: "#fff", textAlign: "center", marginBottom: 12 },
});
