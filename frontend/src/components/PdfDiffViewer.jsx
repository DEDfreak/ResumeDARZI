import { useState } from 'react';

const TABS = [
  { key: 'original', label: 'Original' },
  { key: 'tailored', label: 'Tailored' },
  { key: 'diff', label: 'Diff' },
];

export default function PdfDiffViewer({ images }) {
  const [activeTab, setActiveTab] = useState('tailored');

  if (!images) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <p>PDF preview not available. Install pdflatex and poppler for visual diff.</p>
      </div>
    );
  }

  const currentImage = images[activeTab + '_image'] || images[activeTab];

  return (
    <div>
      <div className="tab-bar">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={activeTab === key ? 'active' : ''}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {currentImage ? (
        <img
          src={currentImage}
          alt={`${activeTab} resume`}
          className="pdf-image"
          loading="lazy"
        />
      ) : (
        <div className="empty-state" style={{ padding: 40 }}>
          <p>{activeTab} image not available.</p>
        </div>
      )}
    </div>
  );
}
