import argparse
import asyncio
import sys
from pathlib import Path


RETRYABLE_ERROR_NAMES = {"NoAudioReceived", "TimeoutError", "ConnectionResetError"}
RETRYABLE_ERROR_MARKERS = ("No audio was received", "timed out", "server disconnected", "WebSocket")
MAX_ATTEMPTS = 2
DEFAULT_TIMEOUT_SECONDS = 45


def is_retryable_error(error: Exception) -> bool:
    name = error.__class__.__name__
    message = str(error).lower()
    return name in RETRYABLE_ERROR_NAMES or any(marker.lower() in message for marker in RETRYABLE_ERROR_MARKERS)


def clean_text_for_edge_tts(text: str) -> str:
    # Edge TTS can fail on invisible control characters copied from rich text.
    return "".join(ch for ch in text.replace("\ufeff", "") if ch in "\n\t" or ord(ch) >= 32).strip()


async def main() -> int:
    parser = argparse.ArgumentParser(description="Generate speech audio with edge-tts.")
    parser.add_argument("--text-file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", default="zh-CN-XiaoxiaoNeural")
    parser.add_argument("--rate", default="+0%")
    parser.add_argument("--volume", default="+0%")
    parser.add_argument("--pitch", default="+0Hz")
    parser.add_argument("--subtitles", default="")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    args = parser.parse_args()

    try:
        import edge_tts
    except ModuleNotFoundError:
        print(
            "未安装 edge-tts。请在 video 目录或任意终端执行：python -m pip install edge-tts",
            file=sys.stderr,
        )
        return 20

    text = clean_text_for_edge_tts(Path(args.text_file).read_text(encoding="utf-8"))
    if not text:
        print("文本为空，无法生成配音。", file=sys.stderr)
        return 21

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    subtitles = Path(args.subtitles) if args.subtitles else None
    if subtitles:
        subtitles.parent.mkdir(parents=True, exist_ok=True)

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            if output.exists():
                output.unlink()
            if subtitles and subtitles.exists():
                subtitles.unlink()

            communicate = edge_tts.Communicate(
                text=text,
                voice=args.voice,
                rate=args.rate,
                volume=args.volume,
                pitch=args.pitch,
            )

            if subtitles:
                await asyncio.wait_for(communicate.save(str(output), str(subtitles)), timeout=args.timeout)
            else:
                await asyncio.wait_for(communicate.save(str(output)), timeout=args.timeout)

            if output.exists() and output.stat().st_size > 0:
                return 0
            raise RuntimeError("Edge TTS returned an empty audio file.")
        except Exception as error:
            if attempt >= MAX_ATTEMPTS or not is_retryable_error(error):
                print(
                    f"Edge TTS 生成失败。voice={args.voice}，rate={args.rate}，volume={args.volume}，"
                    f"pitch={args.pitch}，text_chars={len(text)}，attempt={attempt}/{MAX_ATTEMPTS}，"
                    f"{error.__class__.__name__}: {error}",
                    file=sys.stderr,
                )
                return 22
            print(
                f"Edge TTS 第 {attempt}/{MAX_ATTEMPTS} 次没有拿到音频，正在重试...",
                file=sys.stderr,
            )
            await asyncio.sleep(0.8 * attempt)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
