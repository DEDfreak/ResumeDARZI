import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

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

const SELECT_STYLE = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #d2d2d7',
  borderRadius: 8,
  fontSize: 14,
  background: '#fafafa',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

export default function Home() {
  const navigate = useNavigate();

  const [resumes, setResumes] = useState([]);
  const [activeSlug, setActiveSlug] = useState(null);
  const [activeConfigId, setActiveConfigId] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [jdText, setJdText] = useState('');
  const [jdUrl, setJdUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [generateCL, setGenerateCL] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState('');

  // Load resumes and active state
  useEffect(() => {
    Promise.all([
      fetch('/api/resumes').then(r => r.json()),
      fetch('/api/active-resume').then(r => r.json()),
    ])
      .then(([resumeList, activeData]) => {
        setResumes(resumeList);
        const slug = activeData.slug || resumeList[0]?.slug || null;
        setActiveSlug(slug);
        setActiveConfigId(activeData.config_id || null);
      })
      .catch(() => setError('Failed to load resumes.'))
      .finally(() => setLoadingResumes(false));
  }, []);

  // Load configs when active slug changes
  useEffect(() => {
    if (!activeSlug) { setConfigs([]); return; }
    setLoadingConfigs(true);
    fetch(`/api/resumes/${activeSlug}/configurations`)
      .then(r => r.json())
      .then(list => setConfigs(list))
      .catch(() => setConfigs([]))
      .finally(() => setLoadingConfigs(false));
  }, [activeSlug]);

  const handleResumeChange = async (slug) => {
    setActiveSlug(slug);
    setActiveConfigId(null);
    setError('');
    try {
      await fetch('/api/active-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, config_id: null }),
      });
    } catch {
      setError('Failed to set active resume.');
    }
  };

  const handleConfigChange = async (configId) => {
    setActiveConfigId(configId || null);
    setError('');
    try {
      await fetch('/api/active-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: activeSlug, config_id: configId || null }),
      });
    } catch {
      setError('Failed to set active configuration.');
    }
  };

  const handleGenerate = async () => {
    if (!activeSlug) return setError('Please select a base resume first.');
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
            // eslint-disable-next-line no-empty
            } catch {}
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
    if (data.folder) {
      localStorage.setItem('lastResult', JSON.stringify(data));
      navigate('/result');
    }
  };

  const activeResume = resumes.find(r => r.slug === activeSlug);
  const activeConfig = configs.find(c => c.id === activeConfigId);
  const canGenerate = activeSlug && companyName.trim() && jobTitle.trim() && (jdText.trim() || jdUrl.trim());

  return (
    <div>
      <div className="page-header">
        <h2>Tailor Your Resume</h2>
        <p>Select a resume and configuration, then paste a job description to get started.</p>
      </div>

      {error && <div className="message message-error">{error}</div>}

      <div className="two-col">
        {/* Left: Resume + Config selector */}
        <div className="card">
          <h3>Base Resume</h3>
          {loadingResumes ? (
            <p style={{ color: '#86868b', fontSize: 14 }}>Loading resumes...</p>
          ) : resumes.length === 0 ? (
            <div>
              <div className="message message-warning" style={{ marginBottom: 12 }}>
                No resumes uploaded yet.
              </div>
              <Link to="/base-resume" className="btn btn-primary" style={{ display: 'inline-flex' }}>
                Upload a Resume
              </Link>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Resume</label>
                <select value={activeSlug || ''} onChange={(e) => handleResumeChange(e.target.value)} style={SELECT_STYLE}>
                  {resumes.map(r => (
                    <option key={r.slug} value={r.slug}>
                      {r.display_name} — {r.bullet_count} bullets
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Configuration</label>
                {loadingConfigs ? (
                  <p style={{ fontSize: 13, color: '#86868b', margin: 0 }}>Loading configurations...</p>
                ) : configs.length === 0 ? (
                  <div>
                    <p style={{ fontSize: 13, color: '#86868b', margin: '0 0 6px' }}>
                      No configurations yet — all bullets will be editable.
                    </p>
                    <Link
                      to={`/resume-configuration?slug=${activeSlug}`}
                      style={{ fontSize: 13, color: '#0071e3' }}
                    >
                      Create a configuration →
                    </Link>
                  </div>
                ) : (
                  <select
                    value={activeConfigId || ''}
                    onChange={(e) => handleConfigChange(e.target.value)}
                    style={SELECT_STYLE}
                  >
                    <option value="">— No configuration (all editable) —</option>
                    {configs.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.locked_count > 0 ? ` (${c.locked_count} locked)` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {activeResume && (
                <p style={{ fontSize: 12, color: '#86868b' }}>
                  {activeResume.filename} · {activeResume.bullet_count} bullets
                  {activeConfig && ` · config: ${activeConfig.name}`}
                  {' · '}
                  <Link to={`/resume-configuration?slug=${activeSlug}`} style={{ color: '#0071e3' }}>
                    Manage configurations →
                  </Link>
                </p>
              )}
              <p style={{ fontSize: 12, color: '#86868b', marginTop: 6 }}>
                <Link to="/base-resume" style={{ color: '#0071e3' }}>
                  Manage resumes →
                </Link>
              </p>
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
