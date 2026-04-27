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
      categorization_corrections: {
        Row: {
          id: string
          tenant_id: string
          invoice_id: string
          original_code: string | null
          corrected_code: string
          supplier_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          invoice_id: string
          original_code?: string | null
          corrected_code: string
          supplier_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          invoice_id?: string
          original_code?: string | null
          corrected_code?: string
          supplier_name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorization_corrections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_corrections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_field_corrections: {
        Row: {
          id: string
          tenant_id: string
          invoice_id: string
          supplier_name: string | null
          field_path: string
          previous_value: Json | null
          corrected_value: Json
          corrected_to_ai: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          invoice_id: string
          supplier_name?: string | null
          field_path: string
          previous_value?: Json | null
          corrected_value: Json
          corrected_to_ai?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          invoice_id?: string
          supplier_name?: string | null
          field_path?: string
          previous_value?: Json | null
          corrected_value?: Json
          corrected_to_ai?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_field_corrections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_field_corrections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          approval_method: string | null
          approved_at: string | null
          approved_by: string | null
          bu_schluessel: number | null
          categorization_confidence: number | null
          confidence_sort_key: number | null
          created_at: string
          extracted_at: string | null
          extraction_attempts: number
          extraction_error: string | null
          file_path: string
          file_type: string
          id: string
          invoice_data: Json | null
          original_filename: string
          review_priority_key: number | null
          skr_code: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approval_method?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bu_schluessel?: number | null
          categorization_confidence?: number | null
          // confidence_sort_key + review_priority_key are GENERATED ALWAYS — no Insert
          created_at?: string
          extracted_at?: string | null
          extraction_attempts?: number
          extraction_error?: string | null
          file_path: string
          file_type: string
          id?: string
          invoice_data?: Json | null
          original_filename: string
          skr_code?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approval_method?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bu_schluessel?: number | null
          categorization_confidence?: number | null
          // confidence_sort_key + review_priority_key are GENERATED ALWAYS — no Update
          created_at?: string
          extracted_at?: string | null
          extraction_attempts?: number
          extraction_error?: string | null
          file_path?: string
          file_type?: string
          id?: string
          invoice_data?: Json | null
          original_filename?: string
          skr_code?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          company_address: string | null
          company_name: string
          created_at: string
          datev_berater_nr: string | null
          datev_fiscal_year_start: number
          datev_mandanten_nr: string | null
          datev_sachkontenlaenge: number
          id: string
          skr_plan: string
          steuerberater_name: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          company_address?: string | null
          company_name: string
          created_at?: string
          datev_berater_nr?: string | null
          datev_fiscal_year_start?: number
          datev_mandanten_nr?: string | null
          datev_sachkontenlaenge?: number
          id?: string
          skr_plan?: string
          steuerberater_name?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          company_address?: string | null
          company_name?: string
          created_at?: string
          datev_berater_nr?: string | null
          datev_fiscal_year_start?: number
          datev_mandanten_nr?: string | null
          datev_sachkontenlaenge?: number
          id?: string
          skr_plan?: string
          steuerberater_name?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          ai_disclaimer_accepted_at: string | null
          created_at: string
          email: string
          id: string
          onboarded_at: string | null
          role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_disclaimer_accepted_at?: string | null
          created_at?: string
          email: string
          id: string
          onboarded_at?: string | null
          role?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_disclaimer_accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          onboarded_at?: string | null
          role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_first_invoice_step: { Args: never; Returns: undefined }
      complete_onboarding: {
        Args: {
          p_company_name: string
          p_disclaimer_accepted: boolean
          p_skr_plan: string
          p_steuerberater_name: string
        }
        Returns: undefined
      }
      my_tenant_id: { Args: never; Returns: string }
      invoice_stage_counts: {
        Args: never
        Returns: {
          status: Database["public"]["Enums"]["invoice_status"]
          count: number
        }[]
      }
      invoice_processing_stats: {
        Args: never
        Returns: {
          total_invoices: number
          avg_accuracy: number | null
          export_history_count: number
        }[]
      }
    }
    Enums: {
      invoice_status:
        | "captured"
        | "processing"
        | "ready"
        | "review"
        | "exported"
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
      invoice_status: ["captured", "processing", "ready", "review", "exported"],
    },
  },
} as const

