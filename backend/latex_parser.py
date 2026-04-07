"""
Parse a LaTeX resume into structured JSON with EDITABLE and LOCKED zones.

Locked: name, email, phone, LinkedIn, GitHub, company names, job titles,
        project names, award names, university names, degrees, dates, section headers.
Editable: bullet descriptions, skills content, summary/objective, tech stack lists, action verbs.
"""

import re
import copy
from typing import Optional


# Patterns for detecting LaTeX resume structures
# Matches both \section{} and \resheading{} and similar custom commands
SECTION_RE = re.compile(r'\\(?:section|subsection|resheading|sectiontitle)\{([^}]+)\}', re.IGNORECASE)
# Matches \ressubheading{company}{location}{title}{dates} (4 args)
RESSUBHEADING_RE = re.compile(r'\\ressubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}')
DATE_RE = re.compile(
    r'(?:'
    r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}'
    r'|\b\d{4}\b'
    r'|\bPresent\b'
    r'|\bCurrent\b'
    r')'
    r'(?:\s*[-–—]\s*(?:'
    r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}'
    r'|\d{4}'
    r'|Present'
    r'|Current'
    r'))?',
    re.IGNORECASE,
)
URL_RE = re.compile(r'\\href\{([^}]+)\}\{([^}]+)\}|https?://\S+|\\url\{[^}]+\}')
EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
PHONE_RE = re.compile(r'[\+]?[\d\s\-\(\)]{7,15}')
ITEM_RE = re.compile(r'\\item\s*(.*)', re.DOTALL)

EXPERIENCE_KEYWORDS = ['experience', 'work experience', 'professional experience', 'employment']
EDUCATION_KEYWORDS = ['education', 'academic']
SKILLS_KEYWORDS = ['skills', 'technical skills', 'technologies', 'competencies']
PROJECTS_KEYWORDS = ['projects', 'personal projects', 'side projects']
SUMMARY_KEYWORDS = ['summary', 'objective', 'about', 'profile']
AWARDS_KEYWORDS = ['awards', 'honors', 'achievements', 'certifications']


def classify_section(name: str) -> str:
    lower = name.lower().strip()
    for kw in EXPERIENCE_KEYWORDS:
        if kw in lower:
            return "experience"
    for kw in EDUCATION_KEYWORDS:
        if kw in lower:
            return "education"
    for kw in SKILLS_KEYWORDS:
        if kw in lower:
            return "skills"
    for kw in PROJECTS_KEYWORDS:
        if kw in lower:
            return "projects"
    for kw in SUMMARY_KEYWORDS:
        if kw in lower:
            return "summary"
    for kw in AWARDS_KEYWORDS:
        if kw in lower:
            return "awards"
    return "other"


