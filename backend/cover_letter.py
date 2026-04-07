"""
Two-pass cover letter generation using Gemini.
"""

import json
from backend.gemini_client import call_gemini


async def generate_cover_letter(
    parsed_resume: dict,
    jd_signals: dict,
    company_name: str,
    job_title: str,
    style_fingerprint: dict,
    banned_words: list[str],
) -> str:
    """Generate a cover letter using two-pass Gemini flow."""

    # Extract candidate info
    header = parsed_resume.get("header", {})
    name = header.get("name", "").replace("LOCKED: ", "")

    # Collect experience bullets for context
    experience_context = []
    for sec in parsed_resume.get("sections", []):
        if sec.get("type") == "experience":
            for entry in sec.get("entries", []):
                company = entry.get("company", "").replace("LOCKED: ", "")
                title = entry.get("title", "").replace("LOCKED: ", "")
                bullets = [b["text"] for b in entry.get("bullets", [])]
                experience_context.append(f"{title} at {company}: " + "; ".join(bullets))

    # Pass 1: Generate
    pass1_prompt = f"""Write a professional cover letter for {name} applying to {job_title} at {company_name}.

Context about the candidate's experience:
{chr(10).join(experience_context[:3])}

Job requirements:
- Must-have skills: {json.dumps(jd_signals.get('must_have_keywords', []))}
- Tech stack: {json.dumps(jd_signals.get('tech_stack', []))}
- Domain: {jd_signals.get('domain', 'software engineering')}
- Seniority: {jd_signals.get('seniority_level', 'mid')}

RULES:
1. Keep it under 350 words.
2. Exactly 3 paragraphs: opening, body (connecting experience to role), closing.
3. Be direct, human, and genuine — not sycophantic or corporate.
4. Never use these banned words: {json.dumps(banned_words)}
5. Match this writing style: {style_fingerprint.get('summary', 'Professional and concise')}
6. Do not use phrases like "I am writing to express my interest" or "I am excited to apply".
7. Start with something specific about the company or role.
8. Do not invent achievements — only reference what's in the experience context.

Return ONLY the cover letter text. No subject line, no headers, no formatting instructions."""

    cover_letter = await call_gemini(pass1_prompt)

    # Pass 2: Critique and rewrite
    pass2_prompt = f"""You are a humanness critic. Review this cover letter for AI-sounding language.

A cover letter sounds AI-generated if it:
- Uses vague grandiose language
- Is overly formal or corporate
- Uses any of these banned words: {json.dumps(banned_words)}
- Has generic platitudes instead of specific claims
- Sounds sycophantic or over-enthusiastic

Review and rewrite only the sentences that sound artificial. Keep sentences that sound natural.
The final letter must be under 350 words, 3 paragraphs, direct and human.

Return ONLY the final cover letter text.

Cover letter to review:
{cover_letter}"""

    final = await call_gemini(pass2_prompt)

    # Clean up any markdown formatting
    final = final.strip()
    if final.startswith("```"):
        import re
        final = re.sub(r'^```\w*\s*', '', final)
        final = re.sub(r'\s*```$', '', final)

    return final.strip()
