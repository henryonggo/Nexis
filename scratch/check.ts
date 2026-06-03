import { Database } from "@nexis/types";
type Tables = Database['public']['Tables'];
type Employees = Tables['employees'];
type CreateCompanyArgs = Database['public']['Functions']['create_company_with_owner']['Args'];

const testArgs: CreateCompanyArgs = {
  p_name: "Test Company",
  p_industry: "Software"
};

const testEmployee: Employees['Row'] = {
  id: "test",
  company_id: "test",
  user_id: "test",
  employee_no: "test",
  full_name: "test",
  email: "test",
  phone: "test",
  status: "active",
  employment_type: "permanent",
  join_date: "test",
  end_date: "test",
  department: "test",
  position: "test",
  manager_id: "test",
  created_at: "test",
  updated_at: "test"
};
