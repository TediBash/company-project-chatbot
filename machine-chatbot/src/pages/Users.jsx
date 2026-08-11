import { DynamicTable } from '../components/ui/DynamicTable';
import { RoleBadge } from '../components/ui/RoleBadge';

const UsersPage = () => {
  const usersData = [
    { id: '1', firstName: 'Mario', lastName: 'Rossi', email: 'mario@company-a.com', visibility: 'full' },
    { id: '2', firstName: 'Luigi', lastName: 'Verdi', email: 'luigi@company-a.com', visibility: 'technician' },
  ];

  const columns = [
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'email', label: 'Email', render: (val) => <span className="text-gray-500">{val}</span> },
    { key: 'visibility', label: 'Role', render: (val) => <RoleBadge role={val} /> }
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] p-8 md:p-12 lg:p-16">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Luxury Header Area */}
        <header className="flex items-end justify-between pb-6 border-b border-gray-200">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-widest text-[var(--color-primary)] uppercase">Administration</p>
            <h1 className="text-4xl font-light tracking-tight text-gray-900">User Management</h1>
          </div>
          <button className="px-6 py-2.5 text-sm font-medium text-white transition-all duration-300 rounded-md bg-[var(--color-primary)] hover:opacity-90 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
            + Invite User
          </button>
        </header>

        {/* The Dynamic Table Component */}
        <DynamicTable 
          columns={columns} 
          data={usersData} 
          onRowClick={(user) => console.log('Edit', user.id)} 
        />
        
      </div>
    </div>
  );
};