"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import {
  createGeofence,
  deleteGeofence,
  createShift,
  deleteShift,
  saveSchedule,
  seedHolidays,
  type ConfigState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const initial: ConfigState = {};

type Geofence = { id: string; name: string; latitude: number; longitude: number; radius_meters: number };
type Shift = { id: string; name: string; start_time: string; end_time: string; grace_period_minutes: number };
type Employee = { id: string; full_name: string };
type Holiday = { id: string; date: string; name: string; is_national: boolean };
/** employee_id → (day_of_week → shift_id) */
type ScheduleMap = Record<string, Record<number, string>>;

export function ConfigTabs({
  geofences,
  shifts,
  employees,
  schedules,
  holidays,
  year,
}: {
  geofences: Geofence[];
  shifts: Shift[];
  employees: Employee[];
  schedules: ScheduleMap;
  holidays: Holiday[];
  year: number;
}) {
  const t = useTranslations("attendance.config");

  return (
    <Tabs defaultValue="geofences">
      <TabsList>
        <TabsTrigger value="geofences">{t("tabs.geofences")}</TabsTrigger>
        <TabsTrigger value="shifts">{t("tabs.shifts")}</TabsTrigger>
        <TabsTrigger value="schedules">{t("tabs.schedules")}</TabsTrigger>
        <TabsTrigger value="holidays">{t("tabs.holidays")}</TabsTrigger>
      </TabsList>

      <TabsContent value="geofences">
        <GeofencesTab geofences={geofences} />
      </TabsContent>
      <TabsContent value="shifts">
        <ShiftsTab shifts={shifts} />
      </TabsContent>
      <TabsContent value="schedules">
        <SchedulesTab employees={employees} shifts={shifts} schedules={schedules} />
      </TabsContent>
      <TabsContent value="holidays">
        <HolidaysTab holidays={holidays} year={year} />
      </TabsContent>
    </Tabs>
  );
}

function FormAlert({ state }: { state: ConfigState }) {
  if (state.error) return <Alert variant="destructive" className="mb-4">{state.error}</Alert>;
  if (state.success) return <Alert variant="success" className="mb-4">{state.success}</Alert>;
  return null;
}

function SeedButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const tc = useTranslations("common");
  return (
    <Button type="submit" variant="outline" disabled={pending} aria-busy={pending}>
      {pending ? tc("processing") : label}
    </Button>
  );
}

function DeleteButton({
  action,
  id,
  label,
}: {
  action: (prev: ConfigState, fd: FormData) => Promise<ConfigState>;
  id: string;
  label: string;
}) {
  const [, formAction] = useFormState(action, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="icon" aria-label={label} title={label}>
        <Trash2 className="h-4 w-4 text-danger" />
      </Button>
    </form>
  );
}

// ── Geofences ────────────────────────────────────────────────────────────────

