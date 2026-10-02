/**
 * The cookie that names a product its founder just added, so the dashboard or the product's
 * editor, wherever saving it leads, offers to share it once (src/lib/new-product.ts). It holds only
 * the product's id, so the offer deletes it in the browser as it closes, before anything else can
 * load the page again.
 */
export const NEW_PRODUCT_COOKIE = "harbor_new_product";
export const NEW_PRODUCT_PATH = "/dashboard";

/** Deletes the cookie in the browser, with the same attributes the server set it with. */
export function forgetNewProduct() {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${NEW_PRODUCT_COOKIE}=; Max-Age=0; Path=${NEW_PRODUCT_PATH}; SameSite=Lax${secure}`;
}
