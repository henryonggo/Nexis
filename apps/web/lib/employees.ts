import { createClient } from "@/lib/supabase/server";

/**
 * Compute the next employee number for a company.
 * Queries existing employee_no values (as text), parses them as integers,
 * and returns max + 1. Defaults to 1 if no employees exist.
 */
export async function getNextEmployeeNumber(companyId: string): Promise<number> {
  const supabase = createClient();

  const { data } = await supabase
    .from("employees")
    .select("employee_no")
    .eq("company_id", companyId);

  if (!data || data.length === 0) {
    return 1;
  }

  const numbers = data
    .map((row) => {
      const num = parseInt(row.employee_no || "", 10);
      return isNaN(num) ? null : num;
    })
    .filter((num): num is number => num !== null);

  if (numbers.length === 0) {
    return 1;
  }

  return Math.max(...numbers) + 1;
}
