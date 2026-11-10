import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { Prisma } from './db';
import { env } from './env';
import { AppError, fail } from './errors';
import { hmac } from './crypto';
import { errorFields, log } from './log';
import { requireCustomer, requireStaff } from './auth/guard';
import type { CustomerSession, StaffSession } from './auth/session';
import type { Permission } from '@/lib/domain/permissions';
import type { ApiErrorBody } from '@/lib/contracts/errors';

/**
 * Every API route is written with one of three builders: `publicRoute`, `customerRoute` or `staffRoute`. The builder, not
 * the route, does the parts that must never be forgotten, in a fixed order:
 *
 *   cross-site check (for writes) -> sign-in and permission -> params -> query -> body -> your handler -> JSON or error
 *
 * Nobody can reach validation or the handler without the right session, a route cannot return an unvalidated body, and
 * every error leaves as the same JSON shape with a request id, with nothing internal in it.
 */

type RouteFn = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

type Spec<B, Q, P> = {
  /** Validates the JSON body of POST, PUT and PATCH requests. */
  body?: ZodType<B>;
  query?: ZodType<Q>;
  params?: ZodType<P>;
  /** Cache-Control for a successful GET. Default is private and not cached, because almost everything here is personal. */
  cache?: string;
};

export type RouteBase<B, Q, P> = { req: Request; requestId: string; ipHash: string | null; userAgent: string | null; body: B; query: Q; params: P };

const MAX_BODY_BYTES = 64 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestOrigin(req: Request): string {
  const configured = env().APP_ORIGIN;
  if (configured) return new URL(configured).origin;
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

/**
 * Defence in depth against cross-site request forgery. The cookies are SameSite=Lax, so other sites cannot send them on a
 * POST anyway; this also refuses a write whose Origin is not ours, and one that the browser says came from another site.
 */
function assertSameOrigin(req: Request) {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get('origin');
  if (origin) {
    if (origin !== requestOrigin(req)) throw fail.badOrigin();
    return;
  }
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') throw fail.badOrigin();
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || null;
}

async function readBody<B>(req: Request, schema: ZodType<B>): Promise<B> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) throw new AppError('BAD_REQUEST', 413, 'The request is too large');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError('BAD_REQUEST', 413, 'The request is too large');
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw fail.badRequest('The request body is not valid JSON');
  }
  return schema.parse(json);
}

function build<B, Q, P, X extends object>(spec: Spec<B, Q, P>, resolveAuth: () => Promise<X>, handler: (c: RouteBase<B, Q, P> & X) => Promise<unknown>): RouteFn {
  return async (req, routeCtx) => {
    const started = Date.now();
    const requestId = req.headers.get('x-request-id')?.slice(0, 64) || randomUUID();
    const path = new URL(req.url).pathname;
    let status = 500;
    try {
      assertSameOrigin(req);
      const auth = await resolveAuth();
      const ip = clientIp(req);
      const base = {
        req,
        requestId,
        ipHash: ip ? hmac('ip', ip).slice(0, 32) : null,
        userAgent: req.headers.get('user-agent'),
        params: (spec.params ? spec.params.parse(await routeCtx.params) : undefined) as P,
        query: (spec.query ? spec.query.parse(Object.fromEntries(new URL(req.url).searchParams)) : undefined) as Q,
        body: (spec.body ? await readBody(req, spec.body) : undefined) as B,
      };
      const result = await handler({ ...base, ...auth });

      if (result instanceof Response) {
        status = result.status;
        result.headers.set('X-Request-Id', requestId);
        return result;
      }
      status = result === undefined ? 204 : 200;
      const headers: Record<string, string> = { 'X-Request-Id': requestId, 'Cache-Control': req.method === 'GET' && spec.cache ? spec.cache : 'private, no-store' };
      return result === undefined ? new NextResponse(null, { status, headers }) : NextResponse.json(result, { status, headers });
    } catch (e) {
      const mapped = toErrorResponse(e, requestId);
      status = mapped.status;
      return mapped;
    } finally {
      log.info('http', { requestId, method: req.method, path, status, ms: Date.now() - started });
    }
  };
}

/** A route anyone can call. */
export function publicRoute<B = undefined, Q = undefined, P = Record<string, string>>(spec: Spec<B, Q, P>, handler: (c: RouteBase<B, Q, P>) => Promise<unknown>): RouteFn {
  return build(spec, async () => ({}), handler);
}

/** A route for the signed-in customer. The handler gets `customer`. */
export function customerRoute<B = undefined, Q = undefined, P = Record<string, string>>(spec: Spec<B, Q, P>, handler: (c: RouteBase<B, Q, P> & { customer: CustomerSession }) => Promise<unknown>): RouteFn {
  return build(spec, async () => ({ customer: await requireCustomer() }), handler);
}

/** A route for signed-in staff. With `permission`, only roles that have it get in. The handler gets `staff`. */
export function staffRoute<B = undefined, Q = undefined, P = Record<string, string>>(
  spec: Spec<B, Q, P> & { permission?: Permission },
  handler: (c: RouteBase<B, Q, P> & { staff: StaffSession }) => Promise<unknown>,
): RouteFn {
  return build(spec, async () => ({ staff: await requireStaff(spec.permission) }), handler);
}

export const created = (data: unknown) => NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });

function toErrorResponse(e: unknown, requestId: string): NextResponse<ApiErrorBody> {
  const respond = (status: number, code: ApiErrorBody['error']['code'], message: string, details?: unknown, retryAfter?: number) => {
    const headers: Record<string, string> = { 'X-Request-Id': requestId, 'Cache-Control': 'private, no-store' };
    if (retryAfter) headers['Retry-After'] = String(retryAfter);
    return NextResponse.json<ApiErrorBody>({ error: { code, message, ...(details !== undefined ? { details } : {}) }, requestId }, { status, headers });
  };

  if (e instanceof AppError) return respond(e.status, e.code, e.message, e.details, e.retryAfter);
  if (e instanceof ZodError) {
    // Say which fields are wrong and why, never what was typed in them.
    return respond(400, 'VALIDATION', 'The request is not valid', { issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return respond(409, 'CONFLICT', 'That already exists');
    if (e.code === 'P2025') return respond(404, 'NOT_FOUND', 'Not found');
    if (e.code === 'P2034') return respond(409, 'CONFLICT', 'Something else changed at the same moment. Try again');
  }
  log.error('http.unhandled', { requestId, ...errorFields(e) });
  return respond(500, 'INTERNAL', 'Something went wrong on our side');
}
