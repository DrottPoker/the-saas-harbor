// The currencies amounts can be shown in, and the currency of each country. Stored figures stay
// USD cents; these only change how a visitor sees them.

/** The visitor's own choice of currency, set from the menu in the header. */
export const CURRENCY_COOKIE = "currency";
export const BASE_CURRENCY = "USD";

/**
 * Every currency with a daily reference rate from Frankfurter's central-bank data, except the
 * ones whose official rate is far from what people pay (CUP, IRR, KPW, LBP, MMK, SDG, SSP, SYP,
 * VES, ZWG), which would mislead; those countries see USD. Metals, crypto and XDR are not money
 * people price products in.
 */
export const CURRENCIES = [
  "USD", "EUR", "GBP", "CNY", "INR", "BRL", "MXN", "RUB", "JPY", "AED", "AFN", "ALL", "AMD",
  "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BHD", "BIF", "BMD", "BND",
  "BOB", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "COP", "CRC", "CVE",
  "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "FJD", "FKP", "GEL", "GHS", "GIP",
  "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "IQD", "ISK", "JMD",
  "JOD", "KES", "KGS", "KHR", "KMF", "KRW", "KWD", "KYD", "KZT", "LAK", "LKR", "LRD", "LSL",
  "LYD", "MAD", "MDL", "MGA", "MKD", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MYR", "MZN",
  "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN",
  "PYG", "QAR", "RON", "RSD", "RWF", "SAR", "SBD", "SCR", "SEK", "SGD", "SHP", "SLE", "SOS",
  "SRD", "STN", "SVC", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS",
  "UAH", "UGX", "UYU", "UZS", "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XOF", "XPF", "YER",
  "ZAR", "ZMW",
] as const; // prettier-ignore
export type Currency = (typeof CURRENCIES)[number];

/** The currencies the menu lists first, before the rest in alphabetical order. */
export const COMMON_CURRENCIES: readonly Currency[] = [
  "USD", "EUR", "GBP", "CNY", "INR", "BRL", "MXN", "RUB", "JPY", "AED", "SAR", "NGN", "ZAR",
]; // prettier-ignore

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

// ISO 3166 country to ISO 4217 currency. Countries that use another country's currency, such as
// the US dollar or the euro, map to it.
export const COUNTRY_CURRENCY: Record<string, string> = {
  AD: "EUR", AE: "AED", AF: "AFN", AG: "XCD", AI: "XCD", AL: "ALL", AM: "AMD", AO: "AOA",
  AR: "ARS", AS: "USD", AT: "EUR", AU: "AUD", AW: "AWG", AX: "EUR", AZ: "AZN", BA: "BAM",
  BB: "BBD", BD: "BDT", BE: "EUR", BF: "XOF", BG: "EUR", BH: "BHD", BI: "BIF", BJ: "XOF",
  BL: "EUR", BM: "BMD", BN: "BND", BO: "BOB", BQ: "USD", BR: "BRL", BS: "BSD", BT: "BTN",
  BW: "BWP", BY: "BYN", BZ: "BZD", CA: "CAD", CC: "AUD", CD: "CDF", CF: "XAF", CG: "XAF",
  CH: "CHF", CI: "XOF", CK: "NZD", CL: "CLP", CM: "XAF", CN: "CNY", CO: "COP", CR: "CRC",
  CU: "CUP", CV: "CVE", CW: "XCG", CX: "AUD", CY: "EUR", CZ: "CZK", DE: "EUR", DJ: "DJF",
  DK: "DKK", DM: "XCD", DO: "DOP", DZ: "DZD", EC: "USD", EE: "EUR", EG: "EGP", EH: "MAD",
  ER: "ERN", ES: "EUR", ET: "ETB", FI: "EUR", FJ: "FJD", FK: "FKP", FM: "USD", FO: "DKK",
  FR: "EUR", GA: "XAF", GB: "GBP", GD: "XCD", GE: "GEL", GF: "EUR", GG: "GBP", GH: "GHS",
  GI: "GIP", GL: "DKK", GM: "GMD", GN: "GNF", GP: "EUR", GQ: "XAF", GR: "EUR", GT: "GTQ",
  GU: "USD", GW: "XOF", GY: "GYD", HK: "HKD", HN: "HNL", HR: "EUR", HT: "HTG", HU: "HUF",
  ID: "IDR", IE: "EUR", IL: "ILS", IM: "GBP", IN: "INR", IO: "USD", IQ: "IQD", IR: "IRR",
  IS: "ISK", IT: "EUR", JE: "GBP", JM: "JMD", JO: "JOD", JP: "JPY", KE: "KES", KG: "KGS",
  KH: "KHR", KI: "AUD", KM: "KMF", KN: "XCD", KP: "KPW", KR: "KRW", KW: "KWD", KY: "KYD",
  KZ: "KZT", LA: "LAK", LB: "LBP", LC: "XCD", LI: "CHF", LK: "LKR", LR: "LRD", LS: "LSL",
  LT: "EUR", LU: "EUR", LV: "EUR", LY: "LYD", MA: "MAD", MC: "EUR", MD: "MDL", ME: "EUR",
  MF: "EUR", MG: "MGA", MH: "USD", MK: "MKD", ML: "XOF", MM: "MMK", MN: "MNT", MO: "MOP",
  MP: "USD", MQ: "EUR", MR: "MRU", MS: "XCD", MT: "EUR", MU: "MUR", MV: "MVR", MW: "MWK",
  MX: "MXN", MY: "MYR", MZ: "MZN", NA: "NAD", NC: "XPF", NE: "XOF", NF: "AUD", NG: "NGN",
  NI: "NIO", NL: "EUR", NO: "NOK", NP: "NPR", NR: "AUD", NU: "NZD", NZ: "NZD", OM: "OMR",
  PA: "PAB", PE: "PEN", PF: "XPF", PG: "PGK", PH: "PHP", PK: "PKR", PL: "PLN", PM: "EUR",
  PN: "NZD", PR: "USD", PS: "ILS", PT: "EUR", PW: "USD", PY: "PYG", QA: "QAR", RE: "EUR",
  RO: "RON", RS: "RSD", RU: "RUB", RW: "RWF", SA: "SAR", SB: "SBD", SC: "SCR", SD: "SDG",
  SE: "SEK", SG: "SGD", SH: "SHP", SI: "EUR", SK: "EUR", SL: "SLE", SM: "EUR", SN: "XOF",
  SO: "SOS", SR: "SRD", SS: "SSP", ST: "STN", SV: "USD", SX: "XCG", SY: "SYP", SZ: "SZL",
  TC: "USD", TD: "XAF", TG: "XOF", TH: "THB", TJ: "TJS", TK: "NZD", TL: "USD", TM: "TMT",
  TN: "TND", TO: "TOP", TR: "TRY", TT: "TTD", TV: "AUD", TW: "TWD", TZ: "TZS", UA: "UAH",
  UG: "UGX", UM: "USD", US: "USD", UY: "UYU", UZ: "UZS", VA: "EUR", VC: "XCD", VE: "VES",
  VG: "USD", VI: "USD", VN: "VND", VU: "VUV", WF: "XPF", WS: "WST", XK: "EUR", YE: "YER",
  YT: "EUR", ZA: "ZAR", ZM: "ZMW", ZW: "ZWG",
}; // prettier-ignore

/** The currency of a country (ISO 3166 alpha-2), or USD where it has none listed above. */
export function countryCurrency(country: string | null | undefined): Currency {
  const currency = country ? COUNTRY_CURRENCY[country.toUpperCase()] : undefined;
  return isCurrency(currency) ? currency : BASE_CURRENCY;
}
