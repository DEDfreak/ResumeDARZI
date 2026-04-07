import { useState, useEffect } from 'react';
import PdfDiffViewer from '../components/PdfDiffViewer';
import AtsScoreBar from '../components/AtsScoreBar';
import CoverLetterPanel from '../components/CoverLetterPanel';

export default function Result() {
  const [result, setResult] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('lastResult');
    if (stored) {
      try {
        setResult(JSON.parse(stored));
      } catch {}
    }
  }, []);

  if (!result) {
    return (
      <div>
        <div className="page-header">
          <h2>Results</h2>
        </div>
        <div className="empty-state">
          <h3>No results yet</h3>
          <p>Generate a tailored resume from the Home page to see results here.</p>
        </div>
      </div>
    );
  }

  const { ats_report, changes, files, images, cover_letter_text, validation, folder } = result;

  return (
    <div>
      <div className="page-header">
        <h2>Tailored Resume</h2>
        <p>Output folder: {folder}</p>
      </div>

      {/* ATS Score */}
      {ats_report && <AtsScoreBar report={ats_report} />}

      {/* Validation warnings */}
      {validation && Object.entries(validation).map(([key, val]) => {
        if (val.passed === false) {
          return (
            <div key={key} className="message message-warning">
              {key}: {val.message}
            </div>
          );
        }
        return null;
      })}

      {/* PDF Diff Viewer */}
      <div className="card">
        <h3>Visual Comparison</h3>
        <PdfDiffViewer images={images} />
      </div>

      {/* Downloads */}
      <div className="card">
        <h3>Downloads</h3>
        <div className="download-group">
          {files?.pdf && (
            <a className="download-btn" href={files.pdf} target="_blank" rel="noopener noreferrer">
              Resume PDF
            </a>
          )}
          {files?.tex && (
            <a className="download-btn" href={files.tex} target="_blank" rel="noopener noreferrer">
              Resume LaTeX Source
            </a>
          )}
          {files?.cover_letter && (
            <a className="download-btn" href={files.cover_letter} target="_blank" rel="noopener noreferrer">
              Cover Letter PDF
            </a>
          )}
        </div>
      </div>

      {/* Changes */}
      {changes && changes.length > 0 && (
        <div className="card">
          <h3>Changes Made ({changes.length} bullets rewritten)</h3>
          {changes.map((change, i) => (
            <div key={i} className="change-item">
              <div className="original">{change.original}</div>
              <div className="tailored">{change.tailored}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cover Letter */}
      {cover_letter_text && <CoverLetterPanel text={cover_letter_text} />}
    </div>
  );
}
