"""
Validate LaTeX using ChkTeX.
"""

import asyncio
import re
import tempfile
import shutil
from pathlib import Path


def check_chktex_available() -> bool:
    """Check if chktex is available."""
    return shutil.which("chktex") is not None


async def run_chktex(tex_content: str) -> dict:
    """
    Run ChkTeX on LaTeX content and return structured errors.
    """
    if not check_chktex_available():
        return {
            "available": False,
            "error": "ChkTeX not installed. Install with: choco install chktex (Windows) or apt install chktex (Linux)",
        }

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_file = Path(tmpdir) / "resume.tex"
        tex_file.write_text(tex_content, encoding="utf-8")

        proc = await asyncio.create_subprocess_exec(
            "chktex", "-q", str(tex_file),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        output = stdout.decode("utf-8", errors="replace")

        errors = parse_chktex_output(output)

        return {
            "available": True,
            "errors": errors,
            "raw_output": output,
            "error_count": len(errors),
        }


def parse_chktex_output(output: str) -> list[dict]:
    """
    Parse ChkTeX output.
    Format: "file.tex:123:45: Warning/Error 123 Message"
    """
    errors = []

    for line in output.strip().split("\n"):
        if not line.strip():
            continue

        # Pattern: file.tex:line:col: Type number message
        match = re.match(r'([^:]+):(\d+):(\d+):\s*(\w+)\s*(\d+)\s*(.*)', line)
        if match:
            file, line_num, col, level, code, message = match.groups()
            errors.append({
                "line": int(line_num),
                "column": int(col),
                "level": level.lower(),  # warning or error
                "code": code,
                "message": message.strip(),
            })

    return errors


async def validate_and_compile(tex_content: str, output_dir: Path = None) -> dict:
    """
    Compile LaTeX and return error report using both ChkTeX and pdflatex.
    """
    from backend.pdf_utils import compile_latex

    # Run ChkTeX first (fast, no compilation needed)
    chktex_result = await run_chktex(tex_content)

    # Try to compile with pdflatex
    compile_result = await compile_latex(tex_content, output_dir)

    return {
        "chktex": chktex_result,
        "compilation": {
            "valid": compile_result["error"] is None,
            "error": compile_result["error"],
            "pdf_path": compile_result.get("pdf_path"),
            "pages": compile_result.get("pages"),
        },
        "has_errors": (
            chktex_result.get("available", True) and
            (chktex_result.get("error_count", 0) > 0 or compile_result["error"])
        ),
    }


def get_latex_diagnostics(tex_content: str) -> dict:
    """Get basic diagnostics about LaTeX structure."""
    # Count structures
    section_count = len(re.findall(r'\\(?:section|resheading)', tex_content))
    item_count = len(re.findall(r'\\item\s', tex_content))
    itemize_count = len(re.findall(r'\\begin\{itemize\}', tex_content))

    # Check for obvious corruption
    corrupted_setlength = len(re.findall(r'\\setlength\\item(?!sep)', tex_content))
    unmatched_begin = len(re.findall(r'\\begin\{', tex_content)) - len(re.findall(r'\\end\{', tex_content))

    return {
        "sections": section_count,
        "itemize_blocks": itemize_count,
        "items": item_count,
        "chktex_available": check_chktex_available(),
        "structure_issues": {
            "corrupted_setlength": corrupted_setlength,
            "unmatched_begin_end": abs(unmatched_begin),
        },
    }
