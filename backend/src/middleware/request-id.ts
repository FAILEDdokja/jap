/**
 * Request IDs.
 *
 * Every request gets a stable ID (`req.id`), generated in the Fastify
 * `genReqId` option (see app.ts): an inbound `x-request-id` header is honored
 * when present, otherwise a UUIDv4 is minted. The hook below echoes the ID on
 * every response so clients and proxies can correlate with server logs.
 */
import type { FastifyInstance } from "fastify";

export function registerRequestId(app: FastifyInstance, headerName: string): void {
  app.addHook("onSend", async (request, reply) => {
    reply.header(headerName, request.id);
  });
}
