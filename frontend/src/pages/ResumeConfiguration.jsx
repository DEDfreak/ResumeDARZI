import { useState, useEffect, useCallback } from 'react';

function cleanLocked(str) {
  return typeof str === 'string' ? str.replace(/^LOCKED:\s*/, '') : str;
}

function StatusBadge({ status, onToggle }) {
  const isLocked = status === 'LOCKED';
  return (
    <button
      className={`lock-badge ${isLocked ? 'lock-badge-locked' : 'lock-badge-edit'}`}
      onClick={onToggle}
      title={isLocked ? 'Click to make editable' : 'Click to lock'}
    >
      {isLocked ? '🔒 Locked' : '✏️ Editable'}
    </button>
  );
}

function BulletRow({ bullet, override, onToggle }) {
  const effective = override ?? bullet.status;
  return (
    <div className={`bullet-row ${effective === 'LOCKED' ? 'bullet-row-locked' : ''}`}>
      <StatusBadge status={effective} onToggle={onToggle} />
      <span className="bullet-text">{cleanLocked(bullet.text)}</span>
    </div>
  );
}

export default function ResumeConfiguration() {
  const [resumes, setResumes] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [parsed, setParsed] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [bulletOverrides, setBulletOverrides] = useState({});
  const [skillOverrides, setSkillOverrides] = useState({});
  const [summaryOverride, setSummaryOverride] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState('');

  // Load resume list
  useEffect(() => {
    fetch('/api/resumes')
      .then(r => r.json())
      .then(data => {
        setResumes(data);
        // Also try to pick the active one
        return fetch('/api/active-resume').then(r => r.json()).then(active => {
          if (active.slug && data.find(r => r.slug === active.slug)) {
            setSelectedSlug(active.slug);
          } else if (data.length > 0) {
            setSelectedSlug(data[0].slug);
          }
        });
      })
      .catch(() => setError('Failed to load resumes.'));
  }, []);

  // Load parsed + prefs when slug changes
  useEffect(() => {
    if (!selectedSlug) return;
    setLoading(true);
    setError('');
    setSaved(false);
    setExpanded(true);
    Promise.all([
      fetch(`/api/resumes/${selectedSlug}/parsed`).then(r => r.json()),
      fetch(`/api/resumes/${selectedSlug}/preferences`).then(r => r.json()),
    ])
      .then(([parsedData, prefs]) => {
        if (parsedData.detail) {
          setError(parsedData.detail);
        } else {
          setParsed(parsedData);
          const defaultName = selectedSlug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          setDisplayName(prefs.display_name || defaultName);
          setBulletOverrides(prefs.bullets || {});
          setSkillOverrides(prefs.skill_categories || {});
          setSummaryOverride(prefs.summary || null);
        }
      })
      .catch(() => setError('Failed to load resume data.'))
      .finally(() => setLoading(false));
  }, [selectedSlug]);

  const toggleBullet = useCallback((id, currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setBulletOverrides(prev => {
      const updated = { ...prev };
      if (next === defaultStatus) delete updated[id];
      else updated[id] = next;
      return updated;
    });
    setSaved(false);
  }, []);

  const toggleSkill = useCallback((cat, currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setSkillOverrides(prev => {
      const updated = { ...prev };
      if (next === defaultStatus) delete updated[cat];
      else updated[cat] = next;
      return updated;
    });
    setSaved(false);
  }, []);

  const toggleSummary = useCallback((currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setSummaryOverride(next === defaultStatus ? null : next);
    setSaved(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const resp = await fetch(`/api/resumes/${selectedSlug}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          bullets: bulletOverrides,
          skill_categories: skillOverrides,
          summary: summaryOverride,
        }),
      });
      if (!resp.ok) throw new Error('Save failed');
      // Update the display name in the resume list
      setResumes(prev => prev.map(r =>
        r.slug === selectedSlug ? { ...r, display_name: displayName } : r
      ));
      setSaved(true);
      setExpanded(false);
    } catch {
      setError('Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setBulletOverrides({});
    setSkillOverrides({});
    setSummaryOverride(null);
    setSaved(false);
  };

  const sections = parsed?.sections || [];
  const header = parsed?.header || {};

  const totalBullets = sections.reduce((acc, sec) => {
    if (sec.type === 'experience') return acc + sec.entries.reduce((a, e) => a + e.bullets.length, 0);
    if (sec.type === 'projects') return acc + sec.projects.reduce((a, p) => a + p.bullets.length, 0);
    return acc;
  }, 0);

  const overrideCount = Object.keys(bulletOverrides).length + Object.keys(skillOverrides).length
    + (summaryOverride !== null ? 1 : 0);
  const lockedCount = Object.values(bulletOverrides).filter(v => v === 'LOCKED').length
    + Object.values(skillOverrides).filter(v => v === 'LOCKED').length
    + (summaryOverride === 'LOCKED' ? 1 : 0);

  return (
    <div>
      <div className="page-header">
        <h2>Resume Configuration</h2>
        <p>Configure lock/edit preferences for each resume. Locked bullets are never changed by AI.</p>
      </div>

      {error && <div className="message message-error">{error}</div>}

      {/* Resume selector */}
      <div className="card">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Select Resume</label>
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #d2d2d7',
              borderRadius: 8,
              fontSize: 14,
              background: '#fafafa',
              fontFamily: 'inherit',
            }}
          >
            {resumes.length === 0 && <option value="">No resumes available</option>}
            {resumes.map(r => (
              <option key={r.slug} value={r.slug}>{r.display_name} ({r.filename})</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="empty-state"><p>Loading resume...</p></div>
      )}

      {!loading && selectedSlug && parsed && (
        <>
          {/* Summary card — always visible */}
          <div className="card">
            <div className="resume-meta">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }}
                  placeholder="Display name"
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    border: '1px solid #d2d2d7',
                    borderRadius: 8,
                    padding: '6px 12px',
                    flex: 1,
                    background: '#fafafa',
                  }}
                />
              </div>
              <div className="resume-meta-details">
                {[cleanLocked(header.name), cleanLocked(header.email), cleanLocked(header.phone)]
                  .filter(Boolean).join(' · ')}
              </div>
              <div className="resume-meta-stats">
                <span className="meta-stat">{sections.length} sections</span>
                <span className="meta-stat">{totalBullets} bullets</span>
                {lockedCount > 0 && (
                  <span className="meta-stat meta-stat-locked">{lockedCount} user-locked</span>
                )}
              </div>
            </div>

            <div className="prefs-actions">
              {expanded ? (
                <>
                  <button className="btn btn-secondary" onClick={resetAll}>Reset All</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Preferences'}
                  </button>
                </>
              ) : (
                <button className="btn btn-secondary" onClick={() => setExpanded(true)}>
                  Edit Preferences
                </button>
              )}
            </div>
          </div>

          {/* Collapsible sections */}
          {expanded && sections.map((sec, si) => {
            if (sec.type === 'experience') {
              return (
                <div key={si} className="card">
                  <h3 className="section-title">Work Experience</h3>
                  {sec.entries.map((entry, ei) => (
                    <div key={ei} className="exp-entry">
                      <div className="exp-header">
                        <span className="exp-company">{cleanLocked(entry.company)}</span>
                        <span className="exp-title">{cleanLocked(entry.title)}</span>
                        <span className="exp-dates">{cleanLocked(entry.dates)}</span>
                      </div>
                      <div className="bullets-list">
                        {entry.bullets.map((b) => (
                          <BulletRow
                            key={b.id}
                            bullet={b}
                            override={bulletOverrides[b.id] ?? null}
                            onToggle={() => toggleBullet(b.id, bulletOverrides[b.id] ?? b.status, b.status)}
                          />
                        ))}
                      </div>
                      {cleanLocked(entry.tech_stack) && (
                        <div className="tech-stack-row">
                          <span className="tech-stack-label">Tech Stack</span>
                          <span className="tech-stack-items">{cleanLocked(entry.tech_stack)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            }

            if (sec.type === 'projects') {
              return (
                <div key={si} className="card">
                  <h3 className="section-title">Projects</h3>
                  {sec.projects.map((proj, pi) => (
                    <div key={pi} className="exp-entry">
                      <div className="exp-header">
                        <span className="exp-company">{cleanLocked(proj.name)}</span>
                        {proj.dates && <span className="exp-dates">{cleanLocked(proj.dates)}</span>}
                      </div>
                      <div className="bullets-list">
                        {proj.bullets.map((b) => (
                          <BulletRow
                            key={b.id}
                            bullet={b}
                            override={bulletOverrides[b.id] ?? null}
                            onToggle={() => toggleBullet(b.id, bulletOverrides[b.id] ?? b.status, b.status)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            if (sec.type === 'skills') {
              return (
                <div key={si} className="card">
                  <h3 className="section-title">Skills</h3>
                  <div className="bullets-list">
                    {sec.skills.map((skill, ski) => {
                      const cat = cleanLocked(skill.category);
                      const effective = skillOverrides[cat] ?? skill.status;
                      return (
                        <div key={ski} className={`bullet-row ${effective === 'LOCKED' ? 'bullet-row-locked' : ''}`}>
                          <StatusBadge
                            status={effective}
                            onToggle={() => toggleSkill(cat, effective, skill.status)}
                          />
                          <span className="bullet-text">
                            {cat && <strong>{cat}: </strong>}
                            {skill.items}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (sec.type === 'summary') {
              const defaultSummaryStatus = sec.status ?? 'EDITABLE';
              const effective = summaryOverride ?? defaultSummaryStatus;
              return (
                <div key={si} className="card">
                  <h3 className="section-title">Summary</h3>
                  <div className={`bullet-row ${effective === 'LOCKED' ? 'bullet-row-locked' : ''}`}>
                    <StatusBadge
                      status={effective}
                      onToggle={() => toggleSummary(effective, defaultSummaryStatus)}
                    />
                    <span className="bullet-text">{sec.text}</span>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Floating save bar */}
          {expanded && !saved && overrideCount > 0 && (
            <div className="save-bar">
              <span>{overrideCount} preference{overrideCount !== 1 ? 's' : ''} changed</span>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
