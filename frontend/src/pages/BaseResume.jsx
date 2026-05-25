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

export default function BaseResume() {
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Override maps — only user deviations from default
  const [bulletOverrides, setBulletOverrides] = useState({});
  const [skillOverrides, setSkillOverrides] = useState({});
  const [summaryOverride, setSummaryOverride] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/base-resume/parsed').then(r => r.json()),
      fetch('/api/base-resume/preferences').then(r => r.json()),
    ])
      .then(([parsedData, prefs]) => {
        if (parsedData.detail) {
          setError(parsedData.detail);
        } else {
          setParsed(parsedData);
          setBulletOverrides(prefs.bullets || {});
          setSkillOverrides(prefs.skill_categories || {});
          setSummaryOverride(prefs.summary || null);
        }
      })
      .catch(() => setError('Failed to load resume data.'))
      .finally(() => setLoading(false));
  }, []);

  const toggleBullet = useCallback((id, currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setBulletOverrides(prev => {
      const updated = { ...prev };
      if (next === defaultStatus) {
        delete updated[id];
      } else {
        updated[id] = next;
      }
      return updated;
    });
    setSaved(false);
  }, []);

  const toggleSkill = useCallback((cat, currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setSkillOverrides(prev => {
      const updated = { ...prev };
      if (next === defaultStatus) {
        delete updated[cat];
      } else {
        updated[cat] = next;
      }
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
      const resp = await fetch('/api/base-resume/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bullets: bulletOverrides,
          skill_categories: skillOverrides,
          summary: summaryOverride,
        }),
      });
      if (!resp.ok) throw new Error('Save failed');
      setSaved(true);
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

  if (loading) {
    return (
      <div className="empty-state">
        <p>Loading resume...</p>
      </div>
    );
  }

  if (error || !parsed) {
    return (
      <div>
        <div className="page-header">
          <h2>Base Resume</h2>
        </div>
        <div className="message message-error">
          {error || 'No resume uploaded yet. Go to Home and upload your .tex file.'}
        </div>
      </div>
    );
  }

  const header = parsed.header || {};
  const sections = parsed.sections || [];

  const totalBullets = sections.reduce((acc, sec) => {
    if (sec.type === 'experience') {
      return acc + sec.entries.reduce((a, e) => a + e.bullets.length, 0);
    }
    if (sec.type === 'projects') {
      return acc + sec.projects.reduce((a, p) => a + p.bullets.length, 0);
    }
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
        <h2>Base Resume</h2>
        <p>Toggle which bullets Gemini can edit. Locked bullets are never changed.</p>
      </div>

      {/* Header summary */}
      <div className="card">
        <div className="resume-meta">
          <div className="resume-meta-name">{cleanLocked(header.name)}</div>
          <div className="resume-meta-details">
            {[cleanLocked(header.email), cleanLocked(header.phone)]
              .filter(Boolean)
              .join(' · ')}
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
          <button className="btn btn-secondary" onClick={resetAll}>
            Reset All to Default
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Preferences'}
          </button>
        </div>
      </div>

      {sections.map((sec, si) => {
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
                    {proj.dates && (
                      <span className="exp-dates">{cleanLocked(proj.dates)}</span>
                    )}
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

      {/* Floating save bar — only shown when there are unsaved changes */}
      {!saved && overrideCount > 0 && (
        <div className="save-bar">
          <span>{overrideCount} preference{overrideCount !== 1 ? 's' : ''} changed</span>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      )}
    </div>
  );
}
