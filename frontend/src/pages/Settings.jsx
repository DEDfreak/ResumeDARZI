import { useState, useEffect } from 'react';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [bannedWords, setBannedWords] = useState([]);
  const [newWord, setNewWord] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setApiKeyMasked(data.gemini_api_key_masked || '');
        setBannedWords(data.banned_words || []);
      })
      .catch(e => setError(e.message));
  }, []);

  const handleSave = async () => {
    try {
      const body = { banned_words: bannedWords };
      if (apiKey) body.gemini_api_key = apiKey;

      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) throw new Error('Failed to save');

      setSaved(true);
      setError('');
      if (apiKey) {
        setApiKeyMasked(apiKey.slice(0, 8) + '...' + apiKey.slice(-4));
        setApiKey('');
      }
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  const addWord = () => {
    const word = newWord.trim().toLowerCase();
    if (word && !bannedWords.includes(word)) {
      setBannedWords([...bannedWords, word]);
      setNewWord('');
    }
  };

  const removeWord = (word) => {
    setBannedWords(bannedWords.filter(w => w !== word));
  };

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure your API key and preferences.</p>
      </div>

      {error && <div className="message message-error">{error}</div>}
      {saved && <div className="message message-success">Settings saved.</div>}

      {/* API Key */}
      <div className="card">
        <h3>Gemini API Key</h3>
        <p style={{ fontSize: 13, color: '#86868b', marginBottom: 12 }}>
          Get a free API key from Google AI Studio. Your key is stored locally in .env.
        </p>
        {apiKeyMasked && (
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            Current key: <code style={{ fontFamily: 'monospace', background: '#f5f5f7', padding: '2px 6px', borderRadius: 4 }}>{apiKeyMasked}</code>
          </p>
        )}
        <div className="form-group">
          <label>New API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter new Gemini API key..."
          />
        </div>
      </div>

      {/* Banned Words */}
      <div className="card">
        <h3>Banned Words</h3>
        <p style={{ fontSize: 13, color: '#86868b', marginBottom: 12 }}>
          Words that will never appear in your tailored resume or cover letter.
        </p>
        <div className="tag-list">
          {bannedWords.map(word => (
            <span key={word} className="tag">
              {word}
              <button onClick={() => removeWord(word)}>x</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            type="text"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addWord()}
            placeholder="Add a word..."
            style={{
              flex: 1, padding: '8px 12px', border: '1px solid #d2d2d7',
              borderRadius: 8, fontSize: 14
            }}
          />
          <button className="btn btn-secondary" onClick={addWord}>Add</button>
        </div>
      </div>

      {/* Base Resume Info */}
      <div className="card">
        <h3>Base Resume</h3>
        <p style={{ fontSize: 13, color: '#86868b' }}>
          Your master resume is stored in the base_resume/ folder and is never modified.
          Upload a new one from the Home page.
        </p>
      </div>

      <button className="btn btn-primary" onClick={handleSave}>
        Save Settings
      </button>
    </div>
  );
}
