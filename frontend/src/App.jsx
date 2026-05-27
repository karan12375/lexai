import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { useAppStore } from "./store";
import LandingPage from "./pages/LandingPage";
import WorkspaceLayout from "./layouts/WorkspaceLayout";
import ChatPage from "./pages/ChatPage";
import DashboardPage from "./pages/DashboardPage";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import {
  CounterArgsPage,
  DraftPage,
  DocumentsPage,
  SearchPage,
  VerdictPage,
} from "./pages/WorkspacePages";

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary text-text-secondary">
      <div className="space-y-2 text-center">
        <div className="inline-flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gold-500/90 animate-pulse" />
          <span className="h-2 w-2 rounded-full bg-gold-500/60 animate-pulse [animation-delay:120ms]" />
          <span className="h-2 w-2 rounded-full bg-gold-500/40 animate-pulse [animation-delay:240ms]" />
        </div>
        <p className="text-xs">Restoring your secure workspace...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { session, authReady } = useAppStore((state) => ({
    session: state.session,
    authReady: state.authReady,
  }));

  if (!authReady) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { session, authReady } = useAppStore((state) => ({
    session: state.session,
    authReady: state.authReady,
  }));

  if (!authReady) return <FullScreenLoader />;
  if (session) return <Navigate to="/workspace/dashboard" replace />;
  return children;
}

function RootRoute() {
  const { session, authReady } = useAppStore((state) => ({
    session: state.session,
    authReady: state.authReady,
  }));

  if (!authReady) return <FullScreenLoader />;
  if (session) return <Navigate to="/workspace/dashboard" replace />;
  return <LandingPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3200,
          style: {
            background: "#131722",
            color: "#E7ECF5",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            fontSize: "12px",
            padding: "10px 12px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
          },
        }}
      />

      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicRoute>
              <Signup />
            </PublicRoute>
          }
        />

        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <WorkspaceLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="counter-args" element={<CounterArgsPage />} />
          <Route path="verdict" element={<VerdictPage />} />
          <Route path="draft" element={<DraftPage />} />
          <Route path="documents" element={<DocumentsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

