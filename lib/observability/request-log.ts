import type { NextResponse } from "next/server";

/**
 * Structured, single-line JSON log entry emitted for every request handled by
 * a route wrapped with `withRequestLog`.
 *
 * Deliberately routing/timing metadata only: no request/response bodies,
 * headers, query params, or incident/log/metric evidence content. This app
 * carries potentially sensitive log and metric evidence text through its
 * routes, so the logger must never echo any of it.
 */
export interface RequestLogEntry {
  routeName: string;
  method: string;
  status: number;
  durationMs: number;
  timestamp: string;
}

export interface RequestLogger {
  log(entry: RequestLogEntry): void;
}

/** Default logger: writes one JSON line to the console. */
export const consoleRequestLogger: RequestLogger = {
  log(entry) {
    console.log(JSON.stringify(entry));
  },
};

/**
 * Wraps a Next.js Route Handler so every invocation emits one structured
 * `RequestLogEntry`, without changing the handler's behavior or signature
 * shape. Works for both no-context handlers (e.g. `GET(request)`) and
 * dynamic-segment handlers (e.g. `POST(request, { params })`) via the
 * variadic `Args` type parameter, so it fits every route in this app's
 * `app/api/**` tree unchanged.
 *
 * Contract with the wrapped handler: it must always resolve to a
 * `NextResponse` (never throw past the wrapper) so the real HTTP status can
 * be logged. If it does throw anyway, the wrapper logs status 500 and
 * re-throws so Next's own error handling still takes over -- errors are
 * never swallowed here.
 */
export function withRequestLog<Args extends unknown[]>(
  routeName: string,
  handler: (request: Request, ...args: Args) => Promise<NextResponse>,
  logger: RequestLogger = consoleRequestLogger,
): (request: Request, ...args: Args) => Promise<NextResponse> {
  return async (request: Request, ...args: Args): Promise<NextResponse> => {
    const startedAt = new Date();
    const method = request.method;

    try {
      const response = await handler(request, ...args);
      logger.log({
        routeName,
        method,
        status: response.status,
        durationMs: Date.now() - startedAt.getTime(),
        timestamp: startedAt.toISOString(),
      });
      return response;
    } catch (error) {
      logger.log({
        routeName,
        method,
        status: 500,
        durationMs: Date.now() - startedAt.getTime(),
        timestamp: startedAt.toISOString(),
      });
      throw error;
    }
  };
}
