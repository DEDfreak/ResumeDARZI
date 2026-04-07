# ResumeTailor

A locally-run web application that takes your base LaTeX resume and a job description, then intelligently tailors the resume for that specific role using the Gemini API (free tier). Optionally generates a cover letter.

**Everything runs locally.** Nothing is sent anywhere except to the Gemini API with your own key.

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **pdflatex** (for PDF compilation and visual diff)

### Installing pdflatex

| Platform | Command |
|----------|---------|
| **Windows** | Install [MiKTeX](https://miktex.org/download) or [TeX Live](https://tug.org/texlive/) |
| **macOS** | `brew install --cask mactex-no-gui` or install [MacTeX](https://tug.org/mactex/) |
| **Ubuntu/Debian** | `sudo apt install texlive-latex-base texlive-latex-extra texlive-fonts-recommended` |
| **Fedora** | `sudo dnf install texlive-scheme-basic texlive-latex` |

Verify with: `pdflatex --version`

## Setup

1. **Clone and enter the project:**
   ```bash
   cd resumetailor
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install frontend dependencies:**
   ```bash
   cd frontend && npm install && cd ..
   ```

4. **Get a free Gemini API key:**
   - Go to [Google AI Studio](https://aistudio.google.com/apikey)
   - Create a new API key
   - Add it to `.env`:
     ```
     GEMINI_API_KEY=your_key_here
     ```
   - Or set it in the Settings page after starting the app.

## Start

**Single command:**
```bash
./start.sh
```

Or start services separately:

```bash
# Backend (terminal 1)
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (terminal 2)
cd frontend && npm run dev
```

- **Backend:** http://localhost:8000
- **Frontend:** http://localhost:5173

## How It Works

1. **Upload** your master `.tex` resume (saved to `base_resume/` — never modified)
2. **Paste** a job description and enter company name + job title
3. **Generate** — the app:
   - Parses your LaTeX, identifying editable vs locked zones
   - Analyzes the JD for keywords, tech stack, seniority
   - Fingerprints your writing style
   - **Pass 1:** Tailors resume bullets via Gemini
   - **Pass 2:** Critiques for AI-sounding language, rewrites flagged bullets
   - Validates: one-pager check, lock guard, line-fill, ATS score
   - Compiles to PDF, generates visual diff
4. **Review** the result: ATS score comparison, visual diff, change list, downloads

## Folder Structure

```
resumetailor/
├── backend/           # Python FastAPI backend
│   ├── main.py        # All API routes + SSE streaming
│   ├── latex_parser.py    # Parse .tex into editable/locked zones
│   ├── style_fingerprint.py   # Analyze writing style
│   ├── jd_extractor.py   # Extract JD signals via Gemini
│   ├── gemini_client.py   # Two-pass AI generation
│   ├── validator.py       # 4 validation gates
│   ├── pdf_utils.py       # pdflatex + visual diff
│   ├── cover_letter.py    # Cover letter generation
│   └── config.py          # Settings management
├── frontend/          # React (Vite) frontend
│   └── src/
│       ├── pages/     # Home, Result, Settings
│       └── components/    # PdfDiffViewer, AtsScoreBar, CoverLetterPanel
├── base_resume/       # Your master .tex file (immutable)
├── outputs/           # Generated resumes organized by company_jobtitle/
├── .env               # GEMINI_API_KEY
├── requirements.txt
├── start.sh           # Single-command launcher
└── README.md
```

## Output Structure

Each generation creates a folder in `outputs/`:
```
outputs/stripe_senior_software_engineer/
├── resume.tex          # Tailored LaTeX source
├── resume.pdf          # Compiled PDF
├── cover_letter.pdf    # If requested
├── ats_report.json     # Before/after ATS scores
├── original.png        # Visual diff images
├── tailored.png
└── diff.png
```

## Known Limitations

- Your LaTeX resume must compile cleanly before tailoring. Test with `pdflatex resume.tex` first.
- LinkedIn URLs cannot be auto-fetched (they block scrapers). Paste the JD text directly.
- The visual diff requires `poppler` (`pdf2image` dependency). On Windows, install [poppler for Windows](https://github.com/oschwartz10612/poppler-windows/releases) and add to PATH.
- Uses `gemini-1.5-flash` (free tier) exclusively. Rate limits may apply with heavy use.

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload-resume` | Upload .tex file |
| POST | `/api/generate` | Main generation (SSE stream) |
| GET | `/api/outputs/{folder}` | List output files |
| GET | `/api/pdf/{folder}/{file}` | Serve output file |
| GET | `/api/settings` | Get settings |
| POST | `/api/settings` | Save settings |
| GET | `/api/history` | List past outputs |
| GET | `/api/health` | Health check |
