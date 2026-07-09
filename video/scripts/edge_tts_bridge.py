import argparse
import asyncio
import sys
from pathlib import Path


async def main() -> int:
    parser = argparse.ArgumentParser(description="Generate speech audio with edge-tts.")
    parser.add_argument("--text-file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", default="zh-CN-XiaoxiaoNeural")
    parser.add_argument("--rate", default="+0%")
    parser.add_argument("--volume", default="+0%")
    parser.add_argument("--pitch", default="+0Hz")
    parser.add_argument("--subtitles", default="")
    args = parser.parse_args()

    try:
        import edge_tts
    except ModuleNotFoundError:
        print(
            "未安装 edge-tts。请在 video 目录或任意终端执行：python -m pip install edge-tts",
            file=sys.stderr,
        )
        return 20

    text = Path(args.text_file).read_text(encoding="utf-8").strip()
    if not text:
        print("文本为空，无法生成配音。", file=sys.stderr)
        return 21

    communicate = edge_tts.Communicate(
        text=text,
        voice=args.voice,
        rate=args.rate,
        volume=args.volume,
        pitch=args.pitch,
    )

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.subtitles:
        subtitles = Path(args.subtitles)
        subtitles.parent.mkdir(parents=True, exist_ok=True)
        await communicate.save(str(output), str(subtitles))
    else:
        await communicate.save(str(output))

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
