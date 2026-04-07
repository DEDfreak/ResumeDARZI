"""
FastAPI application — all routes for ResumeTailor.
"""

import json
import asyncio
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from backend.config import (
    get_settings, save_settings, BASE_RESUME_DIR, OUTPUTS_DIR, PROJECT_ROOT,
)
from backend.latex_parser import parse_resume, apply_edits, get_editable_bullets
from backend.style_fingerprint import extract_fingerprint
from backend.jd_extractor import fetch_jd_from_url
from backend.gemini_client import extract_jd, pass1_tailor, pass2_critique, shorten_bullets, expand_bullet
from backend.validator import gate1_one_pager, gate2_lock_guard, gate3_line_fill, gate4_ats_score
from backend.pdf_utils import (
    check_pdflatex, compile_latex, compile_and_save, generate_visual_diff, pdf_to_image,
)
from backend.cover_letter import generate_cover_letter

app = FastAPI(title="ResumeTailor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "pdflatex_available": check_pdflatex(),
    }


# --- Resume Upload ---

@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename.endswith(".tex"):
        raise HTTPException(400, "Only .tex files are accepted.")

    content = await file.read()
    tex_text = content.decode("utf-8")

    # Save to base_resume directory
    save_path = BASE_RESUME_DIR / "resume.tex"
    save_path.write_text(tex_text, encoding="utf-8")

    # Parse to verify it's valid
    try:
        parsed = parse_resume(tex_text)
        bullet_count = len(get_editable_bullets(parsed))
    except Exception as e:
        raise HTTPException(400, f"Error parsing LaTeX: {e}")

    return {
        "filename": file.filename,
        "path": str(save_path),
        "sections": len(parsed.get("sections", [])),
        "editable_bullets": bullet_count,
        "header": parsed.get("header", {}),
    }


@app.get("/api/base-resume")
async def get_base_resume():
    """Check if a base resume exists."""
    path = BASE_RESUME_DIR / "resume.tex"
    if path.exists():
        parsed = parse_resume(path.read_text(encoding="utf-8"))
        return {
            "exists": True,
            "filename": "resume.tex",
            "sections": len(parsed.get("sections", [])),
            "editable_bullets": len(get_editable_bullets(parsed)),
            "header": parsed.get("header", {}),
        }
    return {"exists": False}


# --- Settings ---

@app.get("/api/settings")
async def get_settings_route():
    settings = get_settings()
    # Mask API key for display
    masked = settings.copy()
    if masked.get("gemini_api_key"):
        key = masked["gemini_api_key"]
        masked["gemini_api_key_masked"] = key[:8] + "..." + key[-4:] if len(key) > 12 else "***"
    return masked


@app.post("/api/settings")
async def save_settings_route(request: Request):
    data = await request.json()
    current = get_settings()

    if "gemini_api_key" in data and data["gemini_api_key"]:
        current["gemini_api_key"] = data["gemini_api_key"]
    if "banned_words" in data:
        current["banned_words"] = data["banned_words"]
    if "generate_cover_letter" in data:
        current["generate_cover_letter"] = data["generate_cover_letter"]

    save_settings(current)
    return {"status": "saved"}


# --- Main Generation Flow (SSE) ---

