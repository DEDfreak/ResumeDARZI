"""
All Gemini API calls — two-pass tailoring logic + JD extraction.
Uses gemini-1.5-flash only (free tier).
"""

import json
import asyncio
import google.generativeai as genai
from typing import AsyncGenerator

from backend.config import get_settings


def get_model():
    settings = get_settings()
    api_key = settings["gemini_api_key"]
    if not api_key:
        raise ValueError("Gemini API key not configured. Set it in Settings or .env file.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-1.5-flash")


async def call_gemini(prompt: str, max_retries: int = 3) -> str:
    """Call Gemini with exponential backoff on rate limit errors."""
    model = get_model()

    for attempt in range(max_retries):
        try:
            response = await asyncio.to_thread(
                model.generate_content, prompt
            )
            return response.text
        except Exception as e:
            error_str = str(e).lower()
            if "rate" in error_str or "quota" in error_str or "429" in error_str:
                wait = 2 ** (attempt + 1)
                await asyncio.sleep(wait)
                if attempt == max_retries - 1:
                    raise RuntimeError(f"Gemini API rate limit exceeded after {max_retries} retries: {e}")
            else:
                raise


async def extract_jd(jd_text: str) -> dict:
    """Use Gemini to extract structured info from a job description."""
    from backend.jd_extractor import build_extraction_prompt, parse_extraction_response

    prompt = build_extraction_prompt(jd_text)
    response = await call_gemini(prompt)
    return parse_extraction_response(response)


async def pass1_tailor(
    parsed_resume: dict,
    jd_signals: dict,
    style_fingerprint: dict,
    banned_words: list[str],
) -> dict:
    """Pass 1: Tailor the resume for the job description."""
    prompt = f"""You are a professional resume editor helping tailor a resume for a specific job.

RULES (non-negotiable):
1. Only rewrite text marked as EDITABLE. Never touch LOCKED fields.
2. Match the candidate's existing writing style exactly: {json.dumps(style_fingerprint)}
3. Integrate these must-have keywords naturally: {json.dumps(jd_signals.get('must_have_keywords', []))}
4. Integrate these nice-to-have keywords where they genuinely fit: {json.dumps(jd_signals.get('nice_to_have_keywords', []))}
5. Every bullet must start with a strong past-tense action verb.
6. Never use these banned words: {json.dumps(banned_words)}
7. Every bullet must be substantial — aim to fill the full line width.
8. Do not invent achievements, metrics, or technologies the candidate didn't have.
9. Only swap or add technologies that are genuinely similar to what's already there.
10. Return the full modified resume JSON with the same structure as the input.

The job is a {jd_signals.get('seniority_level', 'mid-level')} role in {jd_signals.get('domain', 'software engineering')}.
Tech stack mentioned: {json.dumps(jd_signals.get('tech_stack', []))}
Culture signals: {json.dumps(jd_signals.get('culture_signals', []))}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanation. Keep the exact same JSON structure.

Resume JSON:
{json.dumps(parsed_resume, indent=2)}"""

    response = await call_gemini(prompt)
    return _parse_json_response(response, parsed_resume)


async def pass2_critique(
    tailored_resume: dict,
    style_fingerprint: dict,
    banned_words: list[str],
) -> dict:
    """Pass 2: Critique and rewrite AI-sounding bullets."""
    prompt = f"""You are a humanness critic reviewing AI-written resume bullets.

Your job: identify any bullets that sound AI-generated, corporate, or unnatural.

A bullet sounds AI-generated if it:
- Uses vague grandiose language without specifics
- Has awkward keyword stuffing
- Uses any of these banned words: {json.dumps(banned_words)}
- Doesn't match the candidate's natural writing rhythm: {json.dumps(style_fingerprint)}
- Sounds like it's from a LinkedIn influencer, not a working engineer

Review the following resume JSON. For each bullet with status "EDITABLE":
1. If it sounds natural and human, keep it unchanged.
2. If it sounds AI-generated, rewrite it to sound natural in the candidate's voice.

IMPORTANT: Return ONLY the full modified resume JSON. Same structure. No markdown, no explanation.

Resume JSON:
{json.dumps(tailored_resume, indent=2)}"""

    response = await call_gemini(prompt)
    return _parse_json_response(response, tailored_resume)


async def shorten_bullets(bullets: list[dict], target_reduction: float = 0.15) -> list[dict]:
    """Ask Gemini to shorten specific bullets by a target percentage."""
    prompt = f"""Shorten each of these resume bullets by approximately {int(target_reduction * 100)}%.
Keep them impactful and starting with a past-tense action verb.

Return ONLY a JSON array of objects with "id" and "text" keys.

Bullets:
{json.dumps(bullets, indent=2)}"""

    response = await call_gemini(prompt)
    try:
        text = response.strip()
        if text.startswith("```"):
            import re
            text = re.sub(r'^```(?:json)?\s*', '', text)
            text = re.sub(r'\s*```$', '', text)
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return bullets


async def expand_bullet(bullet: dict) -> dict:
    """Ask Gemini to expand a bullet to be more substantial."""
    prompt = f"""This resume bullet is too short. Expand it naturally to fill a full line width
(approximately 15-25 words). Keep the same meaning, start with a past-tense action verb.

Return ONLY a JSON object with "id" and "text" keys.

Bullet:
{json.dumps(bullet)}"""

    response = await call_gemini(prompt)
    try:
        text = response.strip()
        if text.startswith("```"):
            import re
            text = re.sub(r'^```(?:json)?\s*', '', text)
            text = re.sub(r'\s*```$', '', text)
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return bullet


def _parse_json_response(response_text: str, fallback: dict) -> dict:
    """Parse JSON from Gemini response, handling markdown fences."""
    import re
    text = response_text.strip()

    if text.startswith("```"):
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object
        match = re.search(r'\{[\s\S]*\}', text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return fallback
