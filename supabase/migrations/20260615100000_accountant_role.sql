-- ============================================================================
-- Nexis — Accountant Role Enum Addition
-- ============================================================================

-- 1. Add 'accountant' to company_role enum
alter type public.company_role add value if not exists 'accountant';
