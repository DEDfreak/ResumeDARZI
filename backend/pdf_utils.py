"""
PDF compilation with pdflatex, pdf-to-image conversion, and visual diff generation.
"""

import asyncio
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from PIL import Image


def check_pdflatex() -> bool:
    """Check if pdflatex is available in PATH."""
    return shutil.which("pdflatex") is not None


async def compile_latex(tex_content: str, output_dir: Optional[Path] = None) -> dict:
    """
    Compile LaTeX to PDF using pdflatex in a temp directory.
    Returns dict with: pdf_path, pages, error.
    """
    if not check_pdflatex():
        return {
            "pdf_path": None,
            "pages": 0,
            "error": "pdflatex not found. Install a LaTeX distribution (TeX Live, MiKTeX, or MacTeX).",
        }

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "resume.tex"
        tex_path.write_text(tex_content, encoding="utf-8")

        # Run pdflatex twice for references
        for _ in range(2):
            proc = await asyncio.create_subprocess_exec(
                "pdflatex",
                "-interaction=nonstopmode",
                "-output-directory", tmpdir,
                str(tex_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

        pdf_path = Path(tmpdir) / "resume.pdf"
        if not pdf_path.exists():
            log_path = Path(tmpdir) / "resume.log"
            error_msg = ""
            if log_path.exists():
                log_text = log_path.read_text(encoding="utf-8", errors="replace")
                # Extract error lines
                error_lines = [l for l in log_text.split('\n') if l.startswith('!')]
                error_msg = "\n".join(error_lines[:5]) if error_lines else "Unknown compilation error"
            return {"pdf_path": None, "pages": 0, "error": error_msg or "PDF not generated"}

        # Count pages
        pages = count_pdf_pages(pdf_path)

        # Copy PDF to output dir if specified
        final_path = pdf_path
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            final_path = output_dir / "resume.pdf"
            shutil.copy2(pdf_path, final_path)

        return {"pdf_path": str(final_path), "pages": pages, "error": None}


def count_pdf_pages(pdf_path: Path) -> int:
    """Count pages in a PDF by reading the binary content."""
    try:
        content = pdf_path.read_bytes()
        # Simple approach: count /Type /Page entries (not /Pages)
        import re
        pages = len(re.findall(rb'/Type\s*/Page(?!s)', content))
        return max(pages, 1)
    except Exception:
        return 1


def pdf_to_image(pdf_path: str | Path) -> Optional[Image.Image]:
    """Convert first page of PDF to PIL Image."""
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(str(pdf_path), first_page=1, last_page=1, dpi=200)
        return images[0] if images else None
    except ImportError:
        return None
    except Exception:
        return None


def generate_visual_diff(
    original_pdf: str | Path,
    tailored_pdf: str | Path,
    output_dir: Path,
    diff_threshold: int = 10,
) -> dict:
    """
    Generate a visual diff between two PDFs.
    Returns paths to original image, tailored image, and diff image.
    """
    orig_img = pdf_to_image(original_pdf)
    tail_img = pdf_to_image(tailored_pdf)

    result = {
        "original_image": None,
        "tailored_image": None,
        "diff_image": None,
        "error": None,
    }

    if not orig_img or not tail_img:
        result["error"] = "Could not convert PDFs to images. Ensure pdf2image and poppler are installed."
        return result

    output_dir.mkdir(parents=True, exist_ok=True)

    # Save original and tailored images
    orig_path = output_dir / "original.png"
    tail_path = output_dir / "tailored.png"
    diff_path = output_dir / "diff.png"

    orig_img.save(str(orig_path))
    tail_img.save(str(tail_path))

    result["original_image"] = str(orig_path)
    result["tailored_image"] = str(tail_path)

    # Generate diff image
    try:
        import numpy as np

        # Resize to same dimensions
        width = max(orig_img.width, tail_img.width)
        height = max(orig_img.height, tail_img.height)
        orig_resized = orig_img.resize((width, height))
        tail_resized = tail_img.resize((width, height))

        orig_arr = np.array(orig_resized.convert("RGB")).astype(float)
        tail_arr = np.array(tail_resized.convert("RGB")).astype(float)

        # Compute absolute difference
        diff = np.abs(orig_arr - tail_arr)
        diff_magnitude = diff.mean(axis=2)

        # Create overlay: start with tailored image, highlight changes in amber
        overlay = np.array(tail_resized.convert("RGBA")).copy()

        # Where difference exceeds threshold, add amber highlight
        changed_mask = diff_magnitude > diff_threshold
        overlay[changed_mask, 0] = np.clip(overlay[changed_mask, 0].astype(float) * 0.5 + 255 * 0.5, 0, 255)
        overlay[changed_mask, 1] = np.clip(overlay[changed_mask, 1].astype(float) * 0.5 + 200 * 0.5, 0, 255)
        overlay[changed_mask, 2] = np.clip(overlay[changed_mask, 2].astype(float) * 0.3, 0, 255)

        diff_img = Image.fromarray(overlay.astype(np.uint8))
        diff_img.save(str(diff_path))
        result["diff_image"] = str(diff_path)

    except ImportError:
        result["error"] = "numpy not available — diff overlay could not be generated."
    except Exception as e:
        result["error"] = f"Diff generation error: {e}"

    return result


async def compile_and_save(tex_content: str, output_dir: Path, filename: str = "resume") -> dict:
    """Compile LaTeX and save to the output directory."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Save .tex file
    tex_path = output_dir / f"{filename}.tex"
    tex_path.write_text(tex_content, encoding="utf-8")

    # Compile to PDF
    result = await compile_latex(tex_content, output_dir)

    if result["pdf_path"] and output_dir:
        # Ensure PDF is in output dir with correct name
        pdf_path = Path(result["pdf_path"])
        target = output_dir / f"{filename}.pdf"
        if pdf_path != target and pdf_path.exists():
            shutil.copy2(pdf_path, target)
            result["pdf_path"] = str(target)

    return result
