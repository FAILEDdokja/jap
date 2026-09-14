import { Navigate, useLocation } from "react-router-dom";
import type { Role } from "@/data/types";
import { useAuth } from "@/auth/AuthContext";
import { PageLoader } from "@/components/ui/primitives";

export function ProtectedRoute({ children, allow }: { children: JSX.Element; allow?: Role[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (allow && !allow.includes(user.role)) {
    return <Navigate to="/app" replace />;
  }
  return children;
}
