import { useState } from 'react';

const TABS = [
  { key: 'original', label: 'Original' },
  { key: 'tailored', label: 'Tailored' },
  { key: 'diff', label: 'Diff' },
];

export default function PdfDiffViewer({ images }) {
  const [activeTab, setActiveTab] = useState('tailored');

  if (!images || Object.keys(images).length === 0) {
    return (
      <div className="message message-warning">
        <strong>Visual comparison not available.</strong> PDF compilation requires pdflatex to be installed on your system.
        <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 12 }}>
          <li><strong>Windows:</strong> Install <a href="https://miktex.org/download" target="_blank" rel="noopener noreferrer">MiKTeX</a> or <a href="https://tug.org/texlive/" target="_blank" rel="noopener noreferrer">TeX Live</a></li>
          <li><strong>macOS:</strong> <code>brew install --cask mactex-no-gui</code></li>
          <li><strong>Linux:</strong> <code>sudo apt install texlive-latex-base texlive-latex-extra</code></li>
        </ul>
        Your tailored resume was still generated (download the .tex or .pdf above).
      </div>
    );
  }

  const currentImage = images[activeTab + '_image'];
  const availableTabs = TABS.filter(({ key }) => images[key + '_image']);

  if (availableTabs.length === 0) {
    return (
      <div className="message message-warning">
        <strong>Visual comparison images not generated.</strong> This usually means PDF compilation failed or pdf2image is not available. Your resume was still tailored successfully.
      </div>
    );
  }

  return (
    <div>
      <div className="tab-bar">
        {availableTabs.map(({ key, label }) => (
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
          onError={() => {
            // If image fails to load, show error
          }}
        />
      ) : (
        <div className="empty-state" style={{ padding: 40 }}>
          <p>{activeTab} image not available.</p>
        </div>
      )}
    </div>
  );
}
