import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "./store/authStore";
import AppLayout from "./components/layout/AppLayout";
import LoginScreen from "./components/user/LoginScreen";
import TitleBar from "./components/layout/TitleBar";
import ErrorBoundary from "./components/common/ErrorBoundary";
import SettingsPage from "./components/settings/SettingsPage";
import { waitForBackendUrl } from "./api/transport";

function App() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const didRestore = useRef(false);
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    waitForBackendUrl().then(() => setBackendReady(true));
  }, []);

  useEffect(() => {
    if (!backendReady) return;
    if (didRestore.current) return;
    didRestore.current = true;
    restoreSession();
  }, [backendReady, restoreSession]);

  if (!backendReady || isRestoring) {
    return (
      <>
        <TitleBar />
        <div className="login-container" style={{ paddingTop: 22 }}>
          <div className="login-card" style={{ textAlign: "center" }}>
            <h2>Restoring session...</h2>
            <p>Please wait</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <ErrorBoundary>
      <TitleBar />
      {isLoggedIn ? <AppLayout /> : <LoginScreen />}
      <SettingsPage />
    </ErrorBoundary>
  );
}

export default App;
