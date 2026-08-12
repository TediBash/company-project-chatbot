import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

export const LoginPage = ({ tenant }) => {
  // 1. Maintain a local tenant state so we can swap it dynamically
  const [activeTenant, setActiveTenant] = useState(tenant);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // 2. Ensure CSS variables are applied when the component mounts or tenant changes
  useEffect(() => {
    if (activeTenant?.primaryColor) {
      document.documentElement.style.setProperty('--color-tenant-primary', activeTenant.primaryColor);
    }
  }, [activeTenant]);

  // 3. The "Home Realm Discovery" magic
  const handleEmailBlur = async () => {
    if (!email || !email.includes('@')) return;

    // Extract the slug from the email (e.g., admin@alpine-dairy.com -> alpine-dairy)
    const domain = email.split('@')[1];
    const derivedSlug = domain.split('.')[0]; 

    // Don't fetch if it's already the active tenant
    if (derivedSlug === activeTenant?.subdomainSlug) return;

    try {
      // Ask the backend if this company exists
      const response = await apiClient.get(`/public/tenant/${derivedSlug}`);
      
      // If it exists, update the UI smoothly to the new company's branding!
      setActiveTenant(response.data);
      setError(''); 
    } catch (err) {
      // If 404 (tenant not found), we fail silently and just keep the current branding
      console.log('No specific tenant branding found for this email domain.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
        tenantSlug: activeTenant?.subdomainSlug || 'arol' 
      });

      const { token, user } = response.data;

      localStorage.setItem('arol_token', token);

      navigate('/dashboard');

    } catch (err) {
      console.error('Login error:', err);
      setError(
        err.response?.data?.message || 
        'An error occurred during authentication. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#fafafa] overflow-hidden transition-colors duration-700">
      
      {/* Dynamic Background Accent */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none transition-all duration-1000 ease-in-out"
        style={{
          background: `radial-gradient(circle at 50% 0%, var(--color-tenant-primary) 0%, transparent 70%)`
        }}
      />

      <div className="relative w-full max-w-md px-6 z-10">
        
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-white/50 p-10 md:p-12 transition-all duration-500">
          
          <div className="text-center mb-10 space-y-2">
            {activeTenant?.logoUrl ? (
              <img src={activeTenant.logoUrl} alt={activeTenant.companyName} className="h-8 mx-auto mb-6 transition-opacity duration-300" />
            ) : (
              <div className="w-12 h-12 rounded bg-[var(--color-tenant-primary)] mx-auto mb-6 flex items-center justify-center shadow-lg transition-colors duration-700">
                <span className="text-white text-xl font-light">
                  {activeTenant?.companyName?.charAt(0) || 'A'}
                </span>
              </div>
            )}
            
            <h1 className="text-2xl font-light tracking-tight text-gray-900">
              Welcome back
            </h1>
            <p className="text-xs font-semibold tracking-widest text-[var(--color-tenant-primary)] uppercase transition-colors duration-700">
              {activeTenant?.companyName || 'AROL Platform'}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-8">
            
            <div className="relative group">
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur} // <-- Triggers when user clicks outside the email box
                required
                className="block w-full px-0 py-3 text-sm text-gray-900 bg-transparent border-0 border-b border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-[var(--color-tenant-primary)] transition-colors duration-300 peer"
                placeholder=" "
              />
              <label
                htmlFor="email"
                className="absolute text-xs text-gray-400 uppercase tracking-widest duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-[var(--color-tenant-primary)] peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6"
              >
                Email Address
              </label>
            </div>

            <div className="relative group">
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="block w-full px-0 py-3 text-sm text-gray-900 bg-transparent border-0 border-b border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-[var(--color-tenant-primary)] transition-colors duration-300 peer"
                placeholder=" "
              />
              <label
                htmlFor="password"
                className="absolute text-xs text-gray-400 uppercase tracking-widest duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-[var(--color-tenant-primary)] peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6"
              >
                Password
              </label>
            </div>

            <div className="h-6">
              {error && (
                <p className="text-xs font-light text-red-500 animate-pulse text-center">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center py-3.5 px-4 rounded-md text-xs font-bold tracking-[0.2em] text-white bg-[var(--color-tenant-primary)] hover:opacity-90 focus:outline-none transition-all duration-700 uppercase shadow-[0_8px_20px_-8px_var(--color-tenant-primary)] disabled:opacity-50"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};

export default LoginPage;