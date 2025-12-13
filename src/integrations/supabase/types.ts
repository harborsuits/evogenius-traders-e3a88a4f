export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          capital_allocation: number
          created_at: string
          generation_id: string
          genes: Json
          id: string
          is_elite: boolean
          status: Database["public"]["Enums"]["agent_status"]
          strategy_template: Database["public"]["Enums"]["strategy_template"]
        }
        Insert: {
          capital_allocation?: number
          created_at?: string
          generation_id: string
          genes: Json
          id?: string
          is_elite?: boolean
          status?: Database["public"]["Enums"]["agent_status"]
          strategy_template: Database["public"]["Enums"]["strategy_template"]
        }
        Update: {
          capital_allocation?: number
          created_at?: string
          generation_id?: string
          genes?: Json
          id?: string
          is_elite?: boolean
          status?: Database["public"]["Enums"]["agent_status"]
          strategy_template?: Database["public"]["Enums"]["strategy_template"]
        }
        Relationships: [
          {
            foreignKeyName: "agents_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      control_events: {
        Row: {
          action: string
          id: string
          metadata: Json | null
          new_status: string | null
          previous_status: string | null
          triggered_at: string
        }
        Insert: {
          action: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          previous_status?: string | null
          triggered_at?: string
        }
        Update: {
          action?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          previous_status?: string | null
          triggered_at?: string
        }
        Relationships: []
      }
      generations: {
        Row: {
          avg_fitness: number | null
          created_at: string
          end_time: string | null
          generation_number: number
          id: string
          is_active: boolean
          max_drawdown: number
          regime_tag: string | null
          start_time: string
          termination_reason:
            | Database["public"]["Enums"]["generation_termination_reason"]
            | null
          total_pnl: number
          total_trades: number
        }
        Insert: {
          avg_fitness?: number | null
          created_at?: string
          end_time?: string | null
          generation_number: number
          id?: string
          is_active?: boolean
          max_drawdown?: number
          regime_tag?: string | null
          start_time?: string
          termination_reason?:
            | Database["public"]["Enums"]["generation_termination_reason"]
            | null
          total_pnl?: number
          total_trades?: number
        }
        Update: {
          avg_fitness?: number | null
          created_at?: string
          end_time?: string | null
          generation_number?: number
          id?: string
          is_active?: boolean
          max_drawdown?: number
          regime_tag?: string | null
          start_time?: string
          termination_reason?:
            | Database["public"]["Enums"]["generation_termination_reason"]
            | null
          total_pnl?: number
          total_trades?: number
        }
        Relationships: []
      }
      market_data: {
        Row: {
          atr_ratio: number
          change_24h: number
          ema_50_slope: number
          id: string
          price: number
          regime: string
          symbol: string
          updated_at: string
          volume_24h: number
        }
        Insert: {
          atr_ratio?: number
          change_24h?: number
          ema_50_slope?: number
          id?: string
          price: number
          regime?: string
          symbol: string
          updated_at?: string
          volume_24h?: number
        }
        Update: {
          atr_ratio?: number
          change_24h?: number
          ema_50_slope?: number
          id?: string
          price?: number
          regime?: string
          symbol?: string
          updated_at?: string
          volume_24h?: number
        }
        Relationships: []
      }
      performance: {
        Row: {
          agent_id: string
          created_at: string
          fitness_score: number
          generation_id: string
          id: string
          max_drawdown: number
          net_pnl: number
          profitable_days_ratio: number
          sharpe_ratio: number
          total_trades: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          fitness_score: number
          generation_id: string
          id?: string
          max_drawdown?: number
          net_pnl?: number
          profitable_days_ratio?: number
          sharpe_ratio?: number
          total_trades?: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          fitness_score?: number
          generation_id?: string
          id?: string
          max_drawdown?: number
          net_pnl?: number
          profitable_days_ratio?: number
          sharpe_ratio?: number
          total_trades?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          config: Json
          id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_state: {
        Row: {
          active_pool: number
          current_generation_id: string | null
          id: string
          reserve: number
          status: Database["public"]["Enums"]["system_status"]
          today_pnl: number
          today_trades: number
          total_capital: number
          updated_at: string
        }
        Insert: {
          active_pool?: number
          current_generation_id?: string | null
          id?: string
          reserve?: number
          status?: Database["public"]["Enums"]["system_status"]
          today_pnl?: number
          today_trades?: number
          total_capital?: number
          updated_at?: string
        }
        Update: {
          active_pool?: number
          current_generation_id?: string | null
          id?: string
          reserve?: number
          status?: Database["public"]["Enums"]["system_status"]
          today_pnl?: number
          today_trades?: number
          total_capital?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_state_current_generation_id_fkey"
            columns: ["current_generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          agent_id: string
          fees: number
          fill_price: number
          fill_size: number
          generation_id: string
          id: string
          intent_size: number
          outcome: Database["public"]["Enums"]["trade_outcome"]
          pnl: number
          side: Database["public"]["Enums"]["trade_side"]
          symbol: string
          timestamp: string
        }
        Insert: {
          agent_id: string
          fees?: number
          fill_price: number
          fill_size: number
          generation_id: string
          id?: string
          intent_size: number
          outcome: Database["public"]["Enums"]["trade_outcome"]
          pnl?: number
          side: Database["public"]["Enums"]["trade_side"]
          symbol: string
          timestamp?: string
        }
        Update: {
          agent_id?: string
          fees?: number
          fill_price?: number
          fill_size?: number
          generation_id?: string
          id?: string
          intent_size?: number
          outcome?: Database["public"]["Enums"]["trade_outcome"]
          pnl?: number
          side?: Database["public"]["Enums"]["trade_side"]
          symbol?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      agent_status: "elite" | "active" | "probation" | "removed"
      generation_termination_reason: "time" | "trades" | "drawdown"
      strategy_template: "trend_pullback" | "mean_reversion" | "breakout"
      system_status: "running" | "paused" | "stopped" | "error"
      trade_outcome: "success" | "failed" | "denied"
      trade_side: "BUY" | "SELL"
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
  public: {
    Enums: {
      agent_status: ["elite", "active", "probation", "removed"],
      generation_termination_reason: ["time", "trades", "drawdown"],
      strategy_template: ["trend_pullback", "mean_reversion", "breakout"],
      system_status: ["running", "paused", "stopped", "error"],
      trade_outcome: ["success", "failed", "denied"],
      trade_side: ["BUY", "SELL"],
    },
  },
} as const