def extract_header_info(lines: list[str]) -> dict:
    """Extract name, contact info from the header (before first \\section)."""
    header_lines = []
    for line in lines:
        if SECTION_RE.search(line):
            break
        header_lines.append(line)

    header_text = "\n".join(header_lines)
    name = ""
    email = ""
    phone = ""
    linkedin = ""
    github = ""

    # Try to find name — usually the first non-empty, non-command prominent text
    for line in header_lines:
        stripped = line.strip()
        # Skip empty lines, document class, usepackage, begin{document}
        if not stripped or stripped.startswith('\\documentclass') or \
           stripped.startswith('\\usepackage') or stripped.startswith('\\begin') or \
           stripped.startswith('\\end') or stripped.startswith('%') or \
           stripped.startswith('\\pagestyle') or stripped.startswith('\\setlength') or \
           stripped.startswith('\\newcommand') or stripped.startswith('\\def') or \
           stripped.startswith('\\input') or stripped.startswith('\\renewcommand') or \
           stripped.startswith('\\geometry') or stripped.startswith('\\RequirePackage') or \
           stripped.startswith('\\titleformat'):
            continue
        # Check for name commands
        name_match = re.search(r'\\(?:name|Name|LARGE|huge|Huge|textbf)\{([^}]+)\}', stripped)
        if name_match and not name:
            name = name_match.group(1).strip()
            break
        # Check for centered large text that looks like a name
        clean = re.sub(r'\\[a-zA-Z]+\{?', '', stripped).replace('}', '').replace('{', '').strip()
        if clean and not re.match(r'^\\', clean) and len(clean.split()) <= 5 and not EMAIL_RE.search(clean) and not name:
            name = clean
            break

    email_match = EMAIL_RE.search(header_text)
    if email_match:
        email = email_match.group(0)

    phone_candidates = PHONE_RE.findall(header_text)
    for p in phone_candidates:
        digits = re.sub(r'\D', '', p)
        if len(digits) >= 10:
            phone = p.strip()
            break

    # LinkedIn / GitHub from hrefs or plain text
    for m in re.finditer(r'\\href\{([^}]+)\}\{([^}]*)\}', header_text):
        url = m.group(1).lower()
        if 'linkedin' in url:
            linkedin = m.group(2) or m.group(1)
        elif 'github' in url:
            github = m.group(2) or m.group(1)

    if not linkedin:
        li_match = re.search(r'linkedin\.com/in/[a-zA-Z0-9_-]+', header_text, re.IGNORECASE)
        if li_match:
            linkedin = li_match.group(0)
    if not github:
        gh_match = re.search(r'github\.com/[a-zA-Z0-9_-]+', header_text, re.IGNORECASE)
        if gh_match:
            github = gh_match.group(0)

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "linkedin": linkedin,
        "github": github,
    }


def split_into_sections(tex: str) -> list[dict]:
    """Split tex content into sections based on \\section{} commands."""
    lines = tex.split('\n')
    sections = []
    current_section = None
    header_lines = []

    for i, line in enumerate(lines):
        sec_match = SECTION_RE.search(line)
        if sec_match:
            if current_section:
                sections.append(current_section)
            section_name = sec_match.group(1)
            current_section = {
                "name": section_name,
                "type": classify_section(section_name),
                "header_line": line,
                "lines": [],
                "line_start": i,
            }
        elif current_section:
            current_section["lines"].append(line)
        else:
            header_lines.append(line)

    if current_section:
        sections.append(current_section)

    return header_lines, sections


def parse_experience_section(lines: list[str]) -> list[dict]:
    """Parse experience entries: company, title, dates, bullets."""
    entries = []
    current_entry = None
    current_bullets = []
    in_itemize = False

    # Join lines to handle multi-line entries
    text = "\n".join(lines)

    # Common patterns for experience entries:
    # \textbf{Company} \hfill dates
    # \textit{Title} \hfill dates
    # or variations with \resumeSubheading, \cventry, etc.

    entry_patterns = [
        # Pattern: custom resume commands like \resumeSubheading
        re.compile(r'\\resumeSubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}'),
        # Pattern: \textbf{Company/Title} ... date
        re.compile(r'\\textbf\{([^}]+)\}'),
    ]

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('%'):
            continue

        # Check for \\begin{itemize} / \\end{itemize}
        if '\\begin{itemize}' in stripped:
            in_itemize = True
            continue
        if '\\end{itemize}' in stripped:
            in_itemize = False
            continue

        # Check for resumeSubheading or ressubheading pattern (case-insensitive)
        sub_match = re.search(
            r'\\res(?:ubheading|SubHeading)\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}',
            stripped, re.IGNORECASE
        )
        if sub_match:
            if current_entry:
                current_entry["bullets"] = current_bullets
                entries.append(current_entry)
                current_bullets = []
            current_entry = {
                "company": sub_match.group(1).strip(),
                "location": sub_match.group(2).strip(),
                "title": sub_match.group(3).strip(),
                "dates": sub_match.group(4).strip(),
            }
            continue

        # Check for resumeSubHeadingListStart/End
        if 'resumeSubHeadingListStart' in stripped or 'resumeSubHeadingListEnd' in stripped:
            continue
        if 'resumeItemListStart' in stripped or 'resumeItemListEnd' in stripped:
            continue

        # Fallback: detect bold text as company/title headers
        bold_match = re.search(r'\\textbf\{([^}]+)\}', stripped)
        italic_match = re.search(r'\\textit\{([^}]+)\}', stripped)

        if bold_match and not in_itemize and '\\item' not in stripped:
            # Could be a new entry header
            if current_entry and not current_entry.get("title") and italic_match:
                current_entry["title"] = italic_match.group(1).strip()
            elif bold_match:
                if current_entry:
                    current_entry["bullets"] = current_bullets
                    entries.append(current_entry)
                    current_bullets = []

                dates_found = DATE_RE.findall(stripped)
                date_str = dates_found[0] if dates_found else ""

                current_entry = {
                    "company": bold_match.group(1).strip(),
                    "title": italic_match.group(1).strip() if italic_match else "",
                    "dates": date_str,
                    "location": "",
                }
                continue
        elif italic_match and current_entry and not current_entry.get("title"):
            current_entry["title"] = italic_match.group(1).strip()
            dates_found = DATE_RE.findall(stripped)
            if dates_found:
                current_entry["dates"] = dates_found[0]
            continue

        # Check for \\item bullets
        item_match = re.search(r'\\(?:resumeItem|item)\s*[\[\{]?\s*(.*)', stripped)
        if item_match:
            bullet_text = item_match.group(1).strip()
            # Clean up trailing braces
            bullet_text = re.sub(r'\}$', '', bullet_text).strip()
            if bullet_text:
                current_bullets.append(bullet_text)
            continue

    if current_entry:
        current_entry["bullets"] = current_bullets
        entries.append(current_entry)

    return entries


