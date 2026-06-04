export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attendance_records: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          event_at: string
          id: string
          is_valid: boolean
          kind: Database["public"]["Enums"]["attendance_kind"]
          latitude: number | null
          longitude: number | null
          note: string | null
          selfie_url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          event_at?: string
          id?: string
          is_valid?: boolean
          kind: Database["public"]["Enums"]["attendance_kind"]
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          selfie_url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          event_at?: string
          id?: string
          is_valid?: boolean
          kind?: Database["public"]["Enums"]["attendance_kind"]
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          selfie_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string | null
          account_no: string | null
          bank_name: string | null
          company_id: string
          employee_id: string
          id: string
          is_primary: boolean
        }
        Insert: {
          account_name?: string | null
          account_no?: string | null
          bank_name?: string | null
          company_id: string
          employee_id: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          account_name?: string | null
          account_no?: string | null
          bank_name?: string | null
          company_id?: string
          employee_id?: string
          id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      bpjs_config: {
        Row: {
          amount: number | null
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          key: string
          rate_bps: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          key: string
          rate_bps?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          key?: string
          rate_bps?: number | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          created_by: string
          id: string
          industry: string | null
          legal_name: string | null
          locale: string
          logo_url: string | null
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          slug: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          industry?: string | null
          legal_name?: string | null
          locale?: string
          logo_url?: string | null
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          industry?: string | null
          legal_name?: string | null
          locale?: string
          logo_url?: string | null
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_billing: {
        Row: {
          active_seats: number
          billing_email: string | null
          bpjs_kes_no: string | null
          bpjs_tk_no: string | null
          company_id: string
          free_seat_limit: number
          npwp: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          active_seats?: number
          billing_email?: string | null
          bpjs_kes_no?: string | null
          bpjs_tk_no?: string | null
          company_id: string
          free_seat_limit?: number
          npwp?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          active_seats?: number
          billing_email?: string | null
          bpjs_kes_no?: string | null
          bpjs_tk_no?: string | null
          company_id?: string
          free_seat_limit?: number
          npwp?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_billing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string | null
          id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_employee_fk"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_id: string
          default_currency: string
          jkk_risk_class: string | null
          pay_date_day: number
          payroll_cutoff_day: number
          region: string
          updated_at: string
          workweek_days: number
        }
        Insert: {
          company_id: string
          default_currency?: string
          jkk_risk_class?: string | null
          pay_date_day?: number
          payroll_cutoff_day?: number
          region?: string
          updated_at?: string
          workweek_days?: number
        }
        Update: {
          company_id?: string
          default_currency?: string
          jkk_risk_class?: string | null
          pay_date_day?: number
          payroll_cutoff_day?: number
          region?: string
          updated_at?: string
          workweek_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation: {
        Row: {
          base_salary: number
          bpjs_kes_enrolled: boolean
          bpjs_tk_enrolled: boolean
          company_id: string
          created_at: string
          effective_from: string
          employee_id: string
          fixed_allowances: Json
          id: string
          jht_enrolled: boolean
          jp_enrolled: boolean
          pay_frequency: string
        }
        Insert: {
          base_salary?: number
          bpjs_kes_enrolled?: boolean
          bpjs_tk_enrolled?: boolean
          company_id: string
          created_at?: string
          effective_from?: string
          employee_id: string
          fixed_allowances?: Json
          id?: string
          jht_enrolled?: boolean
          jp_enrolled?: boolean
          pay_frequency?: string
        }
        Update: {
          base_salary?: number
          bpjs_kes_enrolled?: boolean
          bpjs_tk_enrolled?: boolean
          company_id?: string
          created_at?: string
          effective_from?: string
          employee_id?: string
          fixed_allowances?: Json
          id?: string
          jht_enrolled?: boolean
          jp_enrolled?: boolean
          pay_frequency?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          company_id: string
          created_at: string
          department: string | null
          email: string | null
          employee_no: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          end_date: string | null
          full_name: string
          id: string
          join_date: string | null
          manager_id: string | null
          phone: string | null
          position: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          department?: string | null
          email?: string | null
          employee_no?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          end_date?: string | null
          full_name: string
          id?: string
          join_date?: string | null
          manager_id?: string | null
          phone?: string | null
          position?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          department?: string | null
          email?: string | null
          employee_no?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          end_date?: string | null
          full_name?: string
          id?: string
          join_date?: string | null
          manager_id?: string | null
          phone?: string | null
          position?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          company_id: string
          created_at: string
          id: string
          latitude: number
          longitude: number
          name: string
          radius_meters: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          name: string
          radius_meters?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          radius_meters?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          is_national: boolean
          name: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_national?: boolean
          name: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_national?: boolean
          name?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["company_role"]
          status: Database["public"]["Enums"]["invite_status"]
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["company_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["company_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      minimum_wages: {
        Row: {
          amount: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          region: string
        }
        Insert: {
          amount: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          region: string
        }
        Update: {
          amount?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          region?: string
        }
        Relationships: []
      }
      overtime_entries: {
        Row: {
          approved_by: string | null
          company_id: string
          created_at: string
          date: string
          duration_minutes: number
          employee_id: string
          id: string
          is_approved: boolean
          multiplier: number
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          company_id: string
          created_at?: string
          date: string
          duration_minutes: number
          employee_id: string
          id?: string
          is_approved?: boolean
          multiplier: number
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          company_id?: string
          created_at?: string
          date?: string
          duration_minutes?: number
          employee_id?: string
          id?: string
          is_approved?: boolean
          multiplier?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_entries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          allowances: number
          base_salary: number
          bpjs_kes_employee: number
          bpjs_kes_employer: number
          breakdown: Json | null
          company_id: string
          created_at: string
          employee_id: string
          gross_pay: number
          id: string
          jht_employee: number
          jht_employer: number
          jkk_employer: number
          jkm_employer: number
          jp_employee: number
          jp_employer: number
          net_pay: number
          overtime_pay: number
          payroll_run_id: string
          pph21: number
          ter_category: string | null
          ter_rate_bps: number | null
        }
        Insert: {
          allowances?: number
          base_salary?: number
          bpjs_kes_employee?: number
          bpjs_kes_employer?: number
          breakdown?: Json | null
          company_id: string
          created_at?: string
          employee_id: string
          gross_pay?: number
          id?: string
          jht_employee?: number
          jht_employer?: number
          jkk_employer?: number
          jkm_employer?: number
          jp_employee?: number
          jp_employer?: number
          net_pay?: number
          overtime_pay?: number
          payroll_run_id: string
          pph21?: number
          ter_category?: string | null
          ter_rate_bps?: number | null
        }
        Update: {
          allowances?: number
          base_salary?: number
          bpjs_kes_employee?: number
          bpjs_kes_employer?: number
          breakdown?: Json | null
          company_id?: string
          created_at?: string
          employee_id?: string
          gross_pay?: number
          id?: string
          jht_employee?: number
          jht_employer?: number
          jkk_employer?: number
          jkm_employer?: number
          jp_employee?: number
          jp_employer?: number
          net_pay?: number
          overtime_pay?: number
          payroll_run_id?: string
          pph21?: number
          ter_category?: string | null
          ter_rate_bps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          company_id: string
          completed_at: string | null
          config_snapshot: Json | null
          created_at: string
          created_by: string | null
          id: string
          period_month: number
          period_year: number
          status: Database["public"]["Enums"]["pay_period_status"]
          total_bpjs_employee: number
          total_bpjs_employer: number
          total_gross: number
          total_net: number
          total_pph21: number
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          config_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: number
          period_year: number
          status?: Database["public"]["Enums"]["pay_period_status"]
          total_bpjs_employee?: number
          total_bpjs_employer?: number
          total_gross?: number
          total_net?: number
          total_pph21?: number
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          config_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: number
          period_year?: number
          status?: Database["public"]["Enums"]["pay_period_status"]
          total_bpjs_employee?: number
          total_bpjs_employer?: number
          total_gross?: number
          total_net?: number
          total_pph21?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          company_id: string
          employee_id: string
          id: string
          issued_at: string
          payroll_item_id: string
          pdf_path: string | null
        }
        Insert: {
          company_id: string
          employee_id: string
          id?: string
          issued_at?: string
          payroll_item_id: string
          pdf_path?: string | null
        }
        Update: {
          company_id?: string
          employee_id?: string
          id?: string
          issued_at?: string
          payroll_item_id?: string
          pdf_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ptkp_rates: {
        Row: {
          annual_amount: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          status: string
        }
        Insert: {
          annual_amount: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          status: string
        }
        Update: {
          annual_amount?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          company_id: string
          created_at: string
          end_time: string
          grace_period_minutes: number
          id: string
          name: string
          start_time: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_time: string
          grace_period_minutes?: number
          id?: string
          name: string
          start_time: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_time?: string
          grace_period_minutes?: number
          id?: string
          name?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_brackets: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          lower_bound: number
          rate_bps: number
          upper_bound: number | null
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          lower_bound: number
          rate_bps: number
          upper_bound?: number | null
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          lower_bound?: number
          rate_bps?: number
          upper_bound?: number | null
        }
        Relationships: []
      }
      tax_profile: {
        Row: {
          company_id: string
          employee_id: string
          has_npwp: boolean
          npwp: string | null
          ptkp_status: string
        }
        Insert: {
          company_id: string
          employee_id: string
          has_npwp?: boolean
          npwp?: string | null
          ptkp_status?: string
        }
        Update: {
          company_id?: string
          employee_id?: string
          has_npwp?: boolean
          npwp?: string | null
          ptkp_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_profile_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_profile_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ter_rates: {
        Row: {
          category: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          income_lower: number
          income_upper: number | null
          rate_bps: number
        }
        Insert: {
          category: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          income_lower: number
          income_upper?: number | null
          rate_bps: number
        }
        Update: {
          category?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          income_lower?: number
          income_upper?: number | null
          rate_bps?: number
        }
        Relationships: []
      }
      work_schedules: {
        Row: {
          company_id: string
          created_at: string
          day_of_week: number
          effective_from: string
          employee_id: string
          id: string
          shift_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          day_of_week: number
          effective_from?: string
          employee_id: string
          id?: string
          shift_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          day_of_week?: number
          effective_from?: string
          employee_id?: string
          id?: string
          shift_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      calculate_overtime_hours: {
        Args: { p_date: string; p_employee_id: string }
        Returns: {
          actual_work_minutes: number
          is_rest_day: boolean
          overtime_minutes: number
          scheduled_minutes: number
        }[]
      }
      create_company_with_owner: {
        Args: { p_industry?: string; p_name: string }
        Returns: string
      }
      record_attendance: {
        Args: {
          p_company_id: string
          p_kind: Database["public"]["Enums"]["attendance_kind"]
          p_latitude: number
          p_longitude: number
          p_note?: string
          p_selfie_url?: string
        }
        Returns: string
      }
      refresh_active_seats: { Args: { p_company: string }; Returns: undefined }
      user_has_company_access: { Args: { target: string }; Returns: boolean }
      user_is_company_admin: { Args: { target: string }; Returns: boolean }
      user_role_in_company: {
        Args: { target: string }
        Returns: Database["public"]["Enums"]["company_role"]
      }
    }
    Enums: {
      attendance_kind: "clock_in" | "clock_out" | "break_start" | "break_end"
      company_role: "owner" | "admin" | "manager" | "employee"
      employee_status: "active" | "probation" | "inactive" | "terminated"
      employment_type: "permanent" | "contract" | "intern" | "daily"
      invite_status: "pending" | "accepted" | "revoked" | "expired"
      pay_period_status:
        | "draft"
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "paid"
        | "cancelled"
      plan_tier: "free" | "starter" | "growth" | "enterprise"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attendance_kind: ["clock_in", "clock_out", "break_start", "break_end"],
      company_role: ["owner", "admin", "manager", "employee"],
      employee_status: ["active", "probation", "inactive", "terminated"],
      employment_type: ["permanent", "contract", "intern", "daily"],
      invite_status: ["pending", "accepted", "revoked", "expired"],
      pay_period_status: [
        "draft",
        "queued",
        "processing",
        "completed",
        "failed",
        "paid",
        "cancelled",
      ],
      plan_tier: ["free", "starter", "growth", "enterprise"],
    },
  },
} as const

