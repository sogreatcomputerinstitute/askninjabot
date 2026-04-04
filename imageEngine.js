const sharp = require('sharp');

/**
 * Generates a vibrant, gradient-based brand image using Sharp.
 * @param {string} subtitle - The text to display under the main title.
 * @returns {Buffer} - The PNG image buffer.
 */
async function generateBrandImage(subtitle = "Daily Tech News & Post!") {
    const width = 1200;
    const height = 630;

    // --- 1. THE VIBRANT SVG OVERLAY ---
    // We define the gradient and text using SVG for perfect crispness.
    const svgOverlay = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cyberGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#1A0B2E;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#007BFF;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#00F5D4;stop-opacity:1" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="15" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
        </defs>

        <rect width="100%" height="100%" fill="url(#cyberGradient)" />

        <text x="50%" y="45%" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="90" fill="white" filter="url(#glow)">
            ASK NINJA AI
        </text>

        <text x="50%" y="58%" text-anchor="middle" font-family="Arial, sans-serif" font-size="35" fill="rgba(255,255,255,0.8)">
            ${subtitle.toUpperCase()}
        </text>

        <text x="50%" y="92%" text-anchor="middle" font-family="Arial, sans-serif" font-style="italic" font-size="22" fill="#00F5D4">
            NEURAL NETWORK STATUS: OPTIMAL 🟢
        </text>
    </svg>`;

    // --- 2. THE SHARP COMPOSITOR ---
    // Sharp creates a blank canvas and overlays our SVG "Mission Brief."
    return await sharp({
        create: {
            width: width,
            height: height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
    })
    .composite([{
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0
    }])
    .png()
    .toBuffer();
}

module.exports = { generateBrandImage };
