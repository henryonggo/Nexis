/**
 * Shared test fixtures. Reference rows mirror supabase/seed.sql (same values
 * as packages/payroll/src/config.test.ts) so these tests double as a contract
 * check against the seeded rates.
 */

export const COMPANY_ID = "10000000-0000-0000-0000-000000000001";
export const EMP_BUDI = "20000000-0000-0000-0000-000000000001";
export const EMP_SITI = "20000000-0000-0000-0000-000000000002";
export const EMP_AGUS = "20000000-0000-0000-0000-000000000003";

export const EMPLOYEES = [
  {
    id: EMP_BUDI,
    company_id: COMPANY_ID,
    employee_no: "BW-001",
    full_name: "Budi Santoso",
    status: "active",
    join_date: "2024-03-01",
  },
  {
    id: EMP_SITI,
    company_id: COMPANY_ID,
    employee_no: "BW-002",
    full_name: "Siti Rahayu",
    status: "active",
    join_date: "2025-01-15",
  },
  {
    id: EMP_AGUS,
    company_id: COMPANY_ID,
    employee_no: "BW-003",
    full_name: "Agus Wijaya",
    status: "inactive",
    join_date: "2023-06-01",
  },
];

export const COMPENSATION = [
  {
    company_id: COMPANY_ID,
    employee_id: EMP_BUDI,
    base_salary: 10_000_000,
    pay_frequency: "monthly",
    fixed_allowances: 0,
    bpjs_kes_enrolled: true,
    jht_enrolled: true,
    jp_enrolled: true,
    effective_from: "2025-01-01",
  },
];

export const TAX_PROFILES = [
  {
    company_id: COMPANY_ID,
    employee_id: EMP_BUDI,
    ptkp_status: "TK/0",
    has_npwp: true,
  },
];

export const COMPANY_SETTINGS = [
  { company_id: COMPANY_ID, jkk_risk_class: "low" },
];

const REF = { effective_from: "2024-01-01", effective_to: null };

export const BPJS_CONFIG = [
  { key: "kes_employee", rate_bps: 100, amount: null, ...REF },
  { key: "kes_employer", rate_bps: 400, amount: null, ...REF },
  { key: "jht_employee", rate_bps: 200, amount: null, ...REF },
  { key: "jht_employer", rate_bps: 370, amount: null, ...REF },
  { key: "jp_employee", rate_bps: 100, amount: null, ...REF },
  { key: "jp_employer", rate_bps: 200, amount: null, ...REF },
  { key: "jkm_employer", rate_bps: 30, amount: null, ...REF },
  { key: "kes_cap", rate_bps: null, amount: 12_000_000, ...REF },
  { key: "jp_cap", rate_bps: null, amount: 10_547_400, ...REF },
  { key: "jkk_very_low", rate_bps: 24, amount: null, ...REF },
  { key: "jkk_low", rate_bps: 54, amount: null, ...REF },
  { key: "jkk_medium", rate_bps: 89, amount: null, ...REF },
  { key: "jkk_high", rate_bps: 127, amount: null, ...REF },
  { key: "jkk_very_high", rate_bps: 174, amount: null, ...REF },
];

export const TER_RATES = [
  { category: "A", income_lower: 0, rate_bps: 0, ...REF },
  { category: "A", income_lower: 5_400_001, rate_bps: 25, ...REF },
  { category: "A", income_lower: 5_650_001, rate_bps: 50, ...REF },
  { category: "A", income_lower: 5_950_001, rate_bps: 75, ...REF },
  { category: "B", income_lower: 0, rate_bps: 0, ...REF },
  { category: "C", income_lower: 0, rate_bps: 0, ...REF },
];

/**
 * Every table the two read-only tools touch, in a consistent happy state.
 * Deep-cloned so a test mutating a row can't leak into the next test.
 */
export function baseTables() {
  return structuredClone({
    employees: EMPLOYEES,
    compensation: COMPENSATION,
    tax_profile: TAX_PROFILES,
    company_settings: COMPANY_SETTINGS,
    bpjs_config: BPJS_CONFIG,
    ter_rates: TER_RATES,
    overtime_entries: [] as Record<string, unknown>[],
    employee_earning: [] as Record<string, unknown>[],
    employee_earning_group: [] as Record<string, unknown>[],
  });
}
