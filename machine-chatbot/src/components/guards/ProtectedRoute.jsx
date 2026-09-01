import { Navigate, Outlet, useLocation } from 'react-router-dom';

const ProtectedRoute = () => {
  const token = localStorage.getItem('arol_token');
  const location = useLocation();
  
  let user = null;

  try {
    const storedUser = localStorage.getItem('arol_user');
    
    // 1. Safely protect against the "undefined" crash
    if (storedUser && storedUser !== 'undefined' && storedUser !== 'null') {
      user = JSON.parse(storedUser);
    } 
    // 2. If it's missing, automatically extract it directly from the JWT payload!
    else if (token) {
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payloadBase64));
      user = decodedPayload.user || decodedPayload;
    }
  } catch (error) {
    console.warn("Could not parse user from local storage or token.", error);
  }

  // 3. Only reject if the token itself is missing
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet context={{ user }} />;
};

export default ProtectedRoute;