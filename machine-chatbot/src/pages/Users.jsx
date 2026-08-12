// src/pages/Users.jsx
import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { DynamicTable } from '../components/ui/DynamicTable';
import { RoleBadge } from '../components/ui/RoleBadge';
import { BaseModal } from '../components/ui/BaseModal';
import { jwtDecode } from 'jwt-decode';

export const UsersPage = () => {
  // Decode Token to check Admin status and extract the Company Domain
  let isAdmin = false;
  let tenantDomain = 'company.com';
  
  const token = localStorage.getItem('arol_token');
  if (token) {
    try {
      const decoded = jwtDecode(token);
      isAdmin = decoded.user?.visibility === 'full';
      // Automatically construct domain from the slug (e.g., 'alpine-dairy' -> 'alpine-dairy.com')
      if (decoded.tenant?.subdomainSlug) {
        tenantDomain = `${decoded.tenant.subdomainSlug}.com`;
      }
    } catch (e) {
      console.error('Invalid token format');
    }
  }

  // Data & Loading States
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter States
  const [filters, setFilters] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    visibility: ''
  });

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form State for Creating (using emailPrefix instead of full email)
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    emailPrefix: '', 
    password: '',
    jobTitle: '',
    visibility: 'technician'
  });

  // Form State for Editing
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    visibility: 'technician',
    password: ''
  });

  // Fetch Users
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/users', { params: filters });
      setUsers(response.data);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load personnel directory. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [fetchUsers]);

  // Modals Handlers
  const openCreateModal = () => {
    setCreateForm({
      firstName: '',
      lastName: '',
      emailPrefix: '', // Reset prefix
      password: '',
      jobTitle: '',
      visibility: 'technician'
    });
    setIsCreateModalOpen(true);
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setEditForm({
      firstName: user.firstName,
      lastName: user.lastName,
      jobTitle: user.jobTitle,
      visibility: user.visibility,
      password: ''
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (user) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  // API Call: Create User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      // Stitch the prefix and domain together for the backend
      const payload = {
        ...createForm,
        email: `${createForm.emailPrefix}@${tenantDomain}`
      };
      
      await apiClient.post('/users', payload);
      setIsCreateModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Error creating user:', err);
      alert(err.response?.data?.message || 'Failed to create user.');
    }
  };

  // API Call: Update User
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...editForm };
      if (!payload.password) delete payload.password;

      await apiClient.put(`/users/${selectedUser.id}`, payload);
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Error updating user:', err);
      alert('Failed to update user. Please check your permissions.');
    }
  };

  // API Call: Delete User
  const handleDeleteUser = async () => {
    try {
      await apiClient.delete(`/users/${selectedUser.id}`);
      setIsDeleteModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user. Please check your permissions.');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const columns = [
    { 
      key: 'name', 
      label: 'Full Name',
      render: (_, row) => (
        <span className="font-medium text-gray-900">
          {row.firstName} {row.lastName}
        </span>
      ) 
    },
    { 
      key: 'email', 
      label: 'Email Address',
      render: (val) => <span className="text-gray-500 font-light">{val}</span> 
    },
    { 
      key: 'jobTitle', 
      label: 'Position',
      render: (val) => <span className="text-gray-700 font-light">{val}</span>
    },
    { 
      key: 'visibility', 
      label: 'Access Scope',
      render: (val) => <RoleBadge role={val} /> 
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-4">
          <button 
            onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
            className="text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-[var(--color-tenant-primary)] transition-colors"
          >
            Edit
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); openDeleteModal(row); }}
            className="text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-red-500 transition-colors"
          >
            Delete
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="p-8 md:p-12 lg:p-16 animate-in fade-in duration-500">
      
      <header className="flex flex-col sm:flex-row sm:items-end justify-between pb-6 border-b border-gray-200 gap-4 mb-8">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[var(--color-tenant-primary)] uppercase">
            Administration
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-gray-900">
            User Directory
          </h1>
        </div>
        <button 
          onClick={openCreateModal}
          className="self-start sm:self-auto px-6 py-2.5 text-xs font-bold tracking-wider text-white transition-all duration-300 rounded-md bg-[var(--color-tenant-primary)] hover:opacity-90 shadow-[0_4px_14px_rgba(0,0,0,0.12)] uppercase"
        >
          + Create User
        </button>
      </header>

      <div className="flex flex-wrap gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <input 
          type="text" 
          name="firstName" 
          placeholder="Filter by First Name..." 
          value={filters.firstName}
          onChange={handleFilterChange}
          className="flex-1 min-w-[150px] px-0 py-2 text-sm bg-transparent border-0 border-b border-gray-200 focus:ring-0 focus:border-[var(--color-tenant-primary)] transition-colors"
        />
        <input 
          type="text" 
          name="lastName" 
          placeholder="Filter by Last Name..." 
          value={filters.lastName}
          onChange={handleFilterChange}
          className="flex-1 min-w-[150px] px-0 py-2 text-sm bg-transparent border-0 border-b border-gray-200 focus:ring-0 focus:border-[var(--color-tenant-primary)] transition-colors"
        />
        <input 
          type="text" 
          name="jobTitle" 
          placeholder="Filter by Position..." 
          value={filters.jobTitle}
          onChange={handleFilterChange}
          className="flex-1 min-w-[150px] px-0 py-2 text-sm bg-transparent border-0 border-b border-gray-200 focus:ring-0 focus:border-[var(--color-tenant-primary)] transition-colors"
        />
        <select 
          name="visibility" 
          value={filters.visibility}
          onChange={handleFilterChange}
          className="flex-1 min-w-[150px] px-0 py-2 text-sm text-gray-600 bg-transparent border-0 border-b border-gray-200 focus:ring-0 focus:border-[var(--color-tenant-primary)] transition-colors uppercase tracking-wider text-xs"
        >
          <option value="">All Roles</option>
          <option value="full">Full Admin</option>
          <option value="technician">Technician</option>
          <option value="commercial">Commercial</option>
        </select>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50/50 border border-red-100 rounded-xl text-sm font-light text-red-600">
          {error}
        </div>
      )}

      <DynamicTable 
        columns={columns} 
        data={users} 
        isLoading={isLoading}
      />

      {/* CREATE MODAL */}
      <BaseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New User"
      >
        <form onSubmit={handleCreateUser} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">First Name</label>
              <input 
                type="text"
                required
                value={createForm.firstName}
                onChange={(e) => setCreateForm({...createForm, firstName: e.target.value})}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Last Name</label>
              <input 
                type="text"
                required
                value={createForm.lastName}
                onChange={(e) => setCreateForm({...createForm, lastName: e.target.value})}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Email Address</label>
            <div className="flex items-end w-full">
              <input 
                type="text"
                required
                placeholder="firstname.lastname"
                value={createForm.emailPrefix}
                // Convert to lowercase and remove spaces for clean emails
                onChange={(e) => setCreateForm({
                  ...createForm, 
                  emailPrefix: e.target.value.replace(/\s+/g, '').toLowerCase()
                })}
                className="flex-1 border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)] placeholder-gray-300"
              />
              <span className="border-b border-gray-300 py-2 text-sm text-gray-500 pointer-events-none select-none px-1">
                @{tenantDomain}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Temporary Password</label>
            <input 
              type="password"
              required
              value={createForm.password}
              onChange={(e) => setCreateForm({...createForm, password: e.target.value})}
              className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Job Title / Position</label>
            <input 
              type="text"
              required
              value={createForm.jobTitle}
              onChange={(e) => setCreateForm({...createForm, jobTitle: e.target.value})}
              className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Platform Access Role</label>
            <select 
              value={createForm.visibility}
              onChange={(e) => setCreateForm({...createForm, visibility: e.target.value})}
              className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
            >
              <option value="full">Full Admin</option>
              <option value="technician">Technician</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => setIsCreateModalOpen(false)}
              className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-5 py-2.5 text-xs font-bold tracking-wider text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md transition-opacity uppercase shadow-sm"
            >
              Create User
            </button>
          </div>
        </form>
      </BaseModal>

      {/* EDIT MODAL */}
      <BaseModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Modify User Profile"
      >
        <form onSubmit={handleUpdateUser} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">First Name</label>
              <input 
                type="text"
                required
                value={editForm.firstName}
                onChange={(e) => setEditForm({...editForm, firstName: e.target.value})}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Last Name</label>
              <input 
                type="text"
                required
                value={editForm.lastName}
                onChange={(e) => setEditForm({...editForm, lastName: e.target.value})}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Job Title / Position</label>
            <input 
              type="text"
              required
              value={editForm.jobTitle}
              onChange={(e) => setEditForm({...editForm, jobTitle: e.target.value})}
              className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Platform Access Role</label>
            <select 
              value={editForm.visibility}
              onChange={(e) => setEditForm({...editForm, visibility: e.target.value})}
              className="w-full border-b border-gray-300 py-2 text-sm bg-white focus:outline-none focus:border-[var(--color-tenant-primary)]"
            >
              <option value="full">Full Admin</option>
              <option value="technician">Technician</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>

          {isAdmin && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">New Password (Optional)</label>
              <input 
                type="password"
                placeholder="Leave blank to keep unchanged"
                value={editForm.password}
                onChange={(e) => setEditForm({...editForm, password: e.target.value})}
                className="w-full border-b border-gray-300 py-2 text-sm focus:outline-none focus:border-[var(--color-tenant-primary)]"
              />
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => setIsEditModalOpen(false)}
              className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-5 py-2.5 text-xs font-bold tracking-wider text-white bg-[var(--color-tenant-primary)] hover:opacity-90 rounded-md transition-opacity uppercase shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </form>
      </BaseModal>

      {/* DELETE CONFIRMATION MODAL */}
      <BaseModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Deletion"
      >
        <div className="space-y-6">
          <p className="text-sm font-light text-gray-600">
            Are you sure you want to remove <span className="font-semibold text-gray-900">{selectedUser?.firstName} {selectedUser?.lastName}</span> from the platform? This action cannot be undone.
          </p>
          
          <div className="flex justify-end gap-3 pt-2">
            <button 
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-5 py-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase hover:bg-gray-50 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleDeleteUser}
              className="px-5 py-2.5 text-xs font-bold tracking-wider text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors uppercase shadow-sm"
            >
              Delete User
            </button>
          </div>
        </div>
      </BaseModal>

    </div>
  );
};

export default UsersPage;