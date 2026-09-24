import type { Database as GeneratedDatabase } from "./database.types";

type Functions = GeneratedDatabase["public"]["Functions"];
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

// PostgreSQL function argument nullability is not included in generated types.
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<Functions, "save_saas" | "record_stripe_verification" | "save_profile"> & {
      save_profile: {
        Args: Nullable<Functions["save_profile"]["Args"], "p_avatar_path" | "p_cover_path">;
        Returns: undefined;
      };
      save_saas: {
        Args: Nullable<Functions["save_saas"]["Args"], "p_logo_path" | "p_launched_on">;
        Returns: string;
      };
      record_stripe_verification: {
        Args: Nullable<
          Functions["record_stripe_verification"]["Args"],
          | "p_encrypted_key"
          | "p_key_hint"
          | "p_fx_date"
          | "p_history"
          | "p_mrr_invoice_cents"
          | "p_mrr_30d_ago_cents"
        >;
        Returns: undefined;
      };
    };
  };
};
