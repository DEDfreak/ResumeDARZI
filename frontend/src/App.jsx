import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Result from './pages/Result';
import Settings from './pages/Settings';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <div className="sidebar-header">
            <h1 className="logo">ResumeTailor</h1>
            <p className="tagline">AI-powered resume tailoring</p>
          </div>
          <ul className="nav-links">
            <li>
              <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                Home
              </NavLink>
            </li>
            <li>
              <NavLink to="/result" className={({ isActive }) => isActive ? 'active' : ''}>
                Result
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
                Settings
              </NavLink>
            </li>
          </ul>
          <div className="sidebar-footer">
            <p>All processing is local</p>
          </div>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/result" element={<Result />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
