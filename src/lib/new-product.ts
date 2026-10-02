import { cookies } from "next/headers";
import { z } from "zod";
import { NEW_PRODUCT_COOKIE, NEW_PRODUCT_PATH } from "@/lib/new-product-cookie";
import { cookieOptions } from "@/lib/supabase/config";

// Long enough for an approval on Gumroad after saving.
const NEW_PRODUCT_SECONDS = 15 * 60;

export async function keepNewProduct(saasId: string) {
  (await cookies()).set(NEW_PRODUCT_COOKIE, saasId, {
    sameSite: "lax",
    secure: cookieOptions.secure,
    path: NEW_PRODUCT_PATH,
    maxAge: NEW_PRODUCT_SECONDS,
  });
}

/** The product the founder just added, if any. Pages still check that it is theirs. */
export async function newProductId() {
  const value = (await cookies()).get(NEW_PRODUCT_COOKIE)?.value;
  return z.uuid().safeParse(value).success ? (value as string) : null;
}