def parse_education_section(lines: list[str]) -> list[dict]:
    """Parse education entries."""
    entries = []
    current_entry = None

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('%'):
            continue
        if 'resumeSubHeadingListStart' in stripped or 'resumeSubHeadingListEnd' in stripped:
            continue

        sub_match = re.search(
            r'\\resumeSubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}', stripped
        )
        if sub_match:
            if current_entry:
                entries.append(current_entry)
            current_entry = {
                "institution": sub_match.group(1).strip(),
                "dates": sub_match.group(2).strip(),
                "degree": sub_match.group(3).strip(),
                "details": sub_match.group(4).strip(),
            }
            continue

        bold_match = re.search(r'\\textbf\{([^}]+)\}', stripped)
        if bold_match and not current_entry:
            current_entry = {
                "institution": bold_match.group(1).strip(),
                "dates": "",
                "degree": "",
                "details": "",
            }
            dates_found = DATE_RE.findall(stripped)
            if dates_found:
                current_entry["dates"] = dates_found[0]
            italic_match = re.search(r'\\textit\{([^}]+)\}', stripped)
            if italic_match:
                current_entry["degree"] = italic_match.group(1).strip()
        elif current_entry:
            italic_match = re.search(r'\\textit\{([^}]+)\}', stripped)
            if italic_match:
                current_entry["degree"] = italic_match.group(1).strip()

    if current_entry:
        entries.append(current_entry)

    return entries


def parse_skills_section(lines: list[str]) -> list[dict]:
    """Parse skills — typically key: value pairs or comma-separated lists."""
    skills = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('%'):
            continue
        if 'resumeSubHeadingListStart' in stripped or 'resumeSubHeadingListEnd' in stripped:
            continue

        # Pattern: \textbf{Category}: skill1, skill2
        cat_match = re.search(r'\\textbf\{([^}]+)\}\s*[:\-]\s*(.*)', stripped)
        if cat_match:
            skills.append({
                "category": cat_match.group(1).strip(),
                "items": cat_match.group(2).strip().rstrip('\\').strip(),
            })
            continue

        # Pattern: \resumeItem{Category}{skills}
        item_match = re.search(r'\\resumeItem\{([^}]*)\}\{([^}]*)\}', stripped)
        if item_match:
            skills.append({
                "category": item_match.group(1).strip(),
                "items": item_match.group(2).strip(),
            })
            continue

        # Plain item
        plain_item = re.search(r'\\item\s*(.*)', stripped)
        if plain_item:
            text = plain_item.group(1).strip()
            if text:
                skills.append({"category": "", "items": text})

    return skills


