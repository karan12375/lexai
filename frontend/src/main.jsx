import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.jsx";
import "./index.css";
import { supabase } from "./lib/supabase";
import { useAppStore } from "./store";

async function initializeAuth() {
  const { setSession, setAuthReady, clearSession } = useAppStore.getState();

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      setSession(session);
    } else {
      clearSession();
    }
  } catch (error) {
    clearSession();
  } finally {
    setAuthReady(true);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    const { setSession: pushSession, clearSession: wipeSession, setAuthReady: markReady } =
      useAppStore.getState();

    if (session) {
      pushSession(session);
    } else {
      wipeSession();
    }
    markReady(true);
  });
}

initializeAuth();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

