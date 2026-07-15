/**
 * Canonical role checks (CODE-REVIEW-2026-07 §Simplify). The same
 * owner/admin comparison is hand-rolled at ~50 call sites; new code uses
 * these, and frozen pages adopt them opportunistically during bugfixes.
 */

export function isAdminRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function isManagerRole(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}