def parse_projects_section(lines: list[str]) -> list[dict]:
    """Parse project entries."""
    projects = []
    current_project = None
    current_bullets = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('%'):
            continue
        if any(kw in stripped for kw in ['resumeSubHeadingListStart', 'resumeSubHeadingListEnd',
                                          'resumeItemListStart', 'resumeItemListEnd',
                                          '\\begin{itemize}', '\\end{itemize}']):
            continue

        # Project heading patterns
        proj_match = re.search(r'\\resumeProjectHeading\{([^}]*)\}\{([^}]*)\}', stripped)
        if not proj_match:
            proj_match = re.search(r'\\textbf\{([^}]+)\}', stripped)

        if proj_match and '\\item' not in stripped.split('\\textbf')[0] if '\\textbf' in stripped else proj_match:
            if current_project:
                current_project["bullets"] = current_bullets
                projects.append(current_project)
                current_bullets = []

            name = proj_match.group(1).strip()
            dates = proj_match.group(2).strip() if proj_match.lastindex and proj_match.lastindex >= 2 else ""
            current_project = {
                "name": name,
                "dates": dates,
            }
            continue

        item_match = re.search(r'\\(?:resumeItem|item)\s*[\[\{]?\s*(.*)', stripped)
        if item_match:
            text = item_match.group(1).strip().rstrip('}').strip()
            if text:
                current_bullets.append(text)

    if current_project:
        current_project["bullets"] = current_bullets
        projects.append(current_project)

    return projects


def parse_resume(tex_content: str) -> dict:
    """
    Main entry point. Parse a LaTeX resume into structured JSON with
    EDITABLE and LOCKED zones.
    """
    header_lines, sections = split_into_sections(tex_content)
    header_info = extract_header_info(tex_content.split('\n'))

    bullet_counter = 0
    parsed_sections = []

    for sec in sections:
        sec_type = sec["type"]
        parsed = {
            "name": sec["name"],
            "type": sec_type,
        }

        if sec_type == "experience":
            entries = parse_experience_section(sec["lines"])
            parsed_entries = []
            for entry in entries:
                bullets = []
                for b in entry.get("bullets", []):
                    bullet_counter += 1
                    bullets.append({
                        "id": f"b{bullet_counter}",
                        "status": "EDITABLE",
                        "text": b,
                    })
                parsed_entries.append({
                    "company": f"LOCKED: {entry.get('company', '')}",
                    "title": f"LOCKED: {entry.get('title', '')}",
                    "dates": f"LOCKED: {entry.get('dates', '')}",
                    "location": f"LOCKED: {entry.get('location', '')}",
                    "bullets": bullets,
                })
            parsed["entries"] = parsed_entries

        elif sec_type == "education":
            entries = parse_education_section(sec["lines"])
            parsed["entries"] = [
                {
                    "institution": f"LOCKED: {e.get('institution', '')}",
                    "degree": f"LOCKED: {e.get('degree', '')}",
                    "dates": f"LOCKED: {e.get('dates', '')}",
                    "details": f"LOCKED: {e.get('details', '')}",
                }
                for e in entries
            ]

        elif sec_type == "skills":
            skill_list = parse_skills_section(sec["lines"])
            parsed["skills"] = [
                {
                    "category": f"LOCKED: {s['category']}" if s['category'] else "",
                    "items": s["items"],
                    "status": "EDITABLE",
                }
                for s in skill_list
            ]

        elif sec_type == "projects":
            projects = parse_projects_section(sec["lines"])
            parsed_projects = []
            for proj in projects:
                bullets = []
                for b in proj.get("bullets", []):
                    bullet_counter += 1
                    bullets.append({
                        "id": f"b{bullet_counter}",
                        "status": "EDITABLE",
                        "text": b,
                    })
                parsed_projects.append({
                    "name": f"LOCKED: {proj.get('name', '')}",
                    "dates": f"LOCKED: {proj.get('dates', '')}",
                    "bullets": bullets,
                })
            parsed["projects"] = parsed_projects

        elif sec_type == "summary":
            summary_text = " ".join(
                line.strip() for line in sec["lines"]
                if line.strip() and not line.strip().startswith('%')
                and not line.strip().startswith('\\begin')
                and not line.strip().startswith('\\end')
            )
            # Clean LaTeX commands
            summary_text = re.sub(r'\\[a-zA-Z]+\{', '', summary_text).replace('}', '')
            parsed["text"] = summary_text
            parsed["status"] = "EDITABLE"

        else:
            # Generic: store raw lines
            parsed["raw_lines"] = sec["lines"]

        parsed_sections.append(parsed)

    return {
        "header": {
            "name": f"LOCKED: {header_info['name']}",
            "email": f"LOCKED: {header_info['email']}",
            "phone": f"LOCKED: {header_info['phone']}",
            "linkedin": f"LOCKED: {header_info['linkedin']}",
            "github": f"LOCKED: {header_info['github']}",
        },
        "sections": parsed_sections,
    }


