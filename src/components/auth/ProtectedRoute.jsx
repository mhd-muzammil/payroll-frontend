import { Navigate, Outlet, useLocation } from "react-router-dom";
import { canAccessRole, getDefaultRouteByRole, getUserRole, isAuthenticated, canAccessSection } from "@/auth/rbac";

const ProtectedRoute = ({ allowedRoles }) => {
  const location = useLocation();
  const role = getUserRole();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!canAccessRole(role, allowedRoles)) {
    return <Navigate to={getDefaultRouteByRole(role)} replace />;
  }

  const sectionName = location.pathname.replace(/^\//, "");
  if (sectionName && sectionName !== "dashboard" && !canAccessSection(sectionName)) {
    return <Navigate to={getDefaultRouteByRole(role)} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
