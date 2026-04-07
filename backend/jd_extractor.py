"""
Extract structured information from a job description using Gemini.
"""

import json
import re
import httpx
from bs4 import BeautifulSoup


async def fetch_jd_from_url(url: str) -> str:
    """Fetch and strip a job description page to plain text."""
    if "linkedin.com" in url.lower():
        raise ValueError(
            "LinkedIn blocks auto-fetch — please paste the JD text directly."
        )

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove script/style tags
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    # Collapse whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text


def build_extraction_prompt(jd_text: str) -> str:
    return f"""Analyze this job description and extract structured information.
Return ONLY valid JSON with these exact keys:

{{
  "must_have_keywords": ["keyword1", "keyword2"],
  "nice_to_have_keywords": ["keyword1", "keyword2"],
  "tech_stack": ["tech1", "tech2"],
  "seniority_level": "one of: junior, mid, senior_ic, lead, manager",
  "domain": "one of: infra, frontend, backend, fullstack, ml, data, devops, mobile, other",
  "culture_signals": ["signal1", "signal2"]
}}

Rules:
- must_have_keywords: explicitly required skills, technologies, or qualifications
- nice_to_have_keywords: preferred/bonus items
- tech_stack: all specific technologies, languages, frameworks, tools mentioned
- seniority_level: infer from title and requirements
- domain: primary technical domain
- culture_signals: company culture hints (e.g., "fast-paced", "remote-first", "research-focused")

Job Description:
{jd_text}"""


def parse_extraction_response(response_text: str) -> dict:
    """Parse the Gemini response into structured JSON."""
    # Try to extract JSON from the response
    text = response_text.strip()

    # Remove markdown code fences if present
    if text.startswith("```"):
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        match = re.search(r'\{[\s\S]*\}', text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

    # Fallback: return empty structure
    return {
        "must_have_keywords": [],
        "nice_to_have_keywords": [],
        "tech_stack": [],
        "seniority_level": "mid",
        "domain": "other",
        "culture_signals": [],
    }
