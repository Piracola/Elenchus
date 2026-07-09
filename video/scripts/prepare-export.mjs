import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { buildVideoScript } from "../src/videoScript.ts";

const sourceArg = process.argv[2];

if (!sourceArg) {
  console.error("用法：npm run prepare -- <Elenchus 导出 JSON 路径>");
  process.exit(1);
}

const sourcePath = resolve(process.cwd(), sourceArg);
const raw = readFileSync(sourcePath, "utf8");
let parsed;

try {
  parsed = JSON.parse(raw);
} catch (error) {
  console.error(`无法解析 JSON：${sourcePath}`);
  console.error(error);
  process.exit(1);
}

if (!Array.isArray(parsed.dialogue_history)) {
  console.error("这个文件看起来不像 Elenchus 导出 JSON：缺少 dialogue_history 数组。");
  process.exit(1);
}

const SOPHISTRY_ROLES = new Set(["sophistry_round_report", "sophistry_final_report"]);
const hasSophistry = parsed.dialogue_history.some((entry) => SOPHISTRY_ROLES.has(String(entry?.role || "")));
if (hasSophistry) {
  console.warn("警告：当前导出来自诡辩实验模式，观察员报告不会出现在视频中。视频生成器当前仅支持标准辩论模式。");
}

mkdirSync("public/data", { recursive: true });
copyFileSync(sourcePath, "public/data/session-export.json");
const script = buildVideoScript(parsed, "standard");
writeFileSync("public/data/video-script.json", `${JSON.stringify(script, null, 2)}\n`, "utf8");

writeFileSync(
  "public/data/render-props.json",
  `${JSON.stringify(
    {
      dataFile: "data/session-export.json",
      scriptFile: "data/video-script.json",
      textPreset: "standard",
      sourceName: basename(sourcePath),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`已复制导出文件：${sourcePath}`);
console.log("视频数据入口：public/data/session-export.json");
console.log(`视频脚本切分：${script.rounds.length} 轮，${script.rounds.reduce((sum, round) => sum + round.speakerSegments.length, 0)} 个辩手片段`);
