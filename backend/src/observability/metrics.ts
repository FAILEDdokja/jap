/**
 * Metrics — Phase 4.5.
 *
 * A dependency-free, in-process Prometheus text-format registry. Deliberately
 * not `prom-client`: the Phase 4 scope forbids speculative infrastructure, the
 * counter/histogram set below is small and fixed, and this keeps the
 * dependency surface (and the supply-chain surface) unchanged. If a future
 * deployment needs exemplars, native histograms or push gateways, swapping in
 * `prom-client` touches only this file.
 *
 * Label discipline (docs/decisions/0008-observability.md):
 *   - labels are low-cardinality, server-chosen values only: route templates
 *     (never raw URLs, which can contain ids), methods, status classes, roles
 *   - NO user ids, patient ids, ABHA values, IPs or free text ever become
 *     labels — that would turn the metrics endpoint into a PHI side channel
 */

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}="${String(labels[k]).replace(/["\\\n]/g, "_")}"`).join(",");
}

class Counter {
  readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  get(labels: Labels = {}): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, value] of this.values) {
      lines.push(key ? `${this.name}{${key}} ${value}` : `${this.name} ${value}`);
    }
    return lines.join("\n");
  }
}

/** Fixed-bucket histogram. Buckets chosen for a request-latency SLO in ms. */
class Histogram {
  private readonly buckets: number[];
  private readonly series = new Map<string, { counts: number[]; sum: number; count: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
    buckets: number[] = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  ) {
    this.buckets = buckets;
  }

  observe(value: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.series.set(key, entry);
    }
    for (let i = 0; i < this.buckets.length; i += 1) {
      if (value <= (this.buckets[i] as number)) entry.counts[i] = (entry.counts[i] ?? 0) + 1;
    }
    entry.sum += value;
    entry.count += 1;
  }

  count(labels: Labels = {}): number {
    return this.series.get(labelKey(labels))?.count ?? 0;
  }

  reset(): void {
    this.series.clear();
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, entry] of this.series) {
      const base = key ? `${key},` : "";
      for (let i = 0; i < this.buckets.length; i += 1) {
        lines.push(`${this.name}_bucket{${base}le="${this.buckets[i]}"} ${entry.counts[i]}`);
      }
      lines.push(`${this.name}_bucket{${base}le="+Inf"} ${entry.count}`);
      lines.push(key ? `${this.name}_sum{${key}} ${entry.sum}` : `${this.name}_sum ${entry.sum}`);
      lines.push(key ? `${this.name}_count{${key}} ${entry.count}` : `${this.name}_count ${entry.count}`);
    }
    return lines.join("\n");
  }
}

export const metrics = {
  /** HTTP request count by method / route template / status class. */
  httpRequests: new Counter("jap_http_requests_total", "HTTP requests handled."),
  /** HTTP errors (4xx/5xx) by route template and status class. */
  httpErrors: new Counter("jap_http_errors_total", "HTTP responses with a 4xx/5xx status."),
  /** Request duration in milliseconds. */
  httpDuration: new Histogram("jap_http_request_duration_ms", "HTTP request duration in milliseconds."),

  /** Authentication funnel: `result` = success | failure. */
  authAttempts: new Counter("jap_auth_attempts_total", "Authentication attempts by outcome."),
  /** Session lifecycle: `event` = created | revoked | expired | idle | rejected. */
  sessionEvents: new Counter("jap_session_events_total", "Session lifecycle events."),

  /** Patient identity verification lifecycle: `stage` + `result`. */
  patientVerification: new Counter(
    "jap_patient_verification_total",
    "Patient identity verification lifecycle events.",
  ),

  /** Audit writes: `result` = success | failure. */
  auditWrites: new Counter("jap_audit_writes_total", "Audit event write attempts by outcome."),

  /** Database failures observed by the readiness probe and query paths. */
  databaseFailures: new Counter("jap_database_failures_total", "Database operation failures."),

  /** Upstream (ABDM adapter) failures — emitted once that adapter exists. */
  upstreamFailures: new Counter(
    "jap_upstream_failures_total",
    "Failures calling an upstream dependency (e.g. the ABDM adapter).",
  ),

  /** Rate-limit rejections by policy name. */
  rateLimited: new Counter("jap_rate_limited_total", "Requests rejected by a rate-limit policy."),
};

/** Render the whole registry in Prometheus text exposition format. */
export function renderMetrics(): string {
  return `${Object.values(metrics)
    .map((metric) => metric.render())
    .join("\n")}\n`;
}

/** Tests only. */
export function resetMetrics(): void {
  for (const metric of Object.values(metrics)) metric.reset();
}

/** Status class label (`2xx`, `4xx`, …) — keeps status cardinality at 5. */
export function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}
