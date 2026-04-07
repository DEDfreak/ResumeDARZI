import { useState } from 'react';

export default function CoverLetterPanel({ text }) {
  const [copied, setCopied] = useState(false);

  if (!text) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ marginBottom: 0 }}>Cover Letter</h3>
        <button className="btn btn-secondary" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
      </div>
      <div className="cover-letter-text">{text}</div>
    </div>
  );
}
