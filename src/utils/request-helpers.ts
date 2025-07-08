import { Context } from "hono";

// Function to check if request is from allowed origin
export function is_authorized_origin(c: Context): boolean {
	const referer = c.req.header("referer");
	
	// Allow direct access (no referer) and development mode
	if (!referer || process.env.NODE_ENV !== "production") {
		return true;
	}
	
	// Check allowed origins from environment
	const allowed_origins = process.env.ALLOWED_ORIGINS?.split(",") || [];
	return allowed_origins.some((origin) => referer.startsWith(origin.trim()));
}

// Enhanced logging function
export function log_request(
	c: Context,
	cache_status: string,
	response_time: number,
	cache_key: string,
	authorized: boolean
) {
	const client_ip =
		c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
	const user_agent = c.req.header("user-agent") || "unknown";
	const referer = c.req.header("referer") || "direct";
	const auth_status = authorized ? "✅ AUTHORIZED" : "❌ UNAUTHORIZED";

	console.log(
		`📊 ${cache_status} | ${response_time}ms | ${auth_status} | ${client_ip} | ${referer} | ${user_agent.substring(
			0,
			100
		)}`
	);

	// Log potential abuse patterns
	if (!authorized) {
		console.log(
			`🚨 POTENTIAL ABUSE: ${client_ip} | ${referer} | ${user_agent.substring(
				0,
				50
			)}`
		);
	}
}

// Function to decode HTML entities in query parameters
export function decode_html_entities(query: Record<string, string | undefined>): Record<string, string | undefined> {
	const decoded: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(query)) {
		if (typeof value === "string") {
			decoded[key] = value
				.replace(/&amp;/g, "&")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'");
		} else {
			decoded[key] = value;
		}
	}
	return decoded;
}