@app.post("/api/generate")
async def generate(request: Request):
    data = await request.json()
    company_name = data.get("company_name", "").strip()
    job_title = data.get("job_title", "").strip()
    jd_text = data.get("jd_text", "").strip()
    jd_url = data.get("jd_url", "").strip()
    generate_cl = data.get("generate_cover_letter", False)

    if not company_name or not job_title:
        raise HTTPException(400, "Company name and job title are required.")
    if not jd_text and not jd_url:
        raise HTTPException(400, "Job description text or URL is required.")

    # Check base resume exists
    base_path = BASE_RESUME_DIR / "resume.tex"
    if not base_path.exists():
        raise HTTPException(400, "No base resume uploaded. Please upload your .tex file first.")

    async def event_stream() -> AsyncGenerator:
        try:
            # --- Stage 1: Input preparation ---
            yield {"event": "progress", "data": json.dumps({
                "stage": "input", "status": "running", "message": "Preparing inputs..."
            })}

            if jd_url and not jd_text:
                try:
                    jd_text_resolved = await fetch_jd_from_url(jd_url)
                except Exception as e:
                    yield {"event": "progress", "data": json.dumps({
                        "stage": "input", "status": "error", "message": str(e)
                    })}
                    yield {"event": "error", "data": json.dumps({"error": str(e)})}
                    return
            else:
                jd_text_resolved = jd_text

            base_tex = base_path.read_text(encoding="utf-8")

            yield {"event": "progress", "data": json.dumps({
                "stage": "input", "status": "done", "message": "Inputs ready."
            })}

            # --- Stage 2: Parse & Analyze ---
            yield {"event": "progress", "data": json.dumps({
                "stage": "parsing", "status": "running", "message": "Parsing resume structure..."
            })}

            parsed_original = parse_resume(base_tex)
            editable_bullets = get_editable_bullets(parsed_original)
            bullet_texts = [b["text"] for b in editable_bullets]
            fingerprint = extract_fingerprint(bullet_texts)

            yield {"event": "progress", "data": json.dumps({
                "stage": "parsing", "status": "done",
                "message": f"Parsed {len(editable_bullets)} editable bullets."
            })}

            # --- Stage 3: Extract JD ---
            yield {"event": "progress", "data": json.dumps({
                "stage": "jd_extraction", "status": "running",
                "message": "Analyzing job description with Gemini..."
            })}

            jd_signals = await extract_jd(jd_text_resolved)

            yield {"event": "progress", "data": json.dumps({
                "stage": "jd_extraction", "status": "done",
                "message": f"Found {len(jd_signals.get('must_have_keywords', []))} must-have keywords."
            })}

            settings = get_settings()
            banned_words = settings.get("banned_words", [])

            # --- Stage 4: Pass 1 — Tailor ---
            yield {"event": "progress", "data": json.dumps({
                "stage": "pass1", "status": "running",
                "message": "Tailoring resume bullets..."
            })}

            tailored_parsed = await pass1_tailor(
                parsed_original, jd_signals, fingerprint, banned_words
            )

            yield {"event": "progress", "data": json.dumps({
                "stage": "pass1", "status": "done", "message": "Pass 1 complete."
            })}

            # --- Stage 5: Pass 2 — Critique ---
            yield {"event": "progress", "data": json.dumps({
                "stage": "pass2", "status": "running",
                "message": "Reviewing for AI-sounding language..."
            })}

            final_parsed = await pass2_critique(tailored_parsed, fingerprint, banned_words)

            yield {"event": "progress", "data": json.dumps({
                "stage": "pass2", "status": "done", "message": "Pass 2 complete."
            })}

            # --- Stage 6: Apply edits to tex ---
            yield {"event": "progress", "data": json.dumps({
                "stage": "applying", "status": "running",
                "message": "Applying changes to LaTeX source..."
            })}

            tailored_tex = apply_edits(base_tex, parsed_original, final_parsed)

            # Output folder
            folder_name = (
                f"{company_name.lower().replace(' ', '_')}_"
                f"{job_title.lower().replace(' ', '_')}"
            )
            output_dir = OUTPUTS_DIR / folder_name
            output_dir.mkdir(parents=True, exist_ok=True)

            # Save tex
            (output_dir / "resume.tex").write_text(tailored_tex, encoding="utf-8")

            yield {"event": "progress", "data": json.dumps({
                "stage": "applying", "status": "done", "message": "Changes applied."
            })}

            # --- Stage 7: Validation ---
            yield {"event": "progress", "data": json.dumps({
                "stage": "validating", "status": "running",
                "message": "Running validation gates..."
            })}

            validation_results = {}

            # Gate 2: Lock guard (run before compilation)
            g2_passed, g2_msg = gate2_lock_guard(base_tex, tailored_tex, parsed_original)
            validation_results["lock_guard"] = {"passed": g2_passed, "message": g2_msg}

            if not g2_passed:
                yield {"event": "progress", "data": json.dumps({
                    "stage": "validating", "status": "warning",
                    "message": f"Lock guard: {g2_msg}"
                })}

            # Gate 4: ATS score
            tailored_bullets = get_editable_bullets(final_parsed)
            tailored_texts = [b["text"] for b in tailored_bullets]
            ats_report = gate4_ats_score(
                bullet_texts, tailored_texts,
                jd_signals.get("must_have_keywords", []),
                jd_signals.get("nice_to_have_keywords", []),
            )
            validation_results["ats_score"] = ats_report

            # Save ATS report
            (output_dir / "ats_report.json").write_text(
                json.dumps(ats_report, indent=2), encoding="utf-8"
            )

            yield {"event": "progress", "data": json.dumps({
                "stage": "validating", "status": "done",
                "message": ats_report["message"]
            })}

            # --- Stage 8: Compile PDF ---
            yield {"event": "progress", "data": json.dumps({
                "stage": "compiling", "status": "running",
                "message": "Compiling LaTeX to PDF..."
            })}

            compile_result = await compile_and_save(tailored_tex, output_dir)
            pdf_compiled = compile_result["error"] is None

            if not pdf_compiled:
                yield {"event": "progress", "data": json.dumps({
                    "stage": "compiling", "status": "warning",
                    "message": f"PDF compilation: {compile_result['error']}"
                })}
            else:
                # Gate 1: One-pager check
                if compile_result["pages"] > 1:
                    yield {"event": "progress", "data": json.dumps({
                        "stage": "compiling", "status": "warning",
                        "message": f"Resume is {compile_result['pages']} pages. Attempting to shorten..."
                    })}

                    async def compile_check(tex):
                        return await compile_latex(tex)

                    tailored_tex, g1_passed, g1_msg = await gate1_one_pager(
                        tailored_tex, compile_check, shorten_bullets, final_parsed
                    )
                    validation_results["one_pager"] = {"passed": g1_passed, "message": g1_msg}

                    if g1_passed:
                        # Recompile and save
                        await compile_and_save(tailored_tex, output_dir)
                        (output_dir / "resume.tex").write_text(tailored_tex, encoding="utf-8")
                else:
                    validation_results["one_pager"] = {"passed": True, "message": "Single page."}

                yield {"event": "progress", "data": json.dumps({
                    "stage": "compiling", "status": "done", "message": "PDF compiled."
                })}

                # Visual diff
                tailored_pdf = output_dir / "resume.pdf"
                if tailored_pdf.exists():
                    try:
                        base_compile = await compile_latex(base_tex)
                        if base_compile["pdf_path"] and Path(base_compile["pdf_path"]).exists():
                            diff_result = generate_visual_diff(
                                base_compile["pdf_path"],
                                str(tailored_pdf),
                                output_dir,
                            )
                    except Exception as e:
                        # Log but don't fail — visual diff is optional
                        yield {"event": "progress", "data": json.dumps({
                            "stage": "compiling", "status": "warning",
                            "message": f"Visual diff generation skipped: {str(e)[:50]}"
                        })}

            # --- Stage 9: Cover letter (if requested) ---
            cover_letter_text = None
            if generate_cl:
                yield {"event": "progress", "data": json.dumps({
                    "stage": "cover_letter", "status": "running",
                    "message": "Generating cover letter..."
                })}

                cover_letter_text = await generate_cover_letter(
                    parsed_original, jd_signals, company_name, job_title,
                    fingerprint, banned_words,
                )

                # Save cover letter as tex and compile
                cl_tex = _cover_letter_to_latex(cover_letter_text, company_name, job_title, parsed_original)
                (output_dir / "cover_letter.tex").write_text(cl_tex, encoding="utf-8")

                if check_pdflatex():
                    await compile_and_save(cl_tex, output_dir, filename="cover_letter")

                yield {"event": "progress", "data": json.dumps({
                    "stage": "cover_letter", "status": "done",
                    "message": "Cover letter generated."
                })}

            # --- Final result ---
            # Build change list
            changes = []
            orig_bullets_map = {b["id"]: b["text"] for b in editable_bullets}
            for b in tailored_bullets:
                orig_text = orig_bullets_map.get(b["id"])
                if orig_text and orig_text != b["text"]:
                    changes.append({
                        "id": b["id"],
                        "original": orig_text,
                        "tailored": b["text"],
                    })

            # Only include image paths that actually exist
            images = {}
            for img_file in ["original.png", "tailored.png", "diff.png"]:
                img_path = output_dir / img_file
                if img_path.exists():
                    key = img_file.replace(".png", "") + "_image"
                    images[key] = f"/api/pdf/{folder_name}/{img_file}"

            result = {
                "folder": folder_name,
                "files": {
                    "tex": f"/api/pdf/{folder_name}/resume.tex",
                    "pdf": f"/api/pdf/{folder_name}/resume.pdf" if pdf_compiled else None,
                    "cover_letter": f"/api/pdf/{folder_name}/cover_letter.pdf" if generate_cl else None,
                },
                "images": images,
                "ats_report": ats_report,
                "validation": validation_results,
                "changes": changes,
                "cover_letter_text": cover_letter_text,
                "jd_signals": jd_signals,
            }

            yield {"event": "complete", "data": json.dumps(result)}

        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_stream())


