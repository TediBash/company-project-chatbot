// src/hooks/useTenant.js
import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { jwtDecode } from 'jwt-decode';

export const useTenant = () => {
  const [tenant, setTenant] = useState(null);
  const [status, setStatus] = useState('LOADING');

  useEffect(() => {
    const fetchTenant = async () => {
      try {
        // 1. If logged in, extract strictly from the signed JWT
        const token = localStorage.getItem('arol_token');
        if (token) {
          const decoded = jwtDecode(token);
          setTenant(decoded.tenant);
          setStatus('SUCCESS');
          return;
        }

        // 2. Fallback for public Login Page
        const urlParams = new URLSearchParams(window.location.search);
        const queryTenant = urlParams.get('tenant');

        let slug = queryTenant;
        if (!slug) {
          const hostname = window.location.hostname;
          slug = hostname === 'localhost' ? 'arol' : hostname.split('.')[0]; 
        }

        const response = await apiClient.get(`/public/tenant/${slug}`);
        setTenant(response.data);
        setStatus('SUCCESS');
      } catch (error) {
        console.error('Failed to load tenant', error);
        setStatus('NOT_FOUND');
      }
    };

    fetchTenant();
  }, []);

  return { tenant, status };
};