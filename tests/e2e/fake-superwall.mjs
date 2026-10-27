// A stand-in for Superwall's API v2, for the tests only, under /superwall. Figures are placed
// relative to the current day, in USD, as Superwall's charts give them.
//
// Key "one" has the charts:read scope only, for application 18342. Its MRR chart shows $100 a day
// until 20 days ago and $120.50 since, today's point marked incomplete, back over 14 months: MRR is
// $120.50, the month-ends before the change show $100, and MRR thirty days ago was $100, so growth
// is +20.5%. The Active Subscriptions chart shows 12 until 20 days ago and 15 since, so there are 15
// subscribers. The Proceeds chart gives $8.40 a day for the 400 days before today and $2.10 so far
// today, so the last 30 days give $245.70, each day a payment of unknown kind. Sandbox figures,
// which the charts are asked to leave out, would add $1,000 to every value. Key "wide" can also
// read projects, paywalls and campaigns, and is refused.

export const SUPERWALL = {
  application: "18342",
  one: "sk_harborSuperwallOne0000000001",
  wide: "sk_harborSuperwallWide000000001",
};

const keys = [
  { key: SUPERWALL.one, scopes: ["charts:read"] },
  {
    key: SUPERWALL.wide,
    scopes: ["charts:read", "projects:read", "paywalls:read", "paywalls:write", "campaigns:read"],
  },
];

const DAY = 86_400_000;
function today() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
const date = (ms) => new Date(ms).toISOString().slice(0, 10);

const chartTypes = [
  {
    key: "proceeds",
    name: "Proceeds",
    description: "Revenue after refunds, store fees, and taxes.",
    x_axis: "purchaseDate",
    y_axis: "netProceeds",
    date_dimension: "purchaseDate",
    include: [],
  },
  {
    key: "mrr",
    name: "MRR",
    description: "Monthly recurring revenue from subscriptions.",
    x_axis: "mrrDate",
    y_axis: "mrr",
    date_dimension: "mrrDate",
    include: [],
  },
  {
    key: "activeSubscriptions",
    name: "Active Subscriptions",
    description: "Count of unexpired, paid subscriptions.",
    x_axis: "mrrDate",
    y_axis: "activeSubscriptions",
    date_dimension: "mrrDate",
    include: [],
  },
];

/** A metric's value on a day, `ago` days before today, in production. */
function valueOn(metric, ago) {
  if (metric === "mrr") return ago < 20 ? 120.5 : 100;
  if (metric === "activeSubscriptions") return ago < 20 ? 15 : 12;
  if (metric === "netProceeds") return ago === 0 ? 2.1 : ago <= 400 ? 8.4 : 0;
  return null;
}

const VALUE_TYPES = { mrr: "currency", netProceeds: "currency", activeSubscriptions: "number" };

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function chartData(body, send) {
  const invalid = (message) =>
    send(400, {
      _tag: "@superwall/api-schema/v2/errors/BadRequest",
      type: "invalid_request_error",
      code: "parameter_invalid",
      message,
    });
  if (!body || body.application_id !== SUPERWALL.application)
    return send(404, {
      _tag: "@superwall/api-schema/v2/errors/NotFound",
      type: "invalid_request_error",
      code: "resource_missing",
      message: "Application not found.",
    });
  const type = chartTypes.find((t) => t.y_axis === body.y_axis && t.x_axis === body.x_axis);
  if (!type) return invalid("Unknown y_axis or x_axis.");
  const filter = body.date_filter;
  const range = filter?.range;
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
  if (filter?.dimension !== type.date_dimension || filter?.preset !== "custom")
    return invalid("The date filter must use the chart's date dimension and a custom range.");
  if (!isDate(range?.from) || !isDate(range?.to) || range.from > range.to)
    return invalid("The range must be two dates.");
  if (body.date_interval !== "day") return invalid("Only daily values are expected.");
  const production =
    Array.isArray(body.environment) &&
    body.environment.length === 1 &&
    body.environment[0] === "PRODUCTION";
  const end = today();
  const data = [];
  for (
    let at = Date.parse(`${range.from}T00:00:00Z`);
    at <= Date.parse(`${range.to}T00:00:00Z`) && at <= end;
    at += DAY
  ) {
    const value = valueOn(body.y_axis, Math.round((end - at) / DAY));
    data.push({
      x: date(at),
      incomplete: at === end,
      values: { null: { y: value + (production ? 0 : 1000), extra: {} } },
    });
  }
  if (data.length > (body.max_data_points ?? 1000)) return invalid("Too many data points.");
  return send(200, {
    object: "chart_data",
    request_id: "req_harbor",
    series: [{ breakdown: "", key: null }],
    data,
    y_axis: {
      key: body.y_axis,
      name: type.name,
      description: type.description,
      value_type: VALUE_TYPES[body.y_axis],
    },
    x_axis: { key: body.x_axis, name: "Date", description: "", value_type: "date" },
    filters: [
      {
        key: "environment",
        name: "Environment",
        description: "",
        active: production,
        value_type: "string",
        value: body.environment ?? [],
      },
    ],
    breakdowns: [],
    date_filters: [],
    enriched_data: {},
    duration: { start_time: 0, end_time: 1, duration_ms: 1 },
  });
}

export async function handleSuperwall(url, request, response) {
  if (!url.pathname.startsWith("/superwall/")) return false;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
    return true;
  };
  const path = url.pathname.slice("/superwall".length);
  const key = keys.find((k) => request.headers.authorization === `Bearer ${k.key}`);
  if (!key)
    return send(401, {
      _tag: "@superwall/api-schema/v2/errors/AuthenticationError",
      type: "authentication_error",
      code: "invalid_api_key",
      message: "The API key is invalid or has been revoked.",
    });
  const needs = (scope) =>
    key.scopes.includes(scope)
      ? null
      : send(403, {
          _tag: "@superwall/api-schema/v2/errors/PermissionError",
          type: "permission_error",
          code: "insufficient_permissions",
          message: `This action requires the ${scope} scope.`,
          required_scope: scope,
        });

  // Reading chart data is the one request that is not a GET.
  if (path === "/v2/charts/data" && request.method === "POST")
    return needs("charts:read") ?? chartData(await readJson(request), send);
  if (request.method !== "GET")
    return send(405, { type: "invalid_request_error", message: "Only reads are expected." });
  if (path === "/v2/charts/definitions") {
    if (url.searchParams.get("application_id") !== SUPERWALL.application)
      return send(404, {
        type: "invalid_request_error",
        code: "resource_missing",
        message: "Application not found.",
      });
    return (
      needs("charts:read") ??
      send(200, {
        object: "chart_definitions",
        y_axis: [],
        x_axis: [],
        breakdowns: [],
        filters: [],
        date_presets: ["custom"],
        date_intervals: [],
        chart_types: chartTypes,
      })
    );
  }
  if (path === "/v2/projects")
    return (
      needs("projects:read") ??
      send(200, { object: "list", url: "/v2/projects", has_more: false, data: [] })
    );
  if (path === "/v2/paywalls")
    return needs("paywalls:read") ?? send(200, { object: "list", has_more: false, data: [] });
  if (path === "/v2/campaigns")
    return needs("campaigns:read") ?? send(200, { object: "list", has_more: false, data: [] });
  return send(404, {
    type: "invalid_request_error",
    code: "resource_missing",
    message: `Unknown path ${path}`,
  });
}
