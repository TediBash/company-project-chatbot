// src/hooks/useTenant.js
import { useState, useEffect } from 'react';
import apiClient from '../api/client';

export const useTenant = () => {
  const [tenant, setTenant] = useState(null);
  const [status, setStatus] = useState('LOADING');

  useEffect(() => {
    const fetchTenant = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const queryTenant = urlParams.get('tenant');

        let slug = queryTenant;
        if (!slug) {
          const hostname = window.location.hostname;
          // Updated fallback to arol
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