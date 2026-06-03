import type { Database } from "./database";

export type { Database };

// Extract Row types
export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type CompanyMemberRow = Database["public"]["Tables"]["company_members"]["Row"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type CompanyBillingRow = Database["public"]["Tables"]["company_billing"]["Row"];
export type InvitationRow = Database["public"]["Tables"]["invitations"]["Row"];

// Extract Enum types
export type CompanyRole = Database["public"]["Enums"]["company_role"];
export type PlanTier = Database["public"]["Enums"]["plan_tier"];
export type EmployeeStatus = Database["public"]["Enums"]["employee_status"];
export type EmploymentType = Database["public"]["Enums"]["employment_type"];
export type InviteStatus = Database["public"]["Enums"]["invite_status"];

/** Domain helper types used across web and mobile. */
export interface ActiveCompany {
  id: string;
  name: string;
  role: CompanyRole;
  plan: PlanTier;
}
