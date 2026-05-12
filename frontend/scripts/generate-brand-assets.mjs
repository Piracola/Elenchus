import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const sourceIcon = path.join(repoRoot, 'Elenchus.png');
const brandDir = path.join(frontendRoot, 'public', 'brand');

async function generatePng(inputPath, outputPath, size) {
    await sharp(inputPath)
        .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath);
}

async function main() {
    await mkdir(brandDir, { recursive: true });

    const brandPngPath = path.join(brandDir, 'elenchus.png');
    const faviconPath = path.join(brandDir, 'favicon-32x32.png');
    const icon64Path = path.join(brandDir, 'elenchus-64.png');
    const icon128Path = path.join(brandDir, 'elenchus-128.png');
    const appleTouchIconPath = path.join(brandDir, 'apple-touch-icon.png');
    const icon256Path = path.join(brandDir, 'elenchus-256.png');
    const iconIcoPath = path.join(brandDir, 'elenchus.ico');

    await generatePng(sourceIcon, brandPngPath, 512);
    await generatePng(sourceIcon, faviconPath, 32);
    await generatePng(sourceIcon, icon64Path, 64);
    await generatePng(sourceIcon, icon128Path, 128);
    await generatePng(sourceIcon, appleTouchIconPath, 180);
    await generatePng(sourceIcon, icon256Path, 256);

    const icoBuffer = await pngToIco([faviconPath, icon64Path, icon128Path, icon256Path]);
    await writeFile(iconIcoPath, icoBuffer);

    console.log(`Generated brand assets from ${sourceIcon}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
