import argparse
import asyncio
import json
import sys
import traceback
from importlib.metadata import version as package_version
from pathlib import Path


RETRYABLE_ERROR_NAMES = {"NoAudioReceived", "TimeoutError", "ConnectionResetError"}
RETRYABLE_ERROR_MARKERS = ("No audio was received", "timed out", "server disconnected", "WebSocket")
MAX_ATTEMPTS = 1
DEFAULT_TIMEOUT_SECONDS = 45


def emit(payload: dict) -> None:
    sys.stdout.buffer.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()


def write_error_log(log_file: str, error: BaseException) -> None:
    if not log_file:
        return
    path = Path(log_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write("\n" + "=" * 80 + "\n")
        handle.write(traceback.format_exc())


def is_retryable_error(error: Exception) -> bool:
    name = error.__class__.__name__
    message = str(error).lower()
    return name in RETRYABLE_ERROR_NAMES or any(marker.lower() in message for marker in RETRYABLE_ERROR_MARKERS)


def clean_text_for_edge_tts(text: str) -> str:
    # Edge TTS can fail on invisible control characters copied from rich text.
    invisible = {"\ufeff", "\u200b", "\u200c", "\u200d", "\u2060"}
    normalized = text.replace("\u00a0", " ")
    return "".join(ch for ch in normalized if ch not in invisible and (ch in "\n\t" or ord(ch) >= 32)).strip()


async def main() -> int:
    parser = argparse.ArgumentParser(description="Generate speech audio with edge-tts.")
    parser.add_argument("--text-file", default="")
    parser.add_argument("--output", default="")
    parser.add_argument("--voice", default="zh-CN-XiaoxiaoNeural")
    parser.add_argument("--rate", default="+0%")
    parser.add_argument("--volume", default="+0%")
    parser.add_argument("--pitch", default="+0Hz")
    parser.add_argument("--subtitles", default="")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--log-file", default="")
    parser.add_argument("--list-voices", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    try:
        import edge_tts
    except ModuleNotFoundError:
        emit({"ok": False, "code": "EDGE_TTS_NOT_INSTALLED", "message": "未安装 edge-tts。"})
        return 20


    if args.check:
        emit({"ok": True, "version": package_version("edge-tts")})
        return 0

    if args.list_voices:
        try:
            voices = await asyncio.wait_for(edge_tts.list_voices(), timeout=args.timeout)
            emit({"ok": True, "version": package_version("edge-tts"), "voices": voices})
            return 0
        except Exception as error:
            write_error_log(args.log_file, error)
            emit({
                "ok": False,
                "code": "VOICE_LIST_FAILED",
                "errorType": error.__class__.__name__,
                "message": "无法读取 Edge TTS 音色列表。",
            })
            return 23

    if not args.text_file or not args.output:
        emit({"ok": False, "code": "INVALID_ARGUMENTS", "message": "缺少文本文件或输出文件参数。"})
        return 24

    text = clean_text_for_edge_tts(Path(args.text_file).read_text(encoding="utf-8"))
    if not text:
        emit({"ok": False, "code": "EMPTY_TEXT", "message": "文本为空，无法生成配音。"})
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
                emit({"ok": True, "output": str(output), "size": output.stat().st_size})
                return 0
            raise RuntimeError("Edge TTS returned an empty audio file.")
        except Exception as error:
            write_error_log(args.log_file, error)
            if attempt >= MAX_ATTEMPTS or not is_retryable_error(error):
                emit({
                    "ok": False,
                    "code": "NO_AUDIO_RECEIVED" if error.__class__.__name__ == "NoAudioReceived" else "EDGE_TTS_FAILED",
                    "errorType": error.__class__.__name__,
                    "message": "Edge TTS 没有返回音频。" if error.__class__.__name__ == "NoAudioReceived" else "Edge TTS 生成失败。",
                    "retryable": is_retryable_error(error),
                    "details": {
                        "voice": args.voice,
                        "rate": args.rate,
                        "volume": args.volume,
                        "pitch": args.pitch,
                        "textChars": len(text),
                    },
                })
                return 22
            await asyncio.sleep(0.8 * attempt)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