# --- LaTeX Validation ---

@app.post("/api/validate-latex")
async def validate_latex(request: Request):
    """Validate and compile LaTeX, return detailed error report."""
    data = await request.json()
    tex_content = data.get("tex_content", "")

    if not tex_content:
        raise HTTPException(400, "tex_content is required")

    from backend.latex_validator import validate_and_compile, get_latex_diagnostics, check_chktex_available

    # Get structure diagnostics first
    diagnostics = get_latex_diagnostics(tex_content)

    # Try to compile and validate
    result = await validate_and_compile(tex_content)

    return {
        "diagnostics": diagnostics,
        "chktex_available": check_chktex_available(),
        "chktex": result.get("chktex"),
        "compilation": result.get("compilation"),
        "has_errors": result.get("has_errors", False),
    }


@app.get("/api/validate/{folder}/{filename}")
async def validate_output_file(folder: str, filename: str):
    """Validate a generated resume file."""
    file_path = OUTPUTS_DIR / folder / filename

    if not file_path.exists():
        raise HTTPException(404, "File not found")

    if not filename.endswith(".tex"):
        raise HTTPException(400, "Only .tex files can be validated")

    tex_content = file_path.read_text(encoding="utf-8")

    from backend.latex_validator import validate_and_compile, get_latex_diagnostics

    diagnostics = get_latex_diagnostics(tex_content)
    compile_result = await validate_and_compile(tex_content)

    return {
        "file": filename,
        "diagnostics": diagnostics,
        "compilation": compile_result,
    }


