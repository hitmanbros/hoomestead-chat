import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { getPlatform, setBackendUrl } from "../../api/transport";

export default function LoginScreen() {
  const [homeserver, setHomeserver] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [backendUrl, setBackendUrlInput] = useState(
    localStorage.getItem("hoomestead_backend_url") || ""
  );
  const platform = getPlatform();
  const isMobile = platform === "capacitor";
  const { login, isLoading, error } = useAuthStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMobile && backendUrl.trim()) {
      setBackendUrl(backendUrl.trim());
    }
    login(homeserver, username, password);
  };

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Welcome back!</h1>
        <p>We're so excited to see you again!</p>

        {isMobile && (
          <div className="login-field">
            <label>Backend URL</label>
            <input
              type="url"
              value={backendUrl}
              onChange={(e) => setBackendUrlInput(e.target.value)}
              placeholder="https://your-backend.com"
              required
            />
            <small className="login-hint">
              Your self-hosted Hoomestead backend server address
            </small>
          </div>
        )}

        <div className="login-field">
          <label>Homeserver</label>
          <input
            type="text"
            value={homeserver}
            onChange={(e) => setHomeserver(e.target.value)}
            placeholder="matrix.homeserver.com"
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
