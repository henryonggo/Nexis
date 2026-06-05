import { supabase } from "./supabase";
import type { Database } from "@nexis/types";

export type AttendanceKind = Database["public"]["Enums"]["attendance_kind"];

export type Geofence = Pick<
  Database["public"]["Tables"]["geofences"]["Row"],
  "id" | "name" | "latitude" | "longitude" | "radius_meters"
>;

/** Great-circle distance in meters between two lat/long points (Haversine). */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius, meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Nearest geofence to a point and whether the point is inside its radius. */
export function nearestGeofence(
  lat: number,
  lon: number,
  fences: Geofence[],
): { fence: Geofence; distance: number; inside: boolean } | null {
  let best: { fence: Geofence; distance: number; inside: boolean } | null = null;
  for (const f of fences) {
    const d = distanceMeters(lat, lon, f.latitude, f.longitude);
    if (!best || d < best.distance) {
      best = { fence: f, distance: d, inside: d <= f.radius_meters };
    }
  }
  return best;
}

/**
 * Upload a captured selfie to the private `attendance-selfies` bucket and return
 * its path. The bucket + RLS policies (employee uploads own under
 * {company_id}/{employee_id}/...) are owned by Antigravity (Storage) and live.
 */
const SELFIE_BUCKET = "attendance-selfies";

export async function uploadSelfie(
  companyId: string,
  employeeId: string,
  uri: string,
): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.arrayBuffer();
  const path = `${companyId}/${employeeId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

/** The employee record bound to the signed-in user (Stage 2: one per user). */
export async function getMyEmployee(): Promise<
  Pick<Database["public"]["Tables"]["employees"]["Row"], "id" | "company_id" | "full_name"> | null
> {
  const { data } = await supabase
    .from("employees")
    .select("id, company_id, full_name")
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Today's attendance events for an employee, newest first (WIB day). */
export async function getTodayEvents(employeeId: string) {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const startWibUtcMs = Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate());
  const since = new Date(startWibUtcMs - WIB_OFFSET_MS).toISOString();

  const { data } = await supabase
    .from("attendance_records")
    .select("id, kind, event_at, is_valid")
    .eq("employee_id", employeeId)
    .gte("event_at", since)
    .order("event_at", { ascending: false });
  return data ?? [];
}

/** Record an attendance event via the RPC (server validates geofence → is_valid). */
export async function recordAttendance(args: {
  companyId: string;
  kind: AttendanceKind;
  latitude: number;
  longitude: number;
  selfieUrl?: string;
  note?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("record_attendance", {
    p_company_id: args.companyId,
    p_kind: args.kind,
    p_latitude: args.latitude,
    p_longitude: args.longitude,
    p_selfie_url: args.selfieUrl,
    p_note: args.note,
  });
  if (error) throw error;
  return data as string;
}