# --- Output browsing ---

@app.get("/api/history")
async def list_history():
    """List all past output folders."""
    folders = []
    if OUTPUTS_DIR.exists():
        for d in sorted(OUTPUTS_DIR.iterdir(), reverse=True):
            if d.is_dir():
                files = [f.name for f in d.iterdir() if f.is_file()]
                folders.append({"name": d.name, "files": files})
    return {"folders": folders}


@app.get("/api/outputs/{folder}")
async def list_output_files(folder: str):
    folder_path = OUTPUTS_DIR / folder
    if not folder_path.exists():
        raise HTTPException(404, "Output folder not found.")
    files = [f.name for f in folder_path.iterdir() if f.is_file()]
    return {"folder": folder, "files": files}


@app.get("/api/pdf/{folder}/{filename}")
async def serve_file(folder: str, filename: str):
    """Serve a file from an output folder."""
    file_path = OUTPUTS_DIR / folder / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found.")

    media_types = {
        ".pdf": "application/pdf",
        ".tex": "text/plain",
        ".png": "image/png",
        ".json": "application/json",
    }
    media_type = media_types.get(file_path.suffix, "application/octet-stream")
    return FileResponse(str(file_path), media_type=media_type)


# --- Helpers ---

def _cover_letter_to_latex(text: str, company: str, job_title: str, parsed_resume: dict) -> str:
    """Wrap cover letter text in a simple LaTeX document."""
    name = parsed_resume.get("header", {}).get("name", "").replace("LOCKED: ", "")
    email = parsed_resume.get("header", {}).get("email", "").replace("LOCKED: ", "")
    phone = parsed_resume.get("header", {}).get("phone", "").replace("LOCKED: ", "")

    # Escape LaTeX special chars in text
    text_escaped = text.replace("&", "\\&").replace("%", "\\%").replace("#", "\\#")
    paragraphs = text_escaped.split("\n\n")
    body = "\n\n".join(p.strip() for p in paragraphs if p.strip())

    return f"""\\documentclass[11pt]{{letter}}
\\usepackage[margin=1in]{{geometry}}
\\usepackage{{parskip}}

\\begin{{document}}

\\begin{{center}}
\\textbf{{\\Large {name}}}\\\\
{email} \\quad {phone}
\\end{{center}}

\\vspace{{1em}}

\\noindent Dear Hiring Manager,

{body}

\\noindent Sincerely,\\\\
{name}

\\end{{document}}
"""