def get_editable_bullets(parsed: dict) -> list[dict]:
    """Extract all editable bullet items from the parsed resume."""
    bullets = []
    for sec in parsed.get("sections", []):
        if sec["type"] == "experience":
            for entry in sec.get("entries", []):
                for b in entry.get("bullets", []):
                    if b.get("status") == "EDITABLE":
                        bullets.append(b)
        elif sec["type"] == "projects":
            for proj in sec.get("projects", []):
                for b in proj.get("bullets", []):
                    if b.get("status") == "EDITABLE":
                        bullets.append(b)
    return bullets


def apply_edits(original_tex: str, parsed_original: dict, parsed_edited: dict) -> str:
    """
    Apply edits from parsed_edited back into the original .tex source.
    Only replaces EDITABLE bullet text — LOCKED fields are untouched.
    """
    result = original_tex

    # Build a map of bullet id -> new text from the edited version
    edit_map = {}
    for sec in parsed_edited.get("sections", []):
        if sec.get("type") == "experience":
            for entry in sec.get("entries", []):
                for b in entry.get("bullets", []):
                    edit_map[b["id"]] = b["text"]
        elif sec.get("type") == "projects":
            for proj in sec.get("projects", []):
                for b in proj.get("bullets", []):
                    edit_map[b["id"]] = b["text"]

    # Build a map of bullet id -> original text
    orig_map = {}
    for sec in parsed_original.get("sections", []):
        if sec.get("type") == "experience":
            for entry in sec.get("entries", []):
                for b in entry.get("bullets", []):
                    orig_map[b["id"]] = b["text"]
        elif sec.get("type") == "projects":
            for proj in sec.get("projects", []):
                for b in proj.get("bullets", []):
                    orig_map[b["id"]] = b["text"]

    # Replace each changed bullet in the tex source
    for bid, new_text in edit_map.items():
        old_text = orig_map.get(bid)
        if old_text and old_text != new_text:
            # Escape special regex chars in old_text for safe replacement
            result = result.replace(old_text, new_text, 1)

    # Handle skills section edits
    for sec in parsed_edited.get("sections", []):
        if sec.get("type") == "skills":
            for i, skill in enumerate(sec.get("skills", [])):
                orig_sec = next(
                    (s for s in parsed_original.get("sections", []) if s.get("type") == "skills"),
                    None,
                )
                if orig_sec and i < len(orig_sec.get("skills", [])):
                    old_items = orig_sec["skills"][i]["items"]
                    new_items = skill["items"]
                    if old_items != new_items:
                        result = result.replace(old_items, new_items, 1)

    # Handle summary edits
    for sec in parsed_edited.get("sections", []):
        if sec.get("type") == "summary" and sec.get("status") == "EDITABLE":
            orig_sec = next(
                (s for s in parsed_original.get("sections", []) if s.get("type") == "summary"),
                None,
            )
            if orig_sec and orig_sec.get("text") != sec.get("text"):
                result = result.replace(orig_sec["text"], sec["text"], 1)

    return result
