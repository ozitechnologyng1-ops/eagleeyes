import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { User, Upload, Save, Building2, CreditCard } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Profile() {
  const { user, updateUser, agents, updateAgent } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    picture: user?.picture || '',
    bankName: user?.bankName || '',
    accountName: user?.accountName || '',
    accountNumber: user?.accountNumber || '',
  });

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        picture: user.picture || '',
        bankName: user.bankName || '',
        accountName: user.accountName || '',
        accountNumber: user.accountNumber || '',
      });
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser(form);
    
    // If the user is also an agent, update their agent record
    const agentRecord = agents.find(a => a.phone === user?.phone);
    if (agentRecord) {
      updateAgent(agentRecord.id, form);
    }
    
    setIsEditing(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        {!isEditing && (
          <button 
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-[#004d25] text-white rounded-lg hover:bg-[#006331] transition-colors"
          >
            Edit Profile
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="h-32 bg-[#004d25]"></div>
        
        <form onSubmit={handleSubmit} className="px-8 pb-8">
          <div className="relative flex justify-between items-end -mt-16 mb-8">
            <div className="relative">
              <div className="w-32 h-32 rounded-full border-4 border-white bg-gray-100 flex items-center justify-center overflow-hidden shadow-md">
                {form.picture ? (
                  <img src={form.picture} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="text-gray-400" size={48} />
                )}
              </div>
              {isEditing && (
                <label className="absolute bottom-0 right-0 bg-[#004d25] text-white p-2 rounded-full cursor-pointer hover:bg-[#006331] shadow-sm transition-colors">
                  <Upload size={16} />
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const reader = new FileReader();
                        reader.onload = (e) => setForm({...form, picture: e.target?.result as string});
                        reader.readAsDataURL(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              )}
            </div>
            
            {isEditing && (
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#004d25] text-white rounded-lg hover:bg-[#006331] transition-colors flex items-center gap-2"
                >
                  <Save size={18} />
                  Save Changes
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <User size={20} className="text-[#004d25]" />
                  Personal Information
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <input 
                        type="text" 
                        value={form.firstName} 
                        onChange={e => setForm({...form, firstName: e.target.value})}
                        disabled={!isEditing}
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <input 
                        type="text" 
                        value={form.lastName} 
                        onChange={e => setForm({...form, lastName: e.target.value})}
                        disabled={!isEditing}
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input 
                      type="tel" 
                      value={form.phone} 
                      onChange={e => setForm({...form, phone: e.target.value})}
                      disabled={!isEditing}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <input 
                      type="text" 
                      value={user?.role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} 
                      disabled
                      className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Building2 size={20} className="text-[#004d25]" />
                  Bank Details
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                    {isEditing ? (
                      <select 
                        value={form.bankName} 
                        onChange={e => setForm({...form, bankName: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25]"
                      >
                        <option value="">Select Bank...</option>
                        <option value="Opay">Opay</option>
                        <option value="Palm Pay">Palm Pay</option>
                        <option value="Moniepoint">Moniepoint</option>
                        <option value="Other">Other</option>
                      </select>
                    ) : (
                      <input 
                        type="text"
                        value={form.bankName || 'Not Set'}
                        disabled
                        className="w-full border border-gray-300 rounded-lg p-2 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                    <input 
                      type="text" 
                      value={form.accountName} 
                      onChange={e => setForm({...form, accountName: e.target.value})}
                      disabled={!isEditing}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                    <input 
                      type="text" 
                      value={form.accountNumber} 
                      onChange={e => setForm({...form, accountNumber: e.target.value})}
                      disabled={!isEditing}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
