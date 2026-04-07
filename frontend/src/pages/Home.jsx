import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STAGES = [
  { key: 'input', label: 'Preparing inputs' },
  { key: 'parsing', label: 'Parsing resume' },
  { key: 'jd_extraction', label: 'Analyzing job description' },
  { key: 'pass1', label: 'Tailoring resume (Pass 1)' },
  { key: 'pass2', label: 'Humanness review (Pass 2)' },
  { key: 'applying', label: 'Applying changes' },
  { key: 'validating', label: 'Validation gates' },
  { key: 'compiling', label: 'Compiling PDF' },
  { key: 'cover_letter', label: 'Cover letter' },
];

export default function Home() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [resumeFile, setResumeFile] = useState(null);
  const [resumeInfo, setResumeInfo] = useState(null);
  const [resumeMode, setResumeMode] = useState('file'); // 'file' or 'paste'
  const [pastedLatex, setPastedLatex] = useState('');
  const [jdText, setJdText] = useState('');
  const [jdUrl, setJdUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [generateCL, setGenerateCL] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');

  // Check if base resume already exists
  useEffect(() => {
    fetch('/api/base-resume')
      .then(r => r.json())
      .then(data => {
        if (data.exists) {
          setResumeInfo(data);
          setResumeFile({ name: data.filename });
        }
      })
      .catch(() => {});
  }, []);

  const handleFileUpload = async (file) => {
    if (!file || !file.name.endsWith('.tex')) {
      setError('Please upload a .tex file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await fetch('/api/upload-resume', { method: 'POST', body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Upload failed');

      setResumeFile(file);
      setResumeInfo(data);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handlePasteLatex = async () => {
    if (!pastedLatex.trim()) {
      setError('Please paste LaTeX code.');
      return;
    }

    const formData = new FormData();
    const blob = new Blob([pastedLatex], { type: 'text/plain' });
    const file = new File([blob], 'resume.tex', { type: 'text/plain' });
    formData.append('file', file);

    try {
      const resp = await fetch('/api/upload-resume', { method: 'POST', body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Upload failed');

      setResumeFile({ name: 'resume.tex (pasted)' });
      setResumeInfo(data);
      setError('');
      setResumeMode('file');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleGenerate = async () => {
    if (!resumeFile) return setError('Please upload your resume first.');
    if (!companyName.trim()) return setError('Company name is required.');
    if (!jobTitle.trim()) return setError('Job title is required.');
    if (!jdText.trim() && !jdUrl.trim()) return setError('Please provide a job description.');

    setIsGenerating(true);
    setProgress({});
    setError('');

    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          job_title: jobTitle,
          jd_text: jdText,
          jd_url: jdUrl,
          generate_cover_letter: generateCL,
        }),
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEData(data);
            } catch {}
          } else if (line.startsWith('event: ')) {
            // Event type is handled in the data
          }
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSSEData = (data) => {
    if (data.stage) {
      setProgress(prev => ({
        ...prev,
        [data.stage]: { status: data.status, message: data.message },
      }));
    }

    if (data.error) {
      setError(data.error);
      setIsGenerating(false);
    }

    // Check if this is the complete result
    if (data.folder) {
      localStorage.setItem('lastResult', JSON.stringify(data));
      navigate('/result');
    }
  };

  const canGenerate = resumeFile && companyName.trim() && jobTitle.trim() && (jdText.trim() || jdUrl.trim());
  const canPaste = pastedLatex.trim().length > 0;

  return (
    <div>
      <div className="page-header">
        <h2>Tailor Your Resume</h2>
        <p>Upload your LaTeX resume and paste a job description to get started.</p>
      </div>

      {error && <div className="message message-error">{error}</div>}

      <div className="two-col">
        {/* Left: Resume upload / paste */}
        <div className="card">
          <h3>Base Resume</h3>
          <div className="tab-bar" style={{ marginBottom: 16 }}>
            <button
              className={resumeMode === 'file' ? 'active' : ''}
              onClick={() => setResumeMode('file')}
            >
              Upload File
            </button>
            <button
              className={resumeMode === 'paste' ? 'active' : ''}
              onClick={() => setResumeMode('paste')}
            >
              Paste Code
            </button>
          </div>

          {resumeMode === 'file' ? (
            <>
              <div
                className={`upload-area ${resumeFile ? 'has-file' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                {resumeFile ? (
                  <>
                    <p className="filename">{resumeFile.name}</p>
                    {resumeInfo && (
                      <p>{resumeInfo.sections || resumeInfo.editable_bullets} sections, {resumeInfo.editable_bullets} editable bullets</p>
                    )}
                    <p style={{ marginTop: 8 }}>Click to replace</p>
                  </>
                ) : (
                  <>
                    <p>Drag & drop your .tex file here</p>
                    <p>or click to browse</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".tex"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
              />
            </>
          ) : (
            <>
              <div className="form-group">
                <label>LaTeX Code</label>
                <textarea
                  rows={10}
                  value={pastedLatex}
                  onChange={(e) => setPastedLatex(e.target.value)}
                  placeholder="\documentclass{article}&#10;\begin{document}&#10;..."
                  style={{
                    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontSize: 12,
                  }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handlePasteLatex}
                disabled={!canPaste}
                style={{ width: '100%' }}
              >
                Save LaTeX Resume
              </button>
            </>
          )}
        </div>

        {/* Right: Job description */}
        <div className="card">
          <h3>Job Description</h3>
          <div className="form-group">
            <label>Job Description Text</label>
            <textarea
              rows={8}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full job description here..."
            />
          </div>
          <div className="form-group">
            <label>Or URL (optional)</label>
            <input
              type="url"
              value={jdUrl}
              onChange={(e) => setJdUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      {/* Company + Job Title */}
      <div className="card">
        <div className="two-col-narrow">
          <div className="form-group">
            <label>Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Stripe"
            />
          </div>
          <div className="form-group">
            <label>Job Title</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <div className="toggle-wrapper">
            <input
              type="checkbox"
              className="toggle"
              checked={generateCL}
              onChange={(e) => setGenerateCL(e.target.checked)}
            />
            <span style={{ fontSize: 14 }}>Generate cover letter</span>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate Tailored Resume'}
          </button>
        </div>
      </div>

      {/* Progress */}
      {isGenerating && (
        <div className="card">
          <h3>Progress</h3>
          <div className="progress-container">
            {STAGES.map(({ key, label }) => {
              const stage = progress[key];
              const status = stage?.status || 'pending';
              return (
                <div key={key} className="progress-step">
                  <div className={`dot ${status}`} />
                  <span className={`label ${status !== 'pending' ? 'active' : ''}`}>
                    {label}
                    {stage?.message && status !== 'pending' && (
                      <span style={{ color: '#86868b', marginLeft: 8 }}>
                        — {stage.message}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
