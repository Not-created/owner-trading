import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-term-bg text-term-secondary font-mono text-sm" data-testid="auth-loading">
        <span className="term-cursor">initializing session</span>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}
