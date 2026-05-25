import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

function cleanLocked(str) {
  return typeof str === 'string' ? str.replace(/^LOCKED:\s*/, '') : str;
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function StatusBadge({ status, onToggle }) {
  const isLocked = status === 'LOCKED';
  return (
    <button
      className={`lock-badge ${isLocked ? 'lock-badge-locked' : 'lock-badge-edit'}`}
      onClick={onToggle}
      title={isLocked ? 'Click to make editable' : 'Click to lock'}
    >
      {isLocked ? <LockIcon /> : <PencilIcon />}
      {isLocked ? 'Locked' : 'Editable'}
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

// --- Config editor panel ---
function ConfigEditor({ parsed, initial, onSave, onCancel, saving }) {
  const [name, setName] = useState(initial?.name || '');
  const [bulletOverrides, setBulletOverrides] = useState(initial?.bullets || {});
  const [skillOverrides, setSkillOverrides] = useState(initial?.skill_categories || {});
  const [techStackOverrides, setTechStackOverrides] = useState(initial?.tech_stacks || {});
  const [summaryOverride, setSummaryOverride] = useState(initial?.summary ?? null);

  const toggleBullet = useCallback((id, currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setBulletOverrides(prev => {
      const u = { ...prev };
      if (next === defaultStatus) delete u[id]; else u[id] = next;
      return u;
    });
  }, []);

  const toggleSkill = useCallback((cat, currentEffective, defaultStatus = 'EDITABLE') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setSkillOverrides(prev => {
      const u = { ...prev };
      if (next === defaultStatus) delete u[cat]; else u[cat] = next;
      return u;
    });
  }, []);

  const toggleTechStack = useCallback((company, currentEffective, defaultStatus = 'LOCKED') => {
    const next = currentEffective === 'LOCKED' ? 'EDITABLE' : 'LOCKED';
    setTechStackOverrides(prev => {
      const u = { ...prev };
      if (next === defaultStatus) delete u[company]; else u[company] = next;
      return u;
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
  const overrideCount = Object.keys(bulletOverrides).length + Object.keys(skillOverrides).length +
    Object.keys(techStackOverrides).length + (summaryOverride !== null ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Name + actions header */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Configuration name (e.g. ML Focus, Frontend)"
            autoFocus
            style={{
              flex: 1, padding: '8px 12px', border: '1px solid #d2d2d7',
              borderRadius: 8, fontSize: 14, background: '#fafafa', fontFamily: 'inherit',
            }}
          />
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {overrideCount > 0 && (
          <p style={{ fontSize: 12, color: '#86868b', marginTop: 8, marginBottom: 0 }}>
            {overrideCount} preference{overrideCount !== 1 ? 's' : ''} set
          </p>
        )}
      </div>

      {/* Sections */}
      {sections.map((sec, si) => {
        if (sec.type === 'experience') {
          return (
            <div key={si} className="card" style={{ marginBottom: 12 }}>
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
            <div key={si} className="card" style={{ marginBottom: 12 }}>
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
            <div key={si} className="card" style={{ marginBottom: 12 }}>
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
          const defaultStatus = sec.status ?? 'EDITABLE';
          const effective = summaryOverride ?? defaultStatus;
          return (
            <div key={si} className="card" style={{ marginBottom: 12 }}>
              <h3 className="section-title">Summary</h3>
              <div className={`bullet-row ${effective === 'LOCKED' ? 'bullet-row-locked' : ''}`}>
                <StatusBadge status={effective} onToggle={() => toggleSummary(effective, defaultStatus)} />
                <span className="bullet-text">{sec.text}</span>
              </div>
            </div>
          );
        }

        return null;
      })}

      {/* Tech Stack */}
      {(() => {
        const expSec = sections.find(s => s.type === 'experience');
        const techEntries = expSec ? expSec.entries.filter(e => cleanLocked(e.tech_stack)) : [];
        if (!techEntries.length) return null;
        return (
          <div className="card" style={{ marginBottom: 12 }}>
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

      {/* Bottom save bar */}
      <div style={{
        position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e5e5ea',
        padding: '12px 0', display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8,
      }}>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
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
  const [parsed, setParsed] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [activeConfigId, setActiveConfigId] = useState(null);
  const [selectedConfigId, setSelectedConfigId] = useState(null); // which config is shown in right panel
  const [editMode, setEditMode] = useState(null); // null | 'new' | configId
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
    setSelectedConfigId(null);
    Promise.all([
      fetch(`/api/resumes/${selectedSlug}/parsed`).then(r => r.json()),
      fetch(`/api/resumes/${selectedSlug}/configurations`).then(r => r.json()),
      fetch('/api/active-resume').then(r => r.json()),
    ])
      .then(([parsedData, configList, active]) => {
        if (parsedData.detail) { setError(parsedData.detail); return; }
        setParsed(parsedData);
        setConfigs(configList);
        if (active.slug === selectedSlug) setActiveConfigId(active.config_id || null);
        if (configList.length > 0) setSelectedConfigId(configList[0].id);
      })
      .catch(() => setError('Failed to load resume data.'))
      .finally(() => setLoading(false));
  }, [selectedSlug]);

  const handleNewConfig = () => {
    setEditInitial(null);
    setEditMode('new');
    setSelectedConfigId(null);
  };

  const handleSelectConfig = async (configId) => {
    setSelectedConfigId(configId);
    setEditMode(null);
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
      const next = configs.filter(c => c.id !== configId);
      setConfigs(next);
      if (activeConfigId === configId) setActiveConfigId(null);
      if (selectedConfigId === configId) setSelectedConfigId(next[0]?.id || null);
      if (editMode === configId) { setEditMode(null); setEditInitial(null); }
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
        setSelectedConfigId(created.id);
      } else {
        const resp = await fetch(`/api/resumes/${selectedSlug}/configurations/${editMode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const updated = await resp.json();
        setConfigs(prev => prev.map(c => c.id === editMode
          ? { ...c, name: updated.name, locked_count: updated.locked_count } : c));
        setSelectedConfigId(editMode);
      }
      setEditMode(null);
      setEditInitial(null);
    } catch {
      setError('Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const selectedConfig = configs.find(c => c.id === selectedConfigId);

  return (
    <div>
      <div className="page-header">
        <h2>Resume Configuration</h2>
        <p>Select a base resume, then manage named configurations that define which bullets are locked.</p>
      </div>

      {error && <div className="message message-error">{error}</div>}

      {/* Resume selector */}
      <div className="card">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Base Resume</label>
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
      </div>

      {loading && <div className="empty-state"><p>Loading resume...</p></div>}

      {!loading && selectedSlug && parsed && (
        editMode !== null ? (
          // Full-width editor when creating/editing
          <ConfigEditor
            parsed={parsed}
            initial={editInitial}
            onSave={handleSaveConfig}
            onCancel={() => { setEditMode(null); setEditInitial(null); }}
            saving={saving}
          />
        ) : (
          // Left/right panel layout
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Left: config list */}
            <div style={{ width: 240, flexShrink: 0 }}>
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Configurations</span>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '5px 12px' }}
                    onClick={handleNewConfig}
                  >
                    + New
                  </button>
                </div>

                {configs.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#86868b', margin: 0 }}>
                    No configurations yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {configs.map(config => {
                      const isSelected = config.id === selectedConfigId;
                      const isActive = config.id === activeConfigId;
                      return (
                        <div
                          key={config.id}
                          onClick={() => handleSelectConfig(config.id)}
                          style={{
                            padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                            background: isSelected ? 'rgba(0,113,227,0.07)' : 'transparent',
                            border: isSelected ? '1px solid rgba(0,113,227,0.2)' : '1px solid transparent',
                            transition: 'all 0.12s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>{config.name}</span>
                            {isActive && (
                              <span style={{
                                fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                background: 'rgba(0,113,227,0.1)', color: '#0071e3', fontWeight: 600,
                              }}>Active</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#86868b' }}>
                            {config.locked_count > 0 ? `${config.locked_count} locked` : 'All editable'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: config detail / empty state */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedConfig ? (
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{selectedConfig.name}</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#86868b' }}>
                        {selectedConfig.locked_count > 0
                          ? `${selectedConfig.locked_count} field${selectedConfig.locked_count !== 1 ? 's' : ''} locked — AI will not change them`
                          : 'All fields editable — AI may change any bullet'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {activeConfigId !== selectedConfig.id && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: '6px 14px' }}
                          onClick={() => handleSetActive(selectedConfig.id)}
                        >
                          Set Active
                        </button>
                      )}
                      {activeConfigId === selectedConfig.id && (
                        <span style={{
                          fontSize: 12, padding: '6px 10px', borderRadius: 8,
                          background: 'rgba(0,113,227,0.1)', color: '#0071e3', fontWeight: 500,
                        }}>Active</span>
                      )}
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '6px 14px' }}
                        onClick={() => handleEditConfig(selectedConfig.id)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '6px 14px', color: '#ff3b30', borderColor: 'rgba(255,59,48,0.3)' }}
                        onClick={() => handleDeleteConfig(selectedConfig.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="empty-state" style={{ padding: '32px 0' }}>
                    <p style={{ marginBottom: 12 }}>
                      {configs.length === 0
                        ? 'Create a configuration to control which bullets the AI can edit.'
                        : 'Select a configuration from the list to view it.'}
                    </p>
                    {configs.length === 0 && (
                      <button className="btn btn-primary" onClick={handleNewConfig}>
                        + New Configuration
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
