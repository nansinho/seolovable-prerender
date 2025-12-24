const isbot = require('isbot');
// URL of your Prerender Server (Deploy this first!)
const PRERENDER_SERVICE_URL = 'https://prerender.seolovable.cloud/render'; // Replace with your actual deployed URL

/**
 * Express Middleware to Detect Bots and Redirect to Prerender Server
 */
module.exports = function prerenderMiddleware(req, res, next) {
    const userAgent = req.headers['user-agent'];

    // 1. Check if it's a bot
    if (isbot(userAgent)) {
        console.log(`[BOT DETECTED] ${userAgent} -> Prerendering...`);

        // Construct the full URL being requested
        const protocol = req.protocol;
        const host = req.get('host');
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;

        // 2. Proxy the request to your Prerender Server
        const renderUrl = `${PRERENDER_SERVICE_URL}?url=${encodeURIComponent(fullUrl)}`;

        fetch(renderUrl)
            .then(response => response.text())
            .then(html => {
                res.send(html);
            })
            .catch(err => {
                console.error('Prerender error:', err);
                next(); // Fallback to normal serving if prerender fails
            });

        return;
    }

    // 3. If not a bot, continue normally
    next();
};
