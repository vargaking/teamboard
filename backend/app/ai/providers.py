"""Thin provider layer over the Anthropic and OpenAI SDKs.

Two operations are needed by the app: free-form text and JSON that matches a schema. Structured output uses
each vendor's native mechanism (a forced tool call on Anthropic, `json_schema` response format on OpenAI)
so we never have to parse JSON out of prose.
"""

import json
from dataclasses import dataclass
from typing import Any, Literal

import anthropic
import openai

Provider = Literal["anthropic", "openai"]
PROVIDERS: tuple[Provider, ...] = ("anthropic", "openai")

DEFAULT_MAX_TOKENS = 4096
TIMEOUT_SECONDS = 90.0


class AIProviderError(Exception):
    """A failure talking to the provider; `message` is safe to show to the user."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass(frozen=True)
class Credentials:
    provider: Provider
    api_key: str
    model: str


@dataclass(frozen=True)
class ModelInfo:
    id: str
    label: str


def _wrap(exc: Exception) -> AIProviderError:
    if isinstance(exc, (anthropic.APIStatusError, openai.APIStatusError)):
        detail = _status_detail(exc)
        return AIProviderError(f"{exc.__class__.__name__.replace('Error', '')} ({exc.status_code}): {detail}", exc.status_code)
    if isinstance(exc, (anthropic.APIConnectionError, openai.APIConnectionError)):
        return AIProviderError("Could not reach the AI provider. Check your network and try again.")
    return AIProviderError(f"AI provider error: {exc}")


def _status_detail(exc: anthropic.APIStatusError | openai.APIStatusError) -> str:
    body: Any = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and isinstance(err.get("message"), str):
            return err["message"]
        if isinstance(body.get("message"), str):
            return body["message"]
    return str(exc.message) if getattr(exc, "message", None) else str(exc)


def _is_chat_model(model_id: str) -> bool:
    """Filter the OpenAI model list down to things that can answer a chat completion."""
    banned = (
        "embedding",
        "whisper",
        "tts",
        "dall-e",
        "moderation",
        "transcribe",
        "realtime",
        "audio",
        "image",
        "babbage",
        "davinci",
        "search",
    )
    lowered = model_id.lower()
    return not any(b in lowered for b in banned)


async def list_models(provider: Provider, api_key: str) -> list[ModelInfo]:
    try:
        if provider == "anthropic":
            client = anthropic.AsyncAnthropic(api_key=api_key, timeout=TIMEOUT_SECONDS)
            page = await client.models.list(limit=100)
            return [ModelInfo(id=m.id, label=getattr(m, "display_name", None) or m.id) for m in page.data]
        client = openai.AsyncOpenAI(api_key=api_key, timeout=TIMEOUT_SECONDS)
        page = await client.models.list()
        models = sorted((m.id for m in page.data if _is_chat_model(m.id)), key=str.lower)
        return [ModelInfo(id=m, label=m) for m in models]
    except Exception as exc:  # noqa: BLE001 - every SDK error is translated for the user
        raise _wrap(exc) from exc


async def complete_text(creds: Credentials, system: str, messages: list[dict[str, str]], max_tokens: int = DEFAULT_MAX_TOKENS) -> str:
    """messages: [{"role": "user"|"assistant", "content": str}, ...], last one must be "user"."""
    try:
        if creds.provider == "anthropic":
            client = anthropic.AsyncAnthropic(api_key=creds.api_key, timeout=TIMEOUT_SECONDS)
            response = await client.messages.create(
                model=creds.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": m["role"], "content": m["content"]} for m in messages],  # type: ignore[misc]
            )
            return "".join(block.text for block in response.content if getattr(block, "type", "") == "text").strip()
        client = openai.AsyncOpenAI(api_key=creds.api_key, timeout=TIMEOUT_SECONDS)
        chat = await client.chat.completions.create(
            model=creds.model,
            max_completion_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, *[{"role": m["role"], "content": m["content"]} for m in messages]],  # type: ignore[list-item]
        )
        content = chat.choices[0].message.content if chat.choices else None
        return (content or "").strip()
    except Exception as exc:  # noqa: BLE001
        raise _wrap(exc) from exc


async def complete_json(
    creds: Credentials,
    system: str,
    user: str,
    schema: dict[str, Any],
    schema_name: str,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> dict[str, Any]:
    """Return a dict matching `schema` (a JSON schema with type=object)."""
    try:
        if creds.provider == "anthropic":
            client = anthropic.AsyncAnthropic(api_key=creds.api_key, timeout=TIMEOUT_SECONDS)
            response = await client.messages.create(
                model=creds.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                tools=[{"name": schema_name, "description": "Record the answer.", "input_schema": schema}],
                tool_choice={"type": "tool", "name": schema_name},
            )
            for block in response.content:
                if getattr(block, "type", "") == "tool_use" and isinstance(block.input, dict):  # type: ignore[union-attr]
                    return block.input  # type: ignore[union-attr]
            raise AIProviderError("The model did not return structured output.")
        client = openai.AsyncOpenAI(api_key=creds.api_key, timeout=TIMEOUT_SECONDS)
        chat = await client.chat.completions.create(
            model=creds.model,
            max_completion_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_schema", "json_schema": {"name": schema_name, "schema": schema}},
        )
        content = chat.choices[0].message.content if chat.choices else None
        if not content:
            raise AIProviderError("The model returned an empty response.")
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            raise AIProviderError("The model returned malformed structured output.")
        return parsed
    except AIProviderError:
        raise
    except json.JSONDecodeError as exc:
        raise AIProviderError("The model returned malformed JSON.") from exc
    except Exception as exc:  # noqa: BLE001
        raise _wrap(exc) from exc
