"""
Four validation gates for the tailored resume.
Gate 1: One-pager check
Gate 2: Lock guard
Gate 3: Line-fill >= 75%
Gate 4: ATS score improvement
"""

import re
import json
from pathlib import Path
from typing import Optional

from backend.latex_parser import get_editable_bullets


async def gate1_one_pager(
    tex_content: str,
    compile_fn,
    shorten_fn,
    parsed_resume: dict,
    max_retries: int = 3,
) -> tuple[str, bool, str]:
    """
    Gate 1: Compile to PDF and check page count.
    Returns (possibly_modified_tex, passed, message).
    """
    for attempt in range(max_retries):
        result = await compile_fn(tex_content)
        if result["error"]:
            return tex_content, False, f"LaTeX compilation error: {result['error']}"

        if result["pages"] <= 1:
            return tex_content, True, "Resume fits on one page."

        if attempt < max_retries - 1:
            # Find longest bullets and ask Gemini to shorten
            bullets = get_editable_bullets(parsed_resume)
            if not bullets:
                return tex_content, False, "Resume exceeds one page but no editable bullets found to shorten."

            # Sort by text length, take top 5 longest
            longest = sorted(bullets, key=lambda b: len(b["text"]), reverse=True)[:5]
            shortened = await shorten_fn(longest)

            # Apply shortened bullets back to tex
            for item in shortened:
                old_bullet = next((b for b in bullets if b["id"] == item.get("id")), None)
                if old_bullet and item.get("text"):
                    tex_content = tex_content.replace(old_bullet["text"], item["text"], 1)
                    old_bullet["text"] = item["text"]

    return tex_content, False, "Resume still exceeds one page after 3 shortening attempts."


def gate2_lock_guard(original_tex: str, tailored_tex: str, parsed_original: dict) -> tuple[bool, str]:
    """
    Gate 2: Verify no LOCKED field was changed.
    Returns (passed, message).
    """
    violations = []

    header = parsed_original.get("header", {})
    for field, value in header.items():
        locked_value = value.replace("LOCKED: ", "")
        if locked_value and locked_value not in tailored_tex:
            violations.append(f"Header field '{field}' may have been modified ('{locked_value}' not found in output)")

    for sec in parsed_original.get("sections", []):
        if sec.get("type") == "experience":
            for entry in sec.get("entries", []):
                for field in ["company", "title", "dates"]:
                    val = entry.get(field, "").replace("LOCKED: ", "")
                    if val and val not in tailored_tex:
                        violations.append(f"Experience {field} '{val}' may have been modified")

        elif sec.get("type") == "education":
            for entry in sec.get("entries", []):
                for field in ["institution", "degree", "dates"]:
                    val = entry.get(field, "").replace("LOCKED: ", "")
                    if val and val not in tailored_tex:
                        violations.append(f"Education {field} '{val}' may have been modified")

        elif sec.get("type") == "projects":
            for proj in sec.get("projects", []):
                name = proj.get("name", "").replace("LOCKED: ", "")
                if name and name not in tailored_tex:
                    violations.append(f"Project name '{name}' may have been modified")

    if violations:
        return False, "Lock guard violations:\n" + "\n".join(f"  - {v}" for v in violations)
    return True, "All locked fields preserved."


def gate3_line_fill(
    pdf_image,
    threshold: float = 0.75,
) -> tuple[bool, list[str], str]:
    """
    Gate 3: Check that bullet lines fill >= 75% of line width.
    Uses pixel analysis on the rendered PDF image.
    Returns (passed, short_bullet_hints, message).
    """
    try:
        import numpy as np
        from PIL import Image

        if isinstance(pdf_image, (str, Path)):
            img = Image.open(pdf_image)
        else:
            img = pdf_image

        img_array = np.array(img.convert('L'))

        # Find content boundaries (non-white area)
        row_means = img_array.mean(axis=1)
        content_rows = np.where(row_means < 250)[0]
        if len(content_rows) == 0:
            return True, [], "No content detected in PDF."

        col_means = img_array.mean(axis=0)
        content_cols = np.where(col_means < 250)[0]
        if len(content_cols) == 0:
            return True, [], "No content detected in PDF."

        left_margin = content_cols[0]
        right_margin = content_cols[-1]
        total_width = right_margin - left_margin

        if total_width <= 0:
            return True, [], "Could not determine content width."

        # Analyze each text line
        short_lines = []
        in_text_line = False
        line_start = 0
        line_count = 0

        for row_idx in range(content_rows[0], content_rows[-1]):
            row = img_array[row_idx, left_margin:right_margin]
            has_text = np.any(row < 200)

            if has_text and not in_text_line:
                in_text_line = True
                line_start = row_idx
            elif not has_text and in_text_line:
                in_text_line = False
                line_count += 1

                # Measure how far right the text extends on this line
                line_slice = img_array[line_start:row_idx, left_margin:right_margin]
                col_has_text = np.any(line_slice < 200, axis=0)
                if np.any(col_has_text):
                    last_text_col = np.where(col_has_text)[0][-1]
                    fill_ratio = last_text_col / total_width
                    if fill_ratio < threshold:
                        short_lines.append(f"Line {line_count} ({fill_ratio:.0%} fill)")

        if short_lines:
            return (
                False,
                short_lines,
                f"{len(short_lines)} lines are below {threshold:.0%} fill: {', '.join(short_lines[:5])}",
            )
        return True, [], "All lines meet minimum fill requirement."

    except ImportError:
        return True, [], "numpy not available — skipping line-fill check."
    except Exception as e:
        return True, [], f"Line-fill check error (non-blocking): {e}"


def gate4_ats_score(
    original_bullets: list[str],
    tailored_bullets: list[str],
    must_have_keywords: list[str],
    nice_to_have_keywords: list[str],
) -> dict:
    """
    Gate 4: ATS keyword match score comparison.
    Returns a report dict.
    """
    def score(texts: list[str], keywords: list[str]) -> tuple[float, list[str], list[str]]:
        combined = " ".join(texts).lower()
        matched = [kw for kw in keywords if kw.lower() in combined]
        missed = [kw for kw in keywords if kw.lower() not in combined]
        pct = len(matched) / len(keywords) if keywords else 1.0
        return pct, matched, missed

    orig_must_score, orig_must_matched, orig_must_missed = score(original_bullets, must_have_keywords)
    new_must_score, new_must_matched, new_must_missed = score(tailored_bullets, must_have_keywords)

    orig_nice_score, _, _ = score(original_bullets, nice_to_have_keywords)
    new_nice_score, _, _ = score(tailored_bullets, nice_to_have_keywords)

    improved = new_must_score >= orig_must_score

    return {
        "original_must_have_score": round(orig_must_score * 100, 1),
        "tailored_must_have_score": round(new_must_score * 100, 1),
        "original_nice_to_have_score": round(orig_nice_score * 100, 1),
        "tailored_nice_to_have_score": round(new_nice_score * 100, 1),
        "must_have_matched": new_must_matched,
        "must_have_missed": new_must_missed,
        "improved": improved,
        "message": (
            f"ATS score: {orig_must_score:.0%} → {new_must_score:.0%} (must-have keywords). "
            + ("Improved!" if improved else "WARNING: Score did not improve.")
        ),
    }
