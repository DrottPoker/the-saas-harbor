import type { Database as GeneratedDatabase } from "./database.types";

type SaveArgs = GeneratedDatabase["public"]["Functions"]["save_saas"]["Args"];
// PostgreSQL function argument nullability is not included in generated types.
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: {
      save_saas: {
        Args: Omit<SaveArgs, "p_customers" | "p_mrr_cents" | "p_logo_path" | "p_launched_on"> & {
          p_customers: number | null; p_mrr_cents: number | null;
          p_logo_path: string | null; p_launched_on: string | null;
        };
        Returns: string;
      };
    };
  };
};