function GeofencesTab({ geofences }: { geofences: Geofence[] }) {
  const t = useTranslations("attendance.config");
  const [state, action] = useFormState(createGeofence, initial);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="p-6">
        <h3 className="mb-1 font-semibold text-ink">{t("geofences.addTitle")}</h3>
        <p className="mb-4 text-sm text-muted">{t("geofences.hint")}</p>
        <FormAlert state={state} />
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gf-name">{t("geofences.name")} *</Label>
            <Input id="gf-name" name="name" required placeholder={t("geofences.namePlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="gf-lat">{t("geofences.latitude")} *</Label>
              <Input id="gf-lat" name="latitude" type="number" step="any" required placeholder="-6.2088" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gf-lng">{t("geofences.longitude")} *</Label>
              <Input id="gf-lng" name="longitude" type="number" step="any" required placeholder="106.8456" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gf-radius">{t("geofences.radius")} *</Label>
            <Input id="gf-radius" name="radiusMeters" type="number" min={10} max={10000} step={10} defaultValue={100} required />
          </div>
          <SubmitButton>{t("geofences.add")}</SubmitButton>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 font-semibold text-ink">{t("geofences.listTitle")}</h3>
        {geofences.length === 0 ? (
          <p className="text-sm text-muted">{t("geofences.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("geofences.name")}</TableHead>
                <TableHead>{t("geofences.coords")}</TableHead>
                <TableHead>{t("geofences.radius")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {geofences.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium text-ink">{g.name}</TableCell>
                  <TableCell className="text-muted">{g.latitude}, {g.longitude}</TableCell>
                  <TableCell className="text-muted">{g.radius_meters} m</TableCell>
                  <TableCell>
                    <DeleteButton action={deleteGeofence} id={g.id} label={t("delete")} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Shifts ───────────────────────────────────────────────────────────────────

function ShiftsTab({ shifts }: { shifts: Shift[] }) {
  const t = useTranslations("attendance.config");
  const [state, action] = useFormState(createShift, initial);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="p-6">
        <h3 className="mb-1 font-semibold text-ink">{t("shifts.addTitle")}</h3>
        <p className="mb-4 text-sm text-muted">{t("shifts.hint")}</p>
        <FormAlert state={state} />
        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sh-name">{t("shifts.name")} *</Label>
            <Input id="sh-name" name="name" required placeholder={t("shifts.namePlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sh-start">{t("shifts.start")} *</Label>
              <Input id="sh-start" name="startTime" type="time" required defaultValue="09:00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-end">{t("shifts.end")} *</Label>
              <Input id="sh-end" name="endTime" type="time" required defaultValue="17:00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-grace">{t("shifts.grace")}</Label>
            <Input id="sh-grace" name="gracePeriodMinutes" type="number" min={0} max={240} step={5} defaultValue={0} />
            <p className="text-xs text-muted">{t("shifts.graceHint")}</p>
          </div>
          <SubmitButton>{t("shifts.add")}</SubmitButton>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 font-semibold text-ink">{t("shifts.listTitle")}</h3>
        {shifts.length === 0 ? (
          <p className="text-sm text-muted">{t("shifts.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("shifts.name")}</TableHead>
                <TableHead>{t("shifts.hours")}</TableHead>
                <TableHead>{t("shifts.grace")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-ink">{s.name}</TableCell>
                  <TableCell className="text-muted">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</TableCell>
                  <TableCell className="text-muted">{s.grace_period_minutes} {t("shifts.minutes")}</TableCell>
                  <TableCell>
                    <DeleteButton action={deleteShift} id={s.id} label={t("delete")} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Schedules (per-employee weekly grid) ─────────────────────────────────────

// Display Monday-first; value stays the Postgres dow (0=Sunday … 6=Saturday).
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

function SchedulesTab({
  employees,
  shifts,
  schedules,
}: {
  employees: Employee[];
  shifts: Shift[];
  schedules: ScheduleMap;
}) {
  const t = useTranslations("attendance.config");

  if (shifts.length === 0) {
    return <Card className="p-6"><p className="text-sm text-muted">{t("schedules.needShifts")}</p></Card>;
  }
  if (employees.length === 0) {
    return <Card className="p-6"><p className="text-sm text-muted">{t("schedules.needEmployees")}</p></Card>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("schedules.hint")}</p>
      {employees.map((e) => (
        <EmployeeScheduleRow
          key={e.id}
          employee={e}
          shifts={shifts}
          assigned={schedules[e.id] ?? {}}
        />
      ))}
    </div>
  );
}

function EmployeeScheduleRow({
  employee,
  shifts,
  assigned,
}: {
  employee: Employee;
  shifts: Shift[];
  assigned: Record<number, string>;
}) {
  const t = useTranslations("attendance.config");
  const [state, action] = useFormState(saveSchedule, initial);

  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-ink">{employee.full_name}</h3>
        {state.success && <span className="text-xs text-success">{state.success}</span>}
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="employeeId" value={employee.id} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {DOW_ORDER.map((dow) => (
            <div key={dow} className="space-y-1.5">
              <Label htmlFor={`emp-${employee.id}-day-${dow}`} className="text-xs">
                {t(`days.${dow}`)}
              </Label>
              <select
                id={`emp-${employee.id}-day-${dow}`}
                name={`day_${dow}`}
                defaultValue={assigned[dow] ?? ""}
                className={fieldClasses}
              >
                <option value="">{t("schedules.off")}</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <SubmitButton>{t("schedules.save")}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

// ── Holidays (read-only; seed RPC pending — TODO(db)) ────────────────────────

function HolidaysTab({ holidays, year }: { holidays: Holiday[]; year: number }) {
  const t = useTranslations("attendance.config");
  const [state, action] = useFormState(seedHolidays, initial);

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-ink">{t("holidays.title", { year })}</h3>
          <p className="text-sm text-muted">{t("holidays.hint")}</p>
          {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
          {state.success && <p className="mt-1 text-xs text-success">{state.success}</p>}
        </div>
        <form action={action}>
          <input type="hidden" name="year" value={year} />
          <SeedButton label={t("holidays.seed", { year })} />
        </form>
      </div>
      {holidays.length === 0 ? (
        <p className="text-sm text-muted">{t("holidays.empty", { year })}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("holidays.date")}</TableHead>
              <TableHead>{t("holidays.name")}</TableHead>
              <TableHead>{t("holidays.type")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="text-muted">{h.date}</TableCell>
                <TableCell className="font-medium text-ink">{h.name}</TableCell>
                <TableCell className="text-muted">
                  {h.is_national ? t("holidays.national") : t("holidays.company")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
