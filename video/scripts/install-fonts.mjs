import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "node_modules", "@embedpdf", "fonts-sc", "fonts");
const outputDir = join(rootDir, "public", "fonts");

mkdirSync(outputDir, { recursive: true });
for (const fileName of ["NotoSansHans-Regular.otf", "NotoSansHans-Bold.otf"]) {
  copyFileSync(join(sourceDir, fileName), join(outputDir, fileName));
}

console.log(`Installed bundled Chinese fonts in ${outputDir}`);
