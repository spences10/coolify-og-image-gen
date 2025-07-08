import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";

// Import our modules
import { ram_cache, MAX_RAM_CACHE_SIZE } from "./utils/cache-manager";
import { setup_rate_limiting, upstash_rate_limit_middleware, fallback_rate_limit_middleware, ratelimit } from "./middleware/rate-limit";
import { pre_warm_cache } from "./utils/pre-warm-cache";
import { og_routes } from "./routes/og-routes";
import { cache_routes } from "./routes/cache-routes";
import { image_generator } from "./utils/image-generator";

const app = new Hono();
const image_generator_instance = new image_generator();

// Setup graceful shutdown
image_generator_instance.setup_shutdown_handlers();

// Initialize rate limiting
setup_rate_limiting();

// Middleware
app.use("*", logger());
app.use("*", secureHeaders());
app.use(
	"*",
	cors({
		origin: "*", // Allow all origins - access control handled via caching strategy
		allowMethods: ["GET"],
		allowHeaders: ["Content-Type"],
	})
);

// Apply rate limiting middleware to OG routes
if (ratelimit) {
	app.use("/og", upstash_rate_limit_middleware);
} else {
	app.use("/og", fallback_rate_limit_middleware);
}

// Routes
app.get("/", async (c: Context) => {
	try {
		const protocol =
			c.req.header("x-forwarded-proto") ||
			(c.req.url.startsWith("https") ? "https" : "http");
		const host = c.req.header("host") || `localhost:3000`;
		const base_url = `${protocol}://${host}`;
		const og_image_url = `${base_url}/og?title=Coolify%20OG%20Image%20Generator&author=Coolify&website=coolify.io&theme=light`;

		const template_path = join(process.cwd(), "src/templates/index.html");
		let html = await fs.readFile(template_path, "utf-8");

		html = html
			.replace(/{{OG_IMAGE_URL}}/g, og_image_url)
			.replace(/{{BASE_URL}}/g, base_url);

		c.header("Content-Type", "text/html; charset=utf-8");
		return c.html(html);
	} catch (error) {
		console.error("Error loading index template:", error);
		return c.json({ error: "Could not load page" }, 500);
	}
});

// Health check endpoint
app.get("/health", (c: Context) => {
	return c.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		service: "og-image-generator",
		cache: {
			ram_entries: ram_cache.size,
			max_ram_size: MAX_RAM_CACHE_SIZE,
		},
	});
});

// Mount route modules
app.route("/og", og_routes);
app.route("/cache", cache_routes);

// Start server
const port = Number(process.env.PORT) || 3000;

serve({
	fetch: app.fetch,
	port: port,
});

console.log(`🚀 OG Image Generator server running on port ${port}`);

// Pre-warm cache after startup
setTimeout(pre_warm_cache, 1000);
console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`🔗 Health check: http://localhost:${port}/health`);
console.log(
	`🖼️  Generate image: http://localhost:${port}/og?title=Hello%20World`
);