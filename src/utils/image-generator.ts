import { Browser, chromium } from "playwright";
import { image_generation_options } from "../types/og-params";

export class image_generator {
	public async generate_image(
		html_content: string,
		options: image_generation_options = {
			width: 1200,
			height: 630,
			device_scale_factor: 2,
			format: "png",
		}
	): Promise<Buffer> {
		let browser: Browser | null = null;

		try {
			const launch_options: any = {
				headless: true,
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
				],
			};

			console.log("Launching Playwright Chromium browser from image...");
			browser = await chromium.launch(launch_options);
			const page = await browser.newPage();

			try {
				await page.setViewportSize({
					width: options.width,
					height: options.height,
				});

				// Set content and wait for fonts and images to load
				await page.setContent(html_content, {
					waitUntil: "networkidle",
				});

				// Wait a bit more for fonts to render properly
				await new Promise((resolve) => setTimeout(resolve, 1000));

				// Take screenshot
				const screenshot = await page.screenshot({
					type: options.format,
					quality:
						options.format === "jpeg" ? options.quality || 90 : undefined,
					fullPage: false,
					clip: {
						x: 0,
						y: 0,
						width: options.width,
						height: options.height,
					},
				});

				return screenshot;
			} finally {
				await page.close().catch(() => {}); // Ignore close errors
			}
		} finally {
			if (browser) {
				await browser.close().catch(() => {}); // Always close browser
			}
		}
	}

	public async close(): Promise<void> {
		// No longer needed - each request creates its own browser instance
	}

	// Graceful shutdown handler
	public setup_shutdown_handlers(): void {
		const shutdown = async () => {
			console.log("Shutting down image generator...");
			process.exit(0);
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
		process.on("uncaughtException", async (error) => {
			console.error("Uncaught exception:", error);
			process.exit(1);
		});
	}
}
