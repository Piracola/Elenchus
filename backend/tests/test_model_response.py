import json

from app.agents import model_response


def test_extract_text_content_handles_mixed_content_blocks():
    value = [
        {"text": "Hello"},
        {"content": " world"},
        "!",
    ]

    assert model_response.extract_text_content(value) == "Hello world!"


def test_normalize_model_text_unwraps_openai_chat_payload():
    payload = {
        "choices": [
            {
                "message": {
                    "content": "Normalized response",
                }
            }
        ]
    }

    assert model_response.normalize_model_text(json.dumps(payload)) == "Normalized response"
