/**
 * Tracing seam — Phase 4.5.
 *
 * The Phase 4 scope explicitly forbids standing up a distributed tracing
 * platform that no deployment requirement has asked for. What it *does*
 * require is that correlation is possible and that adopting OpenTelemetry
 * later is a wiring change rather than a refactor.
 *
 * So: a tiny `Tracer` interface plus a default no-op implementation that only
 * propagates the correlation id. Every request already carries `request.id`
 * (honoring an inbound `x-request-id`), and W3C `traceparent` is parsed when
 * present so a trace started at the edge keeps its id through our logs.
 *
 * To adopt OTel later: implement `Tracer` over the SDK and call `setTracer()`
 * in `server.ts`. Nothing else changes.
 */

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  recordError(error: unknown): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string, attributes?: SpanAttributes): Span;
}

const noopSpan: Span = {
  setAttribute() {},
  recordError() {},
  end() {},
};

const noopTracer: Tracer = {
  startSpan: () => noopSpan,
};

let tracer: Tracer = noopTracer;

export function setTracer(next: Tracer): void {
  tracer = next;
}

export function getTracer(): Tracer {
  return tracer;
}

/** W3C traceparent: `00-<32 hex trace id>-<16 hex span id>-<2 hex flags>`. */
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i;

export interface CorrelationContext {
  requestId: string;
  traceId?: string;
  parentSpanId?: string;
}

/**
 * Build the correlation context for a request: always a requestId, plus the
 * inbound W3C trace ids when a gateway supplied them.
 */
export function correlationFrom(
  requestId: string,
  headers: Record<string, unknown>,
): CorrelationContext {
  const raw = headers["traceparent"];
  if (typeof raw === "string") {
    const match = TRACEPARENT.exec(raw.trim());
    if (match) return { requestId, traceId: match[1], parentSpanId: match[2] };
  }
  return { requestId };
}
