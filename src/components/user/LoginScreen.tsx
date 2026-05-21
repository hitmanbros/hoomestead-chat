import { useState, useEffect } from "react";
import { useAuthStore } from "../../store/authStore";
import { getBackendUrl, setBackendUrl } from "../../api/transport";

function isElectron() {
  return !!(window as any).electronAPI;
}

export default function LoginScreen() {
  const [homeserver, setHomeserver] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [backendUrl, setBackendUrlState] = useState("");
  const [showBackendField, setShowBackendField] = useState(false);
  const { login, isLoading, error } = useAuthStore();

  useEffect(() => {
    if (!isElectron()) {
      const current = getBackendUrl();
      if (!current) {
        setShowBackendField(true);
      } else {
        setBackendUrlState(current);
      }
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showBackendField && backendUrl) {
      setBackendUrl(backendUrl);
    }
    login(homeserver, username, password);
  };

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Welcome back!</h1>
        <p>We're so excited to see you again!</p>

        {showBackendField && (
          <div className="login-field">
            <label>Backend Server URL</label>
            <input
              type="url"
              placeholder="https://your-backend.com"
              value={backendUrl}
              onChange={(e) => setBackendUrlState(e.target.value)}
              required
            />
            <small style={{ color: "var(--text-muted)", marginTop: 4, display: "block" }}>
              Your OpenClaw backend server address
            </small>
          </div>
        )}

        <div className="login-field">
          <label>Homeserver</label>
          <input
            type="text"
            value={homeserver}
            onChange={(e) => setHomeserver(e.target.value)}
            required
          />
        </div>

        <div className="login-field">
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="login-field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="login-button" disabled={isLoading}>
          {isLoading ? "Logging in..." : "Log In"}
        </button>

        {error && <div className="login-error">{error}</div>}
      </form>
    </div>
  );
}
