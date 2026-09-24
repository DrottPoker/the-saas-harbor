import type { Database as GeneratedDatabase } from "./database.types";

type Functions = GeneratedDatabase["public"]["Functions"];
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

// PostgreSQL function argument nullability is not included in generated types.
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: {
      save_saas: {
        Args: Nullable<Functions["save_saas"]["Args"], "p_logo_path" | "p_launched_on">;
        Returns: string;
      };
      record_stripe_verification: {
        Args: Nullable<
          Functions["record_stripe_verification"]["Args"],
          "p_encrypted_key" | "p_key_hint" | "p_fx_date"
        >;
        Returns: undefined;
      };
    };
  };
};
