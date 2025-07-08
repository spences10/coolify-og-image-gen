import { Context } from "hono";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export let ratelimit: Ratelimit | null = null;

// Initialize rate limiting
export function setup_rate_limiting() {
	if (process.env.NODE_ENV === "production" && process.env.UPSTASH_REDIS_REST_URL) {
		const redis = new Redis({
			url: process.env.UPSTASH_REDIS_REST_URL,
			token: process.env.UPSTASH_REDIS_REST_TOKEN,
		});

		ratelimit = new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(
				Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 60,
				`${Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000}ms`
			),
			analytics: true,
			prefix: "og-image-gen",
		});
	}
}

// Rate limit middleware for Upstash Redis
export async function upstash_rate_limit_middleware(c: Context, next: Function) {
	if (!ratelimit) {
		return next();
	}

	const client_ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
	const { success, limit, remaining, reset } = await ratelimit.limit(client_ip);

	if (!success) {
		return c.json(
			{
				error: "Too many requests",
				limit,
				remaining,
				reset,
				retry_after: Math.ceil((reset - Date.now()) / 1000),
			},
			429
		);
	}

	return next();
}

// Fallback in-memory rate limiting
const request_counts = new Map<string, { count: number; reset_time: number }>();

export async function fallback_rate_limit_middleware(c: Context, next: Function) {
	const client_ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
	const now = Date.now();
	const window_ms = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
	const max_requests = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 60;

	const client_data = request_counts.get(client_ip);

	if (!client_data || now > client_data.reset_time) {
		request_counts.set(client_ip, { count: 1, reset_time: now + window_ms });
		return next();
	}

	if (client_data.count >= max_requests) {
		return c.json(
			{
				error: "Too many requests",
				retry_after: Math.ceil((client_data.reset_time - now) / 1000),
			},
			429
		);
	}

	client_data.count++;
	return next();
}