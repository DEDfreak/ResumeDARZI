"""
Parse a LaTeX resume into structured JSON with EDITABLE and LOCKED zones.

Locked: name, email, phone, LinkedIn, GitHub, company names, job titles,
        project names, award names, university names, degrees, dates, section headers.
Editable: bullet descriptions, skills content, summary/objective, tech stack lists, action verbs.
"""

import re
import copy
from typing import Optional


def _extract_brace_args(text: str, n: int) -> list[str]:
    """Extract n brace-balanced arguments from text (which should start with '{')."""
    args = []
    pos = 0
    for _ in range(n):
        while pos < len(text) and text[pos] != '{':
            pos += 1
        if pos >= len(text):
            break
        depth = 0
        start = pos + 1
        for i in range(pos, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    args.append(text[start:i])
                    pos = i + 1
                    break
    return args


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
            candidate = name_match.group(1).strip()
            # Skip LaTeX placeholders like #1, #2
            if '#' in candidate:
                continue
            # Strip nested LaTeX commands (e.g. \huge, \textbf, etc.)
            candidate = re.sub(r'\\[a-zA-Z]+\s+', '', candidate).strip()
            name = candidate
            break
        # Check for centered large text that looks like a name
        clean = re.sub(r'\\[a-zA-Z]+\{?', '', stripped).replace('}', '').replace('{', '').strip()
        if clean and '#' not in clean and not re.match(r'^\\', clean) and len(clean.split()) <= 5 and not EMAIL_RE.search(clean) and not name:
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

        # 4-arg: \resumeSubheading{company}{location}{title}{dates}
        sub_match4 = re.search(
            r'\\resumeSubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}',
            stripped, re.IGNORECASE
        )
        # 3-arg: \ressubheading{company}{title}{dates}
        sub_match3 = re.search(
            r'\\ressubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}',
            stripped, re.IGNORECASE
        ) if not sub_match4 else None

        sub_match = sub_match4 or sub_match3
        if sub_match:
            if current_entry:
                current_entry["bullets"] = current_bullets
                entries.append(current_entry)
                current_bullets = []
            if sub_match4:
                current_entry = {
                    "company": sub_match.group(1).strip(),
                    "location": sub_match.group(2).strip(),
                    "title": sub_match.group(3).strip(),
                    "dates": sub_match.group(4).strip(),
                }
            else:
                current_entry = {
                    "company": sub_match.group(1).strip(),
                    "location": "",
                    "title": sub_match.group(2).strip(),
                    "dates": sub_match.group(3).strip(),
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

        # Tech Stack line: {\small \underline{Tech Stack:} item1, item2, ...}
        tech_match = re.search(r'\\underline\{Tech Stack:\}\s*(.*)', stripped, re.IGNORECASE)
        if tech_match and current_entry is not None:
            tech_text = tech_match.group(1).rstrip('}').strip()
            if tech_text:
                current_entry["tech_stack"] = tech_text
            continue

        # Check for \\item bullets
        item_match = re.search(r'\\(?:resumeItem|item)(?![a-zA-Z])\s*[\[\{]?\s*(.*)', stripped)
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

        # \resumeSubheading{institution}{dates}{degree}{details}
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

        # \eduheading{institution}{location}{degree}{dates}
        # Use brace-balanced extractor because degree may contain nested commands
        edu_pos = stripped.find('\\eduheading')
        if edu_pos != -1:
            args = _extract_brace_args(stripped[edu_pos + len('\\eduheading'):], 4)
            if len(args) == 4:
                if current_entry:
                    entries.append(current_entry)
                degree_raw = args[2].strip()
                degree_clean = re.sub(r'\\textnormal\{([^}]*)\}', r'\1', degree_raw)
                degree_clean = re.sub(r'\\[a-zA-Z]+\{([^}]*)\}', r'\1', degree_clean).strip()
                current_entry = {
                    "institution": args[0].strip(),
                    "location": args[1].strip(),
                    "degree": degree_clean,
                    "dates": args[3].strip(),
                    "details": "",
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

        # Pattern: \textbf{Category:} items  OR  \textbf{Category}: items
        # The colon may be inside the braces (e.g. \textbf{Languages:}) or after them
        cat_match = re.search(r'\\textbf\{([^}]+?):?\}\s*[:\s]*(.*?)(?:\\\\)?\s*$', stripped)
        if cat_match and cat_match.group(2).strip():
            category = cat_match.group(1).strip().rstrip(':')
            items = re.sub(r'^[:\-\s]+', '', cat_match.group(2)).rstrip('\\').strip()
            if items:
                skills.append({
                    "category": category,
                    "items": items,
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

        # Pattern 1: \resumeProjectHeading{name}{dates}
        rph_match = re.search(r'\\resumeProjectHeading\{([^}]*)\}\{([^}]*)\}', stripped)
        if rph_match:
            if current_project:
                current_project["bullets"] = current_bullets
                projects.append(current_project)
                current_bullets = []
            current_project = {
                "name": rph_match.group(1).strip(),
                "dates": rph_match.group(2).strip(),
            }
            continue

        # Pattern 2: \textbf{\href{url}{\underline{\textcolor{blue}{Name}}}}: description
        # (inline single-line project format)
        if '\\textbf{' in stripped and '\\href{' in stripped and '\\item' not in stripped:
            # Extract display name from \textcolor{blue}{Name} or innermost {...}
            name_m = re.search(r'\\textcolor\{[^}]+\}\{([^}]+)\}', stripped)
            if not name_m:
                # Fallback: last {word chars} before }}:
                name_m = re.search(r'\{([A-Za-z][^{}]{0,60})\}\s*\}+\s*:', stripped)

            # Extract description after the closing brace cluster + colon
            desc_m = re.search(r'\}+\s*:\s*(.+)$', stripped)

            if name_m and desc_m:
                if current_project:
                    current_project["bullets"] = current_bullets
                    projects.append(current_project)
                    current_bullets = []
                projects.append({
                    "name": name_m.group(1).strip(),
                    "dates": "",
                    "bullets": [desc_m.group(1).strip()],
                })
                current_project = None
                current_bullets = []
                continue

        # Pattern 3: plain \textbf{Name}: description (no href)
        if '\\textbf{' in stripped and '\\item' not in stripped and '\\href{' not in stripped:
            plain_m = re.search(r'\\textbf\{([^}]+)\}\s*[:\-]\s*(.+)$', stripped)
            if plain_m:
                if current_project:
                    current_project["bullets"] = current_bullets
                    projects.append(current_project)
                    current_bullets = []
                projects.append({
                    "name": plain_m.group(1).strip(),
                    "dates": "",
                    "bullets": [plain_m.group(2).strip()],
                })
                current_project = None
                current_bullets = []
                continue

        item_match = re.search(r'\\(?:resumeItem|item)(?![a-zA-Z])\s*[\[\{]?\s*(.*)', stripped)
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
                    "tech_stack": f"LOCKED: {entry.get('tech_stack', '')}",
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
    # Use regex to match \item followed by the old text, preserve \item command
    for bid, new_text in edit_map.items():
        old_text = orig_map.get(bid)
        if old_text and old_text != new_text:
            # Match \item followed by optional whitespace and the old text
            # This preserves the \item command and surrounding structure
            pattern = r'(\\item\s*)' + re.escape(old_text)
            replacement = r'\1' + new_text
            result = re.sub(pattern, replacement, result, count=1)

            # Fallback: if regex doesn't match, try simple replacement
            if old_text not in result and old_text in original_tex:
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
