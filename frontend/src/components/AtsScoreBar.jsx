export default function AtsScoreBar({ report }) {
  if (!report) return null;

  const {
    original_must_have_score,
    tailored_must_have_score,
    original_nice_to_have_score,
    tailored_nice_to_have_score,
    must_have_matched,
    must_have_missed,
    improved,
  } = report;

  const scoreColor = (score) => {
    if (score >= 80) return '#30d158';
    if (score >= 50) return '#ff9f0a';
    return '#ff3b30';
  };

  return (
    <div className="card">
      <h3>ATS Score</h3>

      {/* Must-have keywords */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Must-Have Keywords</div>
        <div className="score-bar-container">
          <span className="score-label" style={{ minWidth: 80 }}>Before: {original_must_have_score}%</span>
          <div className="score-bar">
            <div
              className="score-bar-fill"
              style={{
                width: `${original_must_have_score}%`,
                background: scoreColor(original_must_have_score),
                opacity: 0.4,
              }}
            />
          </div>
        </div>
        <div className="score-bar-container">
          <span className="score-label" style={{ minWidth: 80 }}>After: {tailored_must_have_score}%</span>
          <div className="score-bar">
            <div
              className="score-bar-fill"
              style={{
                width: `${tailored_must_have_score}%`,
                background: scoreColor(tailored_must_have_score),
              }}
            />
          </div>
          <span className={`score-label ${improved ? 'score-improved' : 'score-same'}`}>
            {improved ? 'Improved' : 'No change'}
          </span>
        </div>
      </div>

      {/* Nice-to-have keywords */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nice-to-Have Keywords</div>
        <div className="score-bar-container">
          <span className="score-label" style={{ minWidth: 80 }}>Before: {original_nice_to_have_score}%</span>
          <div className="score-bar">
            <div
              className="score-bar-fill"
              style={{
                width: `${original_nice_to_have_score}%`,
                background: '#0071e3',
                opacity: 0.4,
              }}
            />
          </div>
        </div>
        <div className="score-bar-container">
          <span className="score-label" style={{ minWidth: 80 }}>After: {tailored_nice_to_have_score}%</span>
          <div className="score-bar">
            <div
              className="score-bar-fill"
              style={{
                width: `${tailored_nice_to_have_score}%`,
                background: '#0071e3',
              }}
            />
          </div>
        </div>
      </div>

      {/* Keyword details */}
      {must_have_matched && must_have_matched.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#30d158' }}>Matched: </span>
          <span style={{ fontSize: 12, color: '#86868b' }}>{must_have_matched.join(', ')}</span>
        </div>
      )}
      {must_have_missed && must_have_missed.length > 0 && (
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#ff3b30' }}>Missed: </span>
          <span style={{ fontSize: 12, color: '#86868b' }}>{must_have_missed.join(', ')}</span>
        </div>
      )}
    </div>
  );
}
