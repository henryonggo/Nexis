export type { Database, CompanyRole, PlanTier } from "./database";

/** Domain helper types used across web and mobile. */
export interface ActiveCompany {
  id: string;
  name: string;
  role: import("./database").CompanyRole;
  plan: import("./database").PlanTier;
}
