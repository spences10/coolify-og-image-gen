import { Context, Hono } from "hono";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { og_params } from "../types/og-params";
import { image_generator } from "../utils/image-generator";
import { template_renderer } from "../utils/template-renderer";
import { get_cached_image, cache_image, HTTP_CACHE_TTL, SHORT_CACHE_TTL } from "../utils/cache-manager";
import { is_authorized_origin, log_request, decode_html_entities } from "../utils/request-helpers";

const og_routes = new Hono();

const template_renderer_instance = new template_renderer();
const image_generator_instance = new image_generator();

function validate_og_params(query: Record<string, string | undefined>): {
	valid: boolean;
	params?: og_params;
	error?: string;
} {
	const { title, author, website, theme } = query;

	if (!title || typeof title !== "string" || title.trim().length === 0) {
		return {
			valid: false,
			error: "Title is required and must be a non-empty string",
		};
	}

	if (title.length > 200) {
		return { valid: false, error: "Title must be 200 characters or less" };
	}

	if (author && (typeof author !== "string" || author.length > 100)) {
		return {
			valid: false,
			error: "Author must be a string of 100 characters or less",
		};
	}

	if (website && (typeof website !== "string" || website.length > 100)) {
		return {
			valid: false,
			error: "Website must be a string of 100 characters or less",
		};
	}

	if (theme && !["light", "dark"].includes(theme)) {
		return { valid: false, error: 'Theme must be either "light" or "dark"' };
	}

	return {
		valid: true,
		params: {
			title: title.trim(),
			author: author?.trim() || "Anonymous",
			website: website?.trim() || "example.com",
			theme: (theme as "light" | "dark") || "light",
		},
	};
}

// Main OG image generation route
og_routes.get("/", async (c: Context) => {
	const start_time = Date.now();
	try {
		// Get and decode query parameters (handle HTML entities from meta tags)
		const raw_query = c.req.query();
		const query = decode_html_entities(raw_query);

		// Validate parameters
		const validation = validate_og_params(query);
		if (!validation.valid) {
			return c.json({ error: validation.error }, 400);
		}

		const params = validation.params!;

		// Generate cache key
		const cache_key = `${params.title}-${params.author}-${params.website}-${params.theme}`;

		// Check if request is from authorized origin
		const authorized = is_authorized_origin(c);

		// Check hybrid cache (RAM -> Disk -> Generate)
		const cached_result = await get_cached_image(cache_key);

		if (cached_result) {
			// Set cache headers based on authorization
			const cache_ttl = authorized ? HTTP_CACHE_TTL : SHORT_CACHE_TTL;
			c.header(
				"Cache-Control",
				`public, max-age=${cache_ttl}, s-maxage=${cache_ttl}`
			);
			c.header("Content-Type", "image/jpeg");
			c.header("Content-Length", cached_result.buffer.length.toString());
			c.header("X-Cache-Key", cache_key);
			c.header("X-Cache-Status", `HIT-${cached_result.source.toUpperCase()}`);
			c.header("X-Authorized", authorized.toString());
			c.header("ETag", `"${cache_key.replace(/[^a-zA-Z0-9]/g, "")}"`);

			const response_time = Date.now() - start_time;
			log_request(
				c,
				`✅ Cache hit (${cached_result.source})`,
				response_time,
				cache_key,
				authorized
			);
			return c.body(cached_result.buffer);
		}

		// Set cache headers based on authorization
		const cache_ttl = authorized ? HTTP_CACHE_TTL : SHORT_CACHE_TTL;
		c.header(
			"Cache-Control",
			`public, max-age=${cache_ttl}, s-maxage=${cache_ttl}`
		);
		c.header("Content-Type", "image/jpeg");
		c.header("X-Cache-Key", cache_key);
		c.header("X-Cache-Status", "MISS");
		c.header("X-Authorized", authorized.toString());
		c.header("ETag", `"${cache_key.replace(/[^a-zA-Z0-9]/g, "")}"`);
		c.header("Last-Modified", new Date().toUTCString());

		// Render HTML template
		const html_content = template_renderer_instance.render_template("default", {
			title: params.title,
			author: params.author || "Anonymous",
			website: params.website || "example.com",
			theme: params.theme || "light",
		});

		// Generate image
		const image_buffer = await image_generator_instance.generate_image(
			html_content,
			{
				width: 1200,
				height: 630,
				device_scale_factor: 1,
				format: "jpeg",
				quality: 85,
			}
		);

		// Cache the generated image with authorization-based TTL
		await cache_image(cache_key, image_buffer, authorized);

		const response_time = Date.now() - start_time;
		log_request(c, `🔄 Generated fresh`, response_time, cache_key, authorized);
		return c.body(image_buffer);
	} catch (error) {
		console.error("Error generating OG image:", error);
		return c.json(
			{
				error: "Internal server error while generating image",
				message:
					process.env.NODE_ENV === "development"
						? (error as Error).message
						: undefined,
			},
			500
		);
	}
});

// Preview endpoint for testing the design
og_routes.get("/preview", async (c: Context) => {
	try {
		const query = c.req.query();
		const title = query.title || "";
		const author = query.author || "";
		const website = query.website || "";
		const theme = (query.theme as "light" | "dark") || "light";

		// Render HTML template for preview
		const html_content = template_renderer_instance.render_template("default", {
			title,
			author,
			website,
			theme,
		});

		c.header("Content-Type", "text/html; charset=utf-8");
		return c.html(html_content);
	} catch (error) {
		console.error("Error generating preview:", error);
		return c.json({ error: "Could not generate preview" }, 500);
	}
});

export { og_routes };