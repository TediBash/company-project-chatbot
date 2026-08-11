import { Navigate, Outlet } from 'react-router-dom';

const ProtectedRoute = () => {
  // Read from local storage (or a global AuthContext if implemented)
  const token = localStorage.getItem('arol_token');
  const user = JSON.parse(localStorage.getItem('arol_user') || 'null');

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet context={{ user }} />;
};

export default ProtectedRoute;