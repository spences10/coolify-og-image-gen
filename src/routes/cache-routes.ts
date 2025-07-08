import { Context, Hono } from "hono";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { ram_cache, CACHE_DIR, MAX_RAM_CACHE_SIZE } from "../utils/cache-manager";

const cache_routes = new Hono();

// Auth middleware for cache management
const require_auth = async (c: Context, next: Function) => {
	const token = c.req.header("Authorization");
	if (!token || token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	return await next();
};

// Clear all caches
cache_routes.delete("/", require_auth, async (c: Context) => {
	const ram_cleared = ram_cache.size;
	ram_cache.clear();

	// Clear disk cache
	let disk_cleared = 0;
	try {
		const files = await fs.readdir(CACHE_DIR);
		const image_files = files.filter((f) => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg"));
		await Promise.all(image_files.map((f) => fs.unlink(join(CACHE_DIR, f))));
		disk_cleared = image_files.length;
	} catch (error) {
		console.error("Error clearing disk cache:", error);
	}

	return c.json({
		message: "Cache cleared successfully",
		ram_cleared_entries: ram_cleared,
		disk_cleared_entries: disk_cleared,
	});
});

// Delete specific cache entry
cache_routes.delete("/:key", require_auth, async (c: Context) => {
	const key = c.req.param("key");
	const decoded_key = decodeURIComponent(key);

	// Delete from RAM
	const ram_deleted = ram_cache.delete(decoded_key);

	// Delete from disk
	let disk_deleted = false;
	try {
		const file_path = join(
			CACHE_DIR,
			`${decoded_key.replace(/[^a-zA-Z0-9\-_]/g, "_")}.jpg`
		);
		await fs.unlink(file_path);
		disk_deleted = true;
	} catch {
		// Try PNG format
		try {
			const file_path = join(
				CACHE_DIR,
				`${decoded_key.replace(/[^a-zA-Z0-9\-_]/g, "_")}.png`
			);
			await fs.unlink(file_path);
			disk_deleted = true;
		} catch {
			// File might not exist
		}
	}

	return c.json({
		message:
			ram_deleted || disk_deleted
				? "Cache entry deleted"
				: "Cache entry not found",
		key: key,
		ram_deleted,
		disk_deleted,
	});
});

// View cache status
cache_routes.get("/", async (c: Context) => {
	const ram_entries = Array.from(ram_cache.keys());

	// Get disk entries
	let disk_entries: string[] = [];
	try {
		const files = await fs.readdir(CACHE_DIR);
		disk_entries = files
			.filter((f) => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg"))
			.map((f) => f.replace(/\.(png|jpg|jpeg)$/, ""));
	} catch {
		// Directory might not exist yet
	}

	return c.json({
		ram_cache: {
			entries: ram_entries.length,
			max_size: MAX_RAM_CACHE_SIZE,
			keys: ram_entries,
		},
		disk_cache: {
			entries: disk_entries.length,
			keys: disk_entries,
		},
	});
});

export { cache_routes };