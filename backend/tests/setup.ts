/**
 * Global test setup.
 *
 * The hardening layer keeps process-wide state — rate-limit windows, metric
 * counters, the audit chain — that would otherwise leak between test files and
 * make results order-dependent. (The auth policy allows 5 attempts per
 * identifier per 15 minutes, so several test files signing in as `HP-1001`
 * would trip it.) Reset all of it before every test.
 */
import { beforeEach } from "vitest";
import { resetRateLimits } from "../src/middleware/rate-limit.js";
import { resetMetrics } from "../src/observability/metrics.js";
import { resetAuditStore } from "../src/modules/audit/service.js";

beforeEach(() => {
  resetRateLimits();
  resetMetrics();
  resetAuditStore();
});
