const express = require('express');
const puppeteer = require('puppeteer');
const { LRUCache } = require('lru-cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Cache (Store up to 100 pages, expire after 1 hour)
// This prevents crashing the server if too many bots hit at once
const cache = new LRUCache({
    max: 100,
    ttl: 1000 * 60 * 60, // 1 hour
});

// Browser instance
let browser;

async function initBrowser() {
    if (!browser) {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Important for Docker/VPS with limited memory
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined // Use bundled if not specified
        });
    }
    return browser;
}

app.get('/health', (req, res) => {
    res.send('OK');
});

// Main render route
app.get('/render', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).send('Missing "url" query parameter');
    }

    // Check cache first
    const cachedContent = cache.get(url);
    if (cachedContent) {
        console.log(`[CACHE HIT] ${url}`);
        res.setHeader('X-Prerender-Cache', 'HIT');
        return res.send(cachedContent);
    }

    console.log(`[RENDERING] ${url}`);
    let page;
    try {
        const browserInstance = await initBrowser();
        page = await browserInstance.newPage();

        // Optimize page loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            // Abort requests for images, stylesheets, fonts to save bandwidth/time
            // We only need the DOM structure for SEO mostly, but some JS needs CSS specific classes to render.
            // For safety, we block images, media, fonts. We keep scripts and styles.
            if (['image', 'media', 'font'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Set a realistic User Agent so the target site doesn't block us
        await page.setUserAgent('Mozilla/5.0 (compatible; SEOLovableBot/1.0; +https://seolovable.cloud)');

        // Navigate and wait for network idle (meaning the framework finished loading)
        await page.goto(url, {
            waitUntil: 'networkidle2', // Wait until there are no more than 2 network connections for at least 500ms
            timeout: 30000 // 30s timeout
        });

        // Extract HTML
        const html = await page.content();

        // Cache the result
        cache.set(url, html);
        console.log(`[RENDER DONE] ${url}`);

        res.setHeader('X-Prerender-Cache', 'MISS');
        res.send(html);

    } catch (error) {
        console.error(`[ERROR] Failed to render ${url}:`, error);
        res.status(500).send('Failed to render page');
    } finally {
        if (page) await page.close();
    }
});

// Cleanup on exit
async function cleanup() {
    if (browser) await browser.close();
    process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

app.listen(PORT, () => {
    console.log(`Prerender server listening on port ${PORT}`);
    // Pre-launch browser
    initBrowser();
});
