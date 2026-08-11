import { Navigate, useOutletContext } from 'react-router-dom';

const RoleGuard = ({ allowedRoles, children }) => {
  const { user } = useOutletContext(); // Passed down from ProtectedRoute

  if (!user || !allowedRoles.includes(user.visibility)) {
    // If a commercial user tries to access a technician page, bounce them to the dashboard
    return <Navigate to="/machines" replace />;
  }

  return children;
};

export default RoleGuard;