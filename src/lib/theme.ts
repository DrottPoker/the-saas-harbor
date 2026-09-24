// Shared by the server layout (inline script) and the client theme menu.
export type Theme = "light" | "dark" | "system";
export const THEME_COOKIE = "theme";

// Runs during HTML parsing, before first paint, so a saved theme never flashes. Without a saved
// choice the attribute stays unset and CSS follows the OS preference.
export const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)/);if(m)document.documentElement.setAttribute("data-theme",m[1])}catch(e){}})()`;
