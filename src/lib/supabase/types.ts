import type { Database as GeneratedDatabase } from "./database.types";

type Functions = GeneratedDatabase["public"]["Functions"];
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };
type Row<F extends keyof Functions> = Functions[F]["Returns"] extends (infer R)[] ? R : never;

// PostgreSQL function argument nullability, and the nullability of columns returned by functions,
// are not included in generated types.
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: Omit<
      Functions,
      | "save_saas"
      | "record_revenue_verification"
      | "save_profile"
      | "admin_hide_saas"
      | "admin_suspend_account"
      | "admin_accounts"
      | "admin_account"
      | "saas_slug_redirect"
      | "check_username"
      | "submit_feedback"
      | "username_change_available_at"
      | "claim_emails"
      | "complete_email"
    > & {
      claim_emails: {
        Args: Functions["claim_emails"]["Args"];
        Returns: Nullable<Row<"claim_emails">, "name" | "context">[];
      };
      complete_email: {
        Args: Nullable<Functions["complete_email"]["Args"], "p_error">;
        Returns: undefined;
      };
      saas_slug_redirect: {
        Args: Functions["saas_slug_redirect"]["Args"];
        Returns: string | null;
      };
      check_username: {
        Args: Functions["check_username"]["Args"];
        Returns: "format" | "reserved" | "taken" | null;
      };
      submit_feedback: {
        Args: Nullable<Functions["submit_feedback"]["Args"], "p_page">;
        Returns: string;
      };
      username_change_available_at: {
        Args: never;
        Returns: string | null;
      };
      save_profile: {
        Args: Nullable<Functions["save_profile"]["Args"], "p_avatar_path">;
        Returns: undefined;
      };
      save_saas: {
        Args: Nullable<Functions["save_saas"]["Args"], "p_logo_path" | "p_launched_on">;
        Returns: string;
      };
      record_revenue_verification: {
        Args: Nullable<
          Functions["record_revenue_verification"]["Args"],
          | "p_encrypted_key"
          | "p_key_hint"
          | "p_fx_date"
          | "p_history"
          | "p_mrr_invoice_cents"
          | "p_mrr_30d_ago_cents"
          | "p_history_at"
        >;
        Returns: undefined;
      };
      admin_hide_saas: {
        Args: Nullable<Functions["admin_hide_saas"]["Args"], "p_report">;
        Returns: undefined;
      };
      admin_suspend_account: {
        Args: Nullable<Functions["admin_suspend_account"]["Args"], "p_report">;
        Returns: undefined;
      };
      // Accounts without a maker profile have no name, headline, photo or suspension.
      admin_accounts: {
        Args: Functions["admin_accounts"]["Args"];
        Returns: Nullable<
          Row<"admin_accounts">,
          "name" | "headline" | "avatar_path" | "last_sign_in_at" | "suspended_at"
        >[];
      };
      admin_account: {
        Args: Functions["admin_account"]["Args"];
        Returns: Nullable<Row<"admin_account">, "last_sign_in_at" | "email_confirmed_at">[];
      };
    };
  };
};
