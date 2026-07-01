import './App.css';
import { BrowserRouter,Routes,Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/DashboardPage';
import EmployeePage from './pages/EmployeePage';
import AttendancePage from './pages/AttendancePage';
import PayrollPage from './pages/PayrollPage';
import PayslipPage from './pages/PayslipPage';
// import CalendarPage from './pages/CalendarPage';
import ReportsPage from './pages/ReportsPage';
import LeavePage from './pages/LeavePage';
import LoginPage from './pages/Login';
import UserManagementPage from './pages/UserManagementPage';
import OnboardingPage from './pages/OnboardingPage';
import HiringPage from './pages/HiringPage';
import TasksPage from './pages/TasksPage';
import PerformancePage from './pages/PerformancePage';
import AssetsPage from './pages/AssetsPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { ROLES, getDefaultRouteByRole, getUserRole, isAuthenticated } from './auth/rbac';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
// import CompliancePage from './pages/CompliancePage';

function RoleHomeRedirect() {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <Navigate to={getDefaultRouteByRole(getUserRole())} replace />;
}

function App() {

  return (
    <>
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleHomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]} />}>
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR]} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/hiring" element={<HiringPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/employees" element={<EmployeePage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/assets" element={<AssetsPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.EMPLOYEE]} />}>
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/payslips" element={<PayslipPage />} />
          <Route path="/leaves" element={<LeavePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/performance" element={<PerformancePage />} />
        </Route>


        {/* <Route path="/calendar" element={<CalendarPage />} /> */}
        {/* <Route path='/compliance' element={<CompliancePage />} /> */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
    </>
  )
}

export default App
