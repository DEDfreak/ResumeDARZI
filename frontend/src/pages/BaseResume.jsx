import { useState, useEffect, useRef } from 'react';

export default function BaseResume() {
  const [resumes, setResumes] = useState([]);
  const [activeSlug, setActiveSlug] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploadTab, setUploadTab] = useState('file');
  const [pasteCode, setPasteCode] = useState('');
  const fileInputRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [resumesResp, activeResp] = await Promise.all([
        fetch('/api/resumes').then(r => r.json()),
        fetch('/api/active-resume').then(r => r.json()),
      ]);
      setResumes(resumesResp);
      setActiveSlug(activeResp.slug);
    } catch {
      setError('Failed to load resumes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleUpload = async (file) => {
    if (!file || !file.name.endsWith('.tex')) {
      setError('Please upload a .tex file.');
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const resp = await fetch('/api/resumes/upload', { method: 'POST', body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Upload failed');
      setResumes(prev => {
        const exists = prev.find(r => r.slug === data.slug);
        return exists ? prev.map(r => r.slug === data.slug ? data : r) : [...prev, data];
      });
      setSuccess(`Uploaded "${data.display_name}" successfully.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSetActive = async (slug) => {
    setError('');
    setSuccess('');
    try {
      const resp = await fetch('/api/active-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (!resp.ok) throw new Error('Failed to set active resume');
      setActiveSlug(slug);
      const r = resumes.find(r => r.slug === slug);
      setSuccess(`"${r?.display_name || slug}" is now the active resume.`);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (slug) => {
    const r = resumes.find(r => r.slug === slug);
    if (!window.confirm(`Delete "${r?.display_name || slug}"? This cannot be undone.`)) return;
    setError('');
    setSuccess('');
    try {
      const resp = await fetch(`/api/resumes/${slug}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Delete failed');
      setResumes(prev => prev.filter(r => r.slug !== slug));
      if (activeSlug === slug) setActiveSlug(null);
      setSuccess(`Deleted "${r?.display_name || slug}".`);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handlePasteSave = async () => {
    if (!pasteCode.trim()) {
      setError('Please paste some LaTeX code first.');
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    const blob = new Blob([pasteCode], { type: 'text/plain' });
    const file = new File([blob], 'resume.tex', { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', file);
    try {
      const resp = await fetch('/api/resumes/upload', { method: 'POST', body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Upload failed');
      await fetchAll();
      setSuccess(`Saved "${data.display_name}" successfully.`);
      setPasteCode('');
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Base Resumes</h2>
        <p>Upload and manage your LaTeX resume files. Set one as active for tailoring.</p>
      </div>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      {/* Upload area */}
      <div className="card">
        <h3>Upload Resume</h3>
        <div className="tab-bar">
          <button
            className={`tab-btn${uploadTab === 'file' ? ' active' : ''}`}
            onClick={() => setUploadTab('file')}
          >
            Upload File
          </button>
          <button
            className={`tab-btn${uploadTab === 'paste' ? ' active' : ''}`}
            onClick={() => setUploadTab('paste')}
          >
            Paste Code
          </button>
        </div>

        {uploadTab === 'file' ? (
          <>
            <div
              className={`upload-area${dragOver ? ' drag-over' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
            >
              {uploading ? (
                <p>Uploading...</p>
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
              onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0])}
            />
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Choose File'}
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              value={pasteCode}
              onChange={(e) => setPasteCode(e.target.value)}
              placeholder="Paste your LaTeX resume code here..."
              rows={12}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 12,
                padding: '10px',
                border: '1px solid #d2d2d7',
                borderRadius: 8,
                resize: 'vertical',
                background: '#fafafa',
                boxSizing: 'border-box',
                marginTop: 8,
              }}
            />
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button
                className="btn btn-primary"
                onClick={handlePasteSave}
                disabled={uploading}
              >
                {uploading ? 'Saving...' : 'Save Resume'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Resume list */}
      <div className="card">
        <h3>Your Resumes</h3>
        {loading ? (
          <p style={{ color: '#86868b', fontSize: 14 }}>Loading...</p>
        ) : resumes.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <p>No resumes uploaded yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resumes.map((r) => {
              const isActive = r.slug === activeSlug;
              return (
                <div
                  key={r.slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: isActive ? '1.5px solid #0071e3' : '1px solid #e5e5ea',
                    background: isActive ? 'rgba(0,113,227,0.03)' : '#fafafa',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.display_name}
                      {isActive && (
                        <span className="meta-stat" style={{ background: 'rgba(0,113,227,0.1)', color: '#0071e3', fontSize: 11 }}>
                          Active
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#86868b', marginTop: 2 }}>
                      {r.filename} · {r.bullet_count} bullets
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {!isActive && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '6px 14px' }}
                        onClick={() => handleSetActive(r.slug)}
                      >
                        Set as Active
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '6px 14px', color: '#ff3b30', borderColor: 'rgba(255,59,48,0.3)' }}
                      onClick={() => handleDelete(r.slug)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
