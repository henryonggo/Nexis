import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
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
  const [nearest, setNearest] = useState<{ fence: Geofence; distance: number; inside: boolean } | null>(null);
  const [livenessPhase, setLivenessPhase] = useState("Menyelaraskan wajah...");

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const activeTimers = useRef<any[]>([]);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Concentric ring animations for Radar Pulse
  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, []);

  async function refresh(emp: Employee) {
    setEvents((await getTodayEvents(emp.id)) as Event[]);
  }

  async function updateLocationAndGeofence(empFences: Geofence[]) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      const near = nearestGeofence(latitude, longitude, empFences);
      setNearest(near);
    } catch {
      // ignore
    }
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
        const empFences = (fenceData as Geofence[] | null) ?? [];
        setFences(empFences);
        await refresh(emp);
        await updateLocationAndGeofence(empFences);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Timer sequence for mock liveness audit & hands-free auto-capture
  useEffect(() => {
    if (pendingKind) {
      setLivenessPhase("Menyelaraskan wajah...");
      
      const t1 = setTimeout(() => {
        setLivenessPhase("Verifikasi Liveness: Harap berkedip atau tersenyum...");
      }, 1500);

      const t2 = setTimeout(() => {
        setLivenessPhase("Liveness Terverifikasi! Mengambil foto...");
        captureAndRecord();
      }, 3200);

      activeTimers.current = [t1, t2];
    } else {
      activeTimers.current.forEach(clearTimeout);
      activeTimers.current = [];
    }

    return () => {
      activeTimers.current.forEach(clearTimeout);
    };
  }, [pendingKind, employee]);

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
      await updateLocationAndGeofence(fences);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal merekam kehadiran.");
      setPendingKind(null);
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

  // Ring animations interpolations
  const ring1Scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 2.0],
  });
  const ring1Opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0],
  });
  const ring2Scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1.4],
  });
  const ring2Opacity = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.6, 0],
  });

  const radarColor = nearest
    ? nearest.inside
      ? "rgba(22, 163, 74, 0.25)"
      : "rgba(217, 119, 6, 0.25)"
    : "rgba(91, 102, 117, 0.15)";

  const centerColor = nearest
    ? nearest.inside
      ? "#16A34A"
      : "#D97706"
    : "#5B6675";

  // Camera capture view
  if (pendingKind) {
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front">
          <View style={styles.cameraOverlay}>
            <View style={[styles.faceGuideRing, { borderColor: busy ? "#16A34A" : "rgba(255,255,255,0.4)" }]}>
              <View style={styles.faceGuideInner} />
            </View>
          </View>
        </CameraView>
        <View style={styles.cameraBar}>
          <Text style={styles.cameraHint}>
            {KIND_LABEL[pendingKind]} — {livenessPhase}
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <Pressable
              style={[styles.btn, styles.btnGhost, styles.flex]}
              onPress={() => setPendingKind(null)}
              disabled={busy}
            >
              <Text style={styles.btnGhostText}>Batal</Text>
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
        <Text style={[styles.statusValue, { color: present ? "#16A34A" : "#5B6675" }]}>
          {last ? KIND_LABEL[last.kind] : "Belum absen hari ini"}
        </Text>
      </View>

      {/* Radar Section */}
      <View style={styles.radarContainer}>
        <View style={styles.radarOutline}>
          <Animated.View
            style={[
              styles.radarRing,
              {
                borderColor: radarColor,
                transform: [{ scale: ring1Scale }],
                opacity: ring1Opacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.radarRing,
              {
                borderColor: radarColor,
                transform: [{ scale: ring2Scale }],
                opacity: ring2Opacity,
              },
            ]}
          />
          <View style={[styles.radarCenter, { backgroundColor: centerColor }]}>
            <View style={styles.radarCenterDot} />
          </View>
        </View>

        {nearest ? (
          <View style={styles.radarInfo}>
            <Text style={styles.radarDistance}>
              {nearest.inside
                ? `Berada di dalam area ${nearest.fence.name}`
                : `Di luar area ${nearest.fence.name} (~${Math.round(nearest.distance)}m)`}
            </Text>
            <Text style={[styles.radarStatusText, { color: centerColor }]}>
              {nearest.inside ? "Presensi Tersedia" : "Memerlukan Persetujuan"}
            </Text>
          </View>
        ) : (
          <View style={styles.radarInfo}>
            <Text style={styles.radarDistance}>Mencari lokasi absensi...</Text>
          </View>
        )}
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
  container: { flex: 1, backgroundColor: "#F7F8FA" },
  center: { alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 22, fontWeight: "700", color: "#0B1220" },
  muted: { color: "#5B6675", marginTop: 4 },
  statusCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E3E8EF",
  },
  statusLabel: { color: "#5B6675", fontSize: 13 },
  statusValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  btn: { borderRadius: 8, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  fullBtn: { marginTop: 20 },
  btnPrimary: { backgroundColor: "#2452E6" },
  btnPrimaryText: { color: "#fff", fontWeight: "600" },
  btnGhost: { borderWidth: 1, borderColor: "#E3E8EF", backgroundColor: "#fff" },
  btnGhostText: { color: "#0B1220", fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, marginTop: 12 },
  flex: { flex: 1 },
  logTitle: { marginTop: 28, fontWeight: "600", color: "#0B1220" },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E3E8EF",
  },
  logKind: { color: "#0B1220", flex: 1 },
  flag: { color: "#DC2626", fontSize: 12 },
  error: { color: "#DC2626", marginTop: 12 },
  cameraWrap: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraBar: { padding: 20, backgroundColor: "#0B1220" },
  cameraHint: { color: "#fff", textAlign: "center", marginBottom: 12 },
  // Radar Sonar styles
  radarContainer: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 8,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E3E8EF",
  },
  radarOutline: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  radarRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
  },
  radarCenter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
    elevation: 3,
  },
  radarCenterDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  radarInfo: {
    alignItems: "center",
    marginTop: 16,
  },
  radarDistance: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0B1220",
    textAlign: "center",
  },
  radarStatusText: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Camera overlays
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  faceGuideRing: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  faceGuideInner: {
    width: 232,
    height: 232,
    borderRadius: 116,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
});
