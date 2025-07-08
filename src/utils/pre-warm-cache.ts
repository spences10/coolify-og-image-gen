import { cache_image, get_cached_image } from "./cache-manager";
import { image_generator } from "./image-generator";
import { template_renderer } from "./template-renderer";

// Pre-warm cache with popular posts
export async function pre_warm_cache() {
	try {
		console.log("🔥 Pre-warming cache with popular posts...");

		// Fetch popular posts from scottspence.com
		const response = await fetch(
			"https://scottspence.com/api/fetch-popular-posts"
		);
		if (!response.ok) {
			console.log("❌ Failed to fetch popular posts, skipping pre-warm");
			return;
		}

		const popular_posts = (await response.json()) as {
			daily?: any[];
			monthly?: any[];
			yearly?: any[];
		};
		const all_posts = [
			...(popular_posts.daily || []).slice(0, 5),
			...(popular_posts.monthly || []).slice(0, 5),
			...(popular_posts.yearly || []).slice(0, 5),
		];

		// Convert popular posts to OG image params
		const images_to_warm = all_posts.map((post: any) => ({
			title: post.title,
			author: "Scott Spence",
			website: "scottspence.com",
			theme: "light" as const,
		}));

		const template_renderer_instance = new template_renderer();
		const image_generator_instance = new image_generator();

		for (const params of images_to_warm) {
			const cache_key = `${params.title}-${params.author}-${params.website}-${params.theme}`;
			const cached = await get_cached_image(cache_key);
			if (cached) {
				console.log(`✅ Pre-warmed (${cached.source}): ${params.title}`);
			} else {
				// Generate and cache the image if it doesn't exist
				try {
					const html_content = template_renderer_instance.render_template(
						"default",
						{
							title: params.title,
							author: params.author,
							website: params.website,
							theme: params.theme,
						}
					);
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
					await cache_image(cache_key, image_buffer, true);
					console.log(`🔥 Generated and cached: ${params.title}`);
				} catch (error) {
					console.error(`❌ Failed to pre-warm ${params.title}:`, error);
				}
			}
		}

		console.log(`🔥 Pre-warmed ${images_to_warm.length} images`);
	} catch (error) {
		console.error("❌ Error pre-warming cache:", error);
	}
}
