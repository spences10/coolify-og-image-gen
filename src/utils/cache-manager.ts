import { promises as fs } from "node:fs";
import { join } from "node:path";

// Cache configuration
export const CACHE_DIR = join(process.cwd(), "cache");
export const CACHE_TTL = Number(process.env.DEFAULT_CACHE_TTL) || 86400; // 24 hours in seconds
export const HTTP_CACHE_TTL = Number(process.env.HTTP_CACHE_TTL) || 86400; // 24 hours for browsers/CDNs
export const MAX_RAM_CACHE_SIZE = Number(process.env.IMAGE_CACHE_MAX_SIZE) || 100;
export const SHORT_CACHE_TTL = Number(process.env.SHORT_CACHE_TTL) || 300; // 5 minutes for unauthorized requests

// RAM cache (hot - most recently accessed)
export interface RamCacheEntry {
	buffer: Buffer;
	timestamp: number;
	ttl: number; // Time to live in seconds
}

export const ram_cache = new Map<string, RamCacheEntry>();

// Ensure cache directory exists
export async function ensure_cache_dir() {
	try {
		await fs.access(CACHE_DIR);
	} catch {
		await fs.mkdir(CACHE_DIR, { recursive: true });
	}
}

// Cache cleanup function
export function cleanup_cache() {
	const now = Date.now();

	// Clean up RAM cache - remove expired entries based on individual TTL
	for (const [key, entry] of ram_cache.entries()) {
		if (now - entry.timestamp > entry.ttl * 1000) {
			ram_cache.delete(key);
		}
	}

	// If RAM cache still too big, remove oldest entries
	if (ram_cache.size > MAX_RAM_CACHE_SIZE) {
		const entries = Array.from(ram_cache.entries()).sort(
			([, a], [, b]) => a.timestamp - b.timestamp
		);

		const to_remove = entries.slice(0, ram_cache.size - MAX_RAM_CACHE_SIZE);
		for (const [key] of to_remove) {
			ram_cache.delete(key);
		}
	}
}

// Hybrid cache functions
export async function get_from_disk_cache(cache_key: string): Promise<Buffer | null> {
	try {
		// Try JPEG first (new format), then PNG (legacy)
		const base_name = cache_key.replace(/[^a-zA-Z0-9\-_]/g, "_");
		let file_path = join(CACHE_DIR, `${base_name}.jpg`);
		
		// Check if JPEG exists first
		try {
			const stats = await fs.stat(file_path);
			const age = Date.now() - stats.mtime.getTime();
			if (age <= CACHE_TTL * 1000) {
				return await fs.readFile(file_path);
			} else {
				await fs.unlink(file_path).catch(() => {});
			}
		} catch {
			// JPEG doesn't exist, try PNG (legacy)
			file_path = join(CACHE_DIR, `${base_name}.png`);
		}
		
		const stats = await fs.stat(file_path);
		// Check if file is expired
		const age = Date.now() - stats.mtime.getTime();
		if (age > CACHE_TTL * 1000) {
			await fs.unlink(file_path).catch(() => {}); // Clean up expired file
			return null;
		}

		return await fs.readFile(file_path);
	} catch {
		return null;
	}
}

export async function save_to_disk_cache(
	cache_key: string,
	buffer: Buffer
): Promise<void> {
	try {
		const file_path = join(
			CACHE_DIR,
			`${cache_key.replace(/[^a-zA-Z0-9\-_]/g, "_")}.jpg`
		);
		await fs.writeFile(file_path, buffer);
	} catch (error) {
		console.error("Failed to save to disk cache:", error);
	}
}

export async function get_cached_image(
	cache_key: string
): Promise<{ buffer: Buffer; source: "ram" | "disk" } | null> {
	// Check RAM cache first (fastest)
	const ram_entry = ram_cache.get(cache_key);
	if (ram_entry) {
		const age = Date.now() - ram_entry.timestamp;
		if (age < ram_entry.ttl * 1000) {
			return { buffer: ram_entry.buffer, source: "ram" };
		} else {
			ram_cache.delete(cache_key);
		}
	}

	// Check disk cache (warm) - only for authorized requests (longer TTL)
	const disk_buffer = await get_from_disk_cache(cache_key);
	if (disk_buffer) {
		// Promote to RAM cache with standard TTL
		ram_cache.set(cache_key, {
			buffer: disk_buffer,
			timestamp: Date.now(),
			ttl: CACHE_TTL,
		});
		return { buffer: disk_buffer, source: "disk" };
	}

	return null;
}

export async function cache_image(cache_key: string, buffer: Buffer, authorized: boolean = true): Promise<void> {
	const timestamp = Date.now();
	const ttl = authorized ? CACHE_TTL : SHORT_CACHE_TTL;

	// Save to RAM cache with appropriate TTL
	ram_cache.set(cache_key, { buffer, timestamp, ttl });

	// Only save to disk cache if authorized (long-term caching)
	if (authorized) {
		save_to_disk_cache(cache_key, buffer).catch(console.error);
	}
}

// Initialize cache directory and cleanup
ensure_cache_dir().catch(console.error);
setInterval(cleanup_cache, 2 * 60 * 60 * 1000); // Run cache cleanup every 2 hours