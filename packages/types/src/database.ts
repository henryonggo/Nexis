/**
 * GENERATED FILE — placeholder.
 *
 * Replace this by running, after applying migrations:
 *   pnpm db:types        (local)   or   supabase gen types typescript --linked
 *
 * Until generation is wired up we expose a hand-written shape covering the
 * Stage 1–2 tables so the apps can compile. Do NOT hand-edit after generation.
 */

export type CompanyRole = "owner" | "admin" | "manager" | "employee";
export type PlanTier = "free" | "starter" | "growth" | "enterprise";
export type EmployeeStatus = "active" | "probation" | "inactive" | "terminated";
export type EmploymentType = "permanent" | "contract" | "intern" | "daily";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

type Row<T> = T;
type WithDefaults<T, Required extends keyof T> = Partial<T> & Pick<T, Required>;

export interface CompanyRow {
  id: string;
  name: string;
  slug: string | null;
  legal_name: string | null;
  industry: string | null;
  logo_url: string | null;
  timezone: string;
  locale: string;
  plan: PlanTier;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyMemberRow {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  employee_id: string | null;
  created_at: string;
}

export interface EmployeeRow {
  id: string;
  company_id: string;
  user_id: string | null;
  employee_no: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: EmployeeStatus;
  employment_type: EmploymentType;
  join_date: string | null;
  end_date: string | null;
  department: string | null;
  position: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyBillingRow {
  company_id: string;
  plan: PlanTier;
  npwp: string | null;
  bpjs_kes_no: string | null;
  bpjs_tk_no: string | null;
  billing_email: string | null;
  free_seat_limit: number;
  active_seats: number;
  trial_ends_at: string | null;
  updated_at: string;
}

export interface InvitationRow {
  id: string;
  company_id: string;
  email: string;
  role: CompanyRole;
  token: string;
  status: InviteStatus;
  invited_by: string;
  expires_at: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: WithDefaults<Database["public"]["Tables"]["profiles"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      companies: {
        Row: Row<CompanyRow>;
        Insert: WithDefaults<CompanyRow, "name">;
        Update: Partial<CompanyRow>;
      };
      company_members: {
        Row: Row<CompanyMemberRow>;
        Insert: WithDefaults<CompanyMemberRow, "company_id" | "user_id">;
        Update: Partial<CompanyMemberRow>;
      };
      company_billing: {
        Row: Row<CompanyBillingRow>;
        Insert: WithDefaults<CompanyBillingRow, "company_id">;
        Update: Partial<CompanyBillingRow>;
      };
      employees: {
        Row: Row<EmployeeRow>;
        Insert: WithDefaults<EmployeeRow, "company_id" | "full_name">;
        Update: Partial<EmployeeRow>;
      };
      invitations: {
        Row: Row<InvitationRow>;
        Insert: WithDefaults<InvitationRow, "company_id" | "email" | "invited_by">;
        Update: Partial<InvitationRow>;
      };
      company_settings: {
        Row: {
          company_id: string;
          payroll_cutoff_day: number;
          pay_date_day: number;
          workweek_days: number;
          jkk_risk_class: string | null;
          default_currency: string;
          updated_at: string;
        };
        Insert: { company_id: string } & Partial<Database["public"]["Tables"]["company_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["company_settings"]["Row"]>;
      };
      compensation: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string;
          base_salary: number;
          fixed_allowances: unknown;
          pay_frequency: string;
          bpjs_kes_enrolled: boolean;
          bpjs_tk_enrolled: boolean;
          jht_enrolled: boolean;
          jp_enrolled: boolean;
          effective_from: string;
          created_at: string;
        };
        Insert: { company_id: string; employee_id: string } & Partial<
          Database["public"]["Tables"]["compensation"]["Row"]
        >;
        Update: Partial<Database["public"]["Tables"]["compensation"]["Row"]>;
      };
      tax_profile: {
        Row: {
          employee_id: string;
          company_id: string;
          ptkp_status: string;
          npwp: string | null;
          has_npwp: boolean;
        };
        Insert: { employee_id: string; company_id: string } & Partial<
          Database["public"]["Tables"]["tax_profile"]["Row"]
        >;
        Update: Partial<Database["public"]["Tables"]["tax_profile"]["Row"]>;
      };
      bank_accounts: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string;
          bank_name: string | null;
          account_no: string | null;
          account_name: string | null;
          is_primary: boolean;
        };
        Insert: { company_id: string; employee_id: string } & Partial<
          Database["public"]["Tables"]["bank_accounts"]["Row"]
        >;
        Update: Partial<Database["public"]["Tables"]["bank_accounts"]["Row"]>;
      };
    };
    Functions: {
      create_company_with_owner: {
        Args: { p_name: string; p_industry?: string | null };
        Returns: string;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
    };
  };
}
