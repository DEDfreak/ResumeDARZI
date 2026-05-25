import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

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

// --- Config editor (shown when creating or editing a config) ---
function ConfigEditor({ parsed, initial, onSave, onCancel, saving }) {
  const [name, setName] = useState(initial?.name || '');
  const [bulletOverrides, setBulletOverrides] = useState(initial?.bullets || {});
  const [skillOverrides, setSkillOverrides] = useState(initial?.skill_categories || {});
  const [techStackOverrides, setTechStackOverrides] = useState(initial?.tech_stacks || {});
  const [summaryOverride, setSummaryOverride] = useState(initial?.summary ?? null);

  const toggleBullet = useCallback((id, currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setBulletOverrides(prev => {
      const updated = { ...prev };
      if (next === defaultStatus) delete updated[id];
      else updated[id] = next;
      return updated;
    });
  }, []);

  const toggleSkill = useCallback((cat, currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setSkillOverrides(prev => {
      const updated = { ...prev };
      if (next === defaultStatus) delete updated[cat];
      else updated[cat] = next;
      return updated;
    });
  }, []);

  const toggleTechStack = useCallback((company, currentEffective, defaultStatus = 'LOCKED') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setTechStackOverrides(prev => {
      const updated = { ...prev };
      if (next === defaultStatus) delete updated[company];
      else updated[company] = next;
      return updated;
    });
  }, []);

  const toggleSummary = useCallback((currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setSummaryOverride(next === defaultStatus ? null : next);
  }, []);

  const handleSave = () => {
    onSave({
      name: name.trim() || 'Untitled',
      bullets: bulletOverrides,
      skill_categories: skillOverrides,
      tech_stacks: techStackOverrides,
      summary: summaryOverride,
    });
  };

  const sections = parsed?.sections || [];

  return (
    <div>
      {/* Config name */}
      <div className="card">
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Configuration Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ML Focus, Frontend, General"
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Sections */}
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
                      <StatusBadge status={effective} onToggle={() => toggleSkill(cat, effective, skill.status)} />
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
                <StatusBadge status={effective} onToggle={() => toggleSummary(effective, defaultSummaryStatus)} />
                <span className="bullet-text">{sec.text}</span>
              </div>
            </div>
          );
        }

        return null;
      })}

      {/* Tech Stack section */}
      {(() => {
        const expSec = sections.find(s => s.type === 'experience');
        const techEntries = expSec ? expSec.entries.filter(e => cleanLocked(e.tech_stack)) : [];
        if (techEntries.length === 0) return null;
        return (
          <div className="card">
            <h3 className="section-title">Tech Stack</h3>
            <div className="bullets-list">
              {techEntries.map((entry, i) => {
                const company = cleanLocked(entry.company);
                const effective = techStackOverrides[company] ?? 'LOCKED';
                return (
                  <div key={i} className={`bullet-row ${effective === 'LOCKED' ? 'bullet-row-locked' : ''}`}>
                    <StatusBadge status={effective} onToggle={() => toggleTechStack(company, effective, 'LOCKED')} />
                    <span className="bullet-text">
                      <strong>{company}</strong>: {cleanLocked(entry.tech_stack)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Sticky save bar */}
      <div className="save-bar">
        <span>
          {Object.keys(bulletOverrides).length + Object.keys(skillOverrides).length +
           Object.keys(techStackOverrides).length + (summaryOverride !== null ? 1 : 0)} preferences set
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Config list card ---
function ConfigCard({ config, isActive, onEdit, onDelete, onSetActive }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 16px',
      borderRadius: 10,
      border: isActive ? '1.5px solid #0071e3' : '1px solid #e5e5ea',
      background: isActive ? 'rgba(0,113,227,0.03)' : '#fafafa',
      marginBottom: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          {config.name}
          {isActive && (
            <span className="meta-stat" style={{ background: 'rgba(0,113,227,0.1)', color: '#0071e3', fontSize: 11 }}>
              Active
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#86868b', marginTop: 2 }}>
          {config.locked_count > 0 ? `${config.locked_count} locked` : 'All editable'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {!isActive && (
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={onSetActive}>
            Set Active
          </button>
        )}
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={onEdit}>
          Edit
        </button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '6px 14px', color: '#ff3b30', borderColor: 'rgba(255,59,48,0.3)' }}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// --- Main page ---
export default function ResumeConfiguration() {
  const [searchParams] = useSearchParams();

  const [resumes, setResumes] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [activeConfigId, setActiveConfigId] = useState(null);
  const [editMode, setEditMode] = useState(null); // null | 'new' | configId string
  const [editInitial, setEditInitial] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load resume list
  useEffect(() => {
    const paramSlug = searchParams.get('slug');
    fetch('/api/resumes')
      .then(r => r.json())
      .then(data => {
        setResumes(data);
        if (paramSlug && data.find(r => r.slug === paramSlug)) {
          setSelectedSlug(paramSlug);
          return;
        }
        return fetch('/api/active-resume').then(r => r.json()).then(active => {
          if (active.slug && data.find(r => r.slug === active.slug)) {
            setSelectedSlug(active.slug);
            setActiveConfigId(active.config_id || null);
          } else if (data.length > 0) {
            setSelectedSlug(data[0].slug);
          }
        });
      })
      .catch(() => setError('Failed to load resumes.'));
  }, [searchParams]);

  // Load parsed + configs when slug changes
  useEffect(() => {
    if (!selectedSlug) return;
    setLoading(true);
    setError('');
    setEditMode(null);
    setEditInitial(null);
    Promise.all([
      fetch(`/api/resumes/${selectedSlug}/parsed`).then(r => r.json()),
      fetch(`/api/resumes/${selectedSlug}/configurations`).then(r => r.json()),
      fetch(`/api/resumes/${selectedSlug}/preferences`).then(r => r.json()),
      fetch('/api/active-resume').then(r => r.json()),
    ])
      .then(([parsedData, configList, prefs, active]) => {
        if (parsedData.detail) {
          setError(parsedData.detail);
        } else {
          setParsed(parsedData);
          setConfigs(configList);
          const defaultName = selectedSlug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          setDisplayName(prefs.display_name || defaultName);
          if (active.slug === selectedSlug) {
            setActiveConfigId(active.config_id || null);
          }
        }
      })
      .catch(() => setError('Failed to load resume data.'))
      .finally(() => setLoading(false));
  }, [selectedSlug]);

  const handleNewConfig = () => {
    setEditInitial(null);
    setEditMode('new');
  };

  const handleEditConfig = async (configId) => {
    try {
      const resp = await fetch(`/api/resumes/${selectedSlug}/configurations/${configId}`);
      const data = await resp.json();
      setEditInitial(data);
      setEditMode(configId);
    } catch {
      setError('Failed to load configuration.');
    }
  };

  const handleDeleteConfig = async (configId) => {
    if (!window.confirm('Delete this configuration? This cannot be undone.')) return;
    try {
      await fetch(`/api/resumes/${selectedSlug}/configurations/${configId}`, { method: 'DELETE' });
      setConfigs(prev => prev.filter(c => c.id !== configId));
      if (activeConfigId === configId) setActiveConfigId(null);
    } catch {
      setError('Failed to delete configuration.');
    }
  };

  const handleSetActive = async (configId) => {
    try {
      await fetch('/api/active-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: selectedSlug, config_id: configId }),
      });
      setActiveConfigId(configId);
    } catch {
      setError('Failed to set active configuration.');
    }
  };

  const handleSaveConfig = async (formData) => {
    setSaving(true);
    try {
      if (editMode === 'new') {
        const resp = await fetch(`/api/resumes/${selectedSlug}/configurations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const created = await resp.json();
        setConfigs(prev => [...prev, created]);
      } else {
        const resp = await fetch(`/api/resumes/${selectedSlug}/configurations/${editMode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const updated = await resp.json();
        setConfigs(prev => prev.map(c => c.id === editMode ? { ...c, name: updated.name, locked_count: updated.locked_count } : c));
      }
      setEditMode(null);
      setEditInitial(null);
    } catch {
      setError('Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDisplayName = async () => {
    try {
      await fetch(`/api/resumes/${selectedSlug}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      });
      setResumes(prev => prev.map(r => r.slug === selectedSlug ? { ...r, display_name: displayName } : r));
    } catch {
      setError('Failed to save display name.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Resume Configuration</h2>
        <p>Manage named configurations for each resume. Each config defines which bullets are locked or editable.</p>
      </div>

      {error && <div className="message message-error">{error}</div>}

      {/* Resume selector */}
      <div className="card">
        <div className="form-group" style={{ marginBottom: selectedSlug ? 12 : 0 }}>
          <label>Select Resume</label>
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', border: '1px solid #d2d2d7',
              borderRadius: 8, fontSize: 14, background: '#fafafa', fontFamily: 'inherit',
            }}
          >
            {resumes.length === 0 && <option value="">No resumes available</option>}
            {resumes.map(r => (
              <option key={r.slug} value={r.slug}>{r.display_name} ({r.filename})</option>
            ))}
          </select>
        </div>

        {selectedSlug && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={handleSaveDisplayName}
              placeholder="Display name"
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid #d2d2d7',
                borderRadius: 8, fontSize: 14, background: '#fafafa', fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: 12, color: '#86868b' }}>Display name (auto-saves on blur)</span>
          </div>
        )}
      </div>

      {loading && <div className="empty-state"><p>Loading resume...</p></div>}

      {!loading && selectedSlug && parsed && editMode === null && (
        <>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Configurations</h3>
              <button className="btn btn-primary" onClick={handleNewConfig}>
                + New Configuration
              </button>
            </div>

            {configs.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p>No configurations yet. Create one to define lock/edit preferences.</p>
              </div>
            ) : (
              configs.map(config => (
                <ConfigCard
                  key={config.id}
                  config={config}
                  isActive={config.id === activeConfigId}
                  onEdit={() => handleEditConfig(config.id)}
                  onDelete={() => handleDeleteConfig(config.id)}
                  onSetActive={() => handleSetActive(config.id)}
                />
              ))
            )}
          </div>
        </>
      )}

      {!loading && selectedSlug && parsed && editMode !== null && (
        <ConfigEditor
          parsed={parsed}
          initial={editInitial}
          onSave={handleSaveConfig}
          onCancel={() => { setEditMode(null); setEditInitial(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}
