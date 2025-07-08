#!/usr/bin/env node

/**
 * OG Image Monitoring Script
 * Tests OG image generation for popular posts and various scenarios
 */

const https = require("https");
const http = require("http");

// Configuration
const OG_SERVICE_URL = "https://og.scott.garden";
const POPULAR_POSTS_API = "https://scottspence.com/api/fetch-popular-posts";

// Test user agents
const USER_AGENTS = {
	googlebot: "Googlebot/2.1 (+http://www.google.com/bot.html)",
	facebook:
		"facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
	twitter: "Twitterbot/1.0",
	linkedin:
		"LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com/)",
	discord: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
	slack: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
	opengraph: "OpenGraphBot/1.0",
	orcascan: "OrcaScan/1.0",
};

// Colors for console output
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
};

function log(message, color = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function make_request(url, userAgent = "") {
	return new Promise((resolve, reject) => {
		const start_time = Date.now();
		const protocol = url.startsWith("https:") ? https : http;

		const options = {
			headers: {
				"User-Agent": userAgent || "OG-Monitor/1.0",
			},
		};

		const req = protocol.get(url, options, (res) => {
			let data = "";
			res.on("data", (chunk) => (data += chunk));
			res.on("end", () => {
				const end_time = Date.now();
				resolve({
					statusCode: res.statusCode,
					headers: res.headers,
					body: data,
					responseTime: end_time - start_time,
					size: Buffer.byteLength(data),
				});
			});
		});

		req.on("error", reject);
		req.setTimeout(10000, () => {
			req.destroy();
			reject(new Error("Request timeout"));
		});
	});
}

async function fetch_popular_posts() {
	try {
		log("📊 Fetching popular posts...", "blue");
		const response = await make_request(POPULAR_POSTS_API);

		if (response.statusCode !== 200) {
			throw new Error(`Failed to fetch popular posts: ${response.statusCode}`);
		}

		const data = JSON.parse(response.body);
		const allPosts = [
			...(data.daily || []).slice(0, 3),
			...(data.monthly || []).slice(0, 3),
			...(data.yearly || []).slice(0, 5),
		];

		// Remove duplicates
		const unique_posts = allPosts.filter(
			(post, index, self) =>
				index === self.findIndex((p) => p.title === post.title)
		);

		log(`✅ Found ${unique_posts.length} unique popular posts`, "green");
		return unique_posts;
	} catch (error) {
		log(`❌ Error fetching popular posts: ${error.message}`, "red");
		return [];
	}
}

async function test_og_image(
	title,
	author = "Scott Spence",
	website = "scottspence.com",
	userAgent = ""
) {
	const encoded_title = encodeURIComponent(title);
	const encoded_author = encodeURIComponent(author);
	const encoded_website = encodeURIComponent(website);

	const url = `${OG_SERVICE_URL}/og?title=${encoded_title}&author=${encoded_author}&website=${encoded_website}`;

	try {
		const response = await make_request(url, userAgent);

		return {
			title: title.substring(0, 50) + (title.length > 50 ? "..." : ""),
			status: response.statusCode,
			responseTime: response.responseTime,
			size: response.size,
			contentType: response.headers["content-type"],
			cacheStatus: response.headers["x-cache-status"],
			authorized: response.headers["x-authorized"],
			success: response.statusCode === 200 && response.size > 10000, // At least 10KB
		};
	} catch (error) {
		return {
			title: title.substring(0, 50) + (title.length > 50 ? "..." : ""),
			status: "ERROR",
			responseTime: 0,
			size: 0,
			contentType: "N/A",
			cacheStatus: "N/A",
			authorized: "N/A",
			success: false,
			error: error.message,
		};
	}
}

async function test_user_agents(posts) {
	log("\n🤖 Testing different user agents...", "cyan");
	log("=".repeat(80), "cyan");

	const test_post = posts[0] || { title: "Test Post" };
	const results = {};

	for (const [name, userAgent] of Object.entries(USER_AGENTS)) {
		const result = await test_og_image(
			test_post.title,
			"Scott Spence",
			"scottspence.com",
			userAgent
		);
		results[name] = result;

		const status_color = result.success ? "green" : "red";
		const size_kb = Math.round(result.size / 1024);

		log(
			`${name.padEnd(12)} | ${result.status
				.toString()
				.padEnd(6)} | ${result.responseTime.toString().padEnd(6)}ms | ${size_kb
				.toString()
				.padEnd(4)}KB | ${result.cacheStatus}`,
			status_color
		);
	}

	return results;
}

async function test_popular_posts(posts) {
	log("\n📈 Testing popular posts...", "magenta");
	log("=".repeat(80), "magenta");

	const results = [];

	for (const post of posts.slice(0, 10)) {
		// Test top 10
		const result = await test_og_image(post.title);
		results.push(result);

		const status_color = result.success ? "green" : "red";
		const size_kb = Math.round(result.size / 1024);

		log(
			`${result.title.padEnd(52)} | ${result.status
				.toString()
				.padEnd(6)} | ${result.responseTime.toString().padEnd(6)}ms | ${size_kb
				.toString()
				.padEnd(4)}KB`,
			status_color
		);
	}

	return results;
}

async function test_edge_cases() {
	log("\n🧪 Testing edge cases...", "yellow");
	log("=".repeat(80), "yellow");

	const edge_cases = [
		'Test with "quotes" and special chars!',
		"Very Very Very Very Very Very Very Very Very Very Very Very Very Long Title That Exceeds Normal Length",
		"HTML &amp; Entities &lt;test&gt;",
		"Emoji Test 🚀 🎉 ✨",
		"Special chars: @#$%^&*()[]{}|;:,.<>?",
	];

	const results = [];

	for (const title of edge_cases) {
		const result = await test_og_image(title);
		results.push(result);

		const status_color = result.success ? "green" : "red";
		const size_kb = Math.round(result.size / 1024);

		log(
			`${result.title.padEnd(52)} | ${result.status
				.toString()
				.padEnd(6)} | ${result.responseTime.toString().padEnd(6)}ms | ${size_kb
				.toString()
				.padEnd(4)}KB`,
			status_color
		);
	}

	return results;
}

async function generate_report(
	userAgentResults,
	popularResults,
	edgeCaseResults
) {
	log("\n📋 SUMMARY REPORT", "bright");
	log("=".repeat(80), "bright");

	// User agent analysis
	const user_agent_success = Object.values(userAgentResults).filter(
		(r) => r.success
	).length;
	const user_agent_total = Object.keys(userAgentResults).length;

	log(
		`\n🤖 User Agent Compatibility: ${user_agent_success}/${user_agent_total} (${Math.round(
			(user_agent_success / user_agent_total) * 100
		)}%)`,
		user_agent_success === user_agent_total ? "green" : "yellow"
	);

	// Popular posts analysis
	const popular_success = popularResults.filter((r) => r.success).length;
	const popular_total = popularResults.length;

	log(
		`📈 Popular Posts Success: ${popular_success}/${popular_total} (${Math.round(
			(popular_success / popular_total) * 100
		)}%)`,
		popular_success === popular_total ? "green" : "yellow"
	);

	// Edge cases analysis
	const edge_success = edgeCaseResults.filter((r) => r.success).length;
	const edge_total = edgeCaseResults.length;

	log(
		`🧪 Edge Cases Success: ${edge_success}/${edge_total} (${Math.round(
			(edge_success / edge_total) * 100
		)}%)`,
		edge_success === edge_total ? "green" : "yellow"
	);

	// Performance analysis
	const all_results = [...popularResults, ...edgeCaseResults];
	const avg_response_time =
		all_results.reduce((sum, r) => sum + r.responseTime, 0) /
		all_results.length;
	const avg_size =
		all_results.reduce((sum, r) => sum + r.size, 0) / all_results.length;

	log(
		`\n⚡ Average Response Time: ${Math.round(avg_response_time)}ms`,
		avg_response_time < 1000 ? "green" : "yellow"
	);
	log(
		`📦 Average File Size: ${Math.round(avg_size / 1024)}KB`,
		avg_size < 100000 ? "green" : "yellow"
	);

	// Issues found
	const failed_results = all_results.filter((r) => !r.success);
	if (failed_results.length > 0) {
		log(`\n⚠️  Issues Found:`, "red");
		failed_results.forEach((result) => {
			log(
				`   - ${result.title}: ${result.error || "Failed generation"}`,
				"red"
			);
		});
	}

	// Recommendations
	log(`\n💡 Recommendations:`, "cyan");
	if (avg_response_time > 1000) {
		log(
			`   - Response time is slow (${Math.round(
				avg_response_time
			)}ms). Consider optimizing.`,
			"yellow"
		);
	}
	if (avg_size > 100000) {
		log(
			`   - File size is large (${Math.round(
				avg_size / 1024
			)}KB). Consider further compression.`,
			"yellow"
		);
	}
	if (user_agent_success < user_agent_total) {
		log(`   - Some user agents failing. Check CORS and headers.`, "yellow");
	}
	if (
		failed_results.length === 0 &&
		avg_response_time < 1000 &&
		avg_size < 100000
	) {
		log(`   - All systems operating optimally! 🎉`, "green");
	}
}

async function main() {
	log("🖼️  OG Image Monitoring Script", "bright");
	log("=".repeat(80), "bright");
	log(`Testing service: ${OG_SERVICE_URL}`, "blue");

	try {
		// Fetch popular posts
		const posts = await fetch_popular_posts();

		// Run tests
		const user_agent_results = await test_user_agents(posts);
		const popular_results = await test_popular_posts(posts);
		const edge_case_results = await test_edge_cases();

		// Generate report
		await generate_report(
			user_agent_results,
			popular_results,
			edge_case_results
		);
	} catch (error) {
		log(`❌ Script failed: ${error.message}`, "red");
		process.exit(1);
	}
}

// Run the script
if (require.main === module) {
	main();
}

module.exports = {
	testOGImage: test_og_image,
	fetchPopularPosts: fetch_popular_posts,
};
