// src/components/guards/RoleGuard.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const RoleGuard = ({ allowedRoles, children }) => {
  const token = localStorage.getItem('arol_token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  try {
    const decoded = jwtDecode(token);
    const userRole = decoded.user.visibility;

    if (!allowedRoles.includes(userRole)) {
      // If a technician tries to force their way into /users via URL, block them
      return <Navigate to="/dashboard" replace />;
    }

    return children;
  } catch (error) {
    return <Navigate to="/login" replace />;
  }
};

export default RoleGuard;