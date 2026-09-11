import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { User, Upload, Save, CreditCard, MessageSquare, Unlink, CheckCircle2, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { greenApiService, WhatsAppInstance } from '../lib/greenApi';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import FileUpload, { UploadedFile } from '../components/FileUpload';

export default function Profile() {
  const { user, updateUser, agents, updateAgent } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    picture: user?.picture || '',
  });

  const [waInstance, setWaInstance] = useState<WhatsAppInstance | null>(null);
  const [loadingWa, setLoadingWa] = useState(false);
  const [disconnectingWa, setDisconnectingWa] = useState(false);
  const [myDocuments, setMyDocuments] = useState<UploadedFile[]>([]);

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        picture: user.picture || '',
      });
      loadWhatsAppInstance();
      loadDocuments();
    }
  }, [user, agents]);

  const loadDocuments = async () => {
    const currentAgentId = user?.id || agents.find(a => a.phone === user?.phone)?.id;
    if (!currentAgentId) return;
    try {
      const { data } = await supabase
        .from('agents')
        .select('supporting_documents')
        .eq('id', currentAgentId)
        .maybeSingle();
      if (data?.supporting_documents && Array.isArray(data.supporting_documents)) {
        setMyDocuments(data.supporting_documents);
      }
    } catch (e) {
      console.error('Failed to load agent documents:', e);
    }
  };

  const handleDocumentsChange = async (files: UploadedFile[]) => {
    setMyDocuments(files);
    const currentAgentId = user?.id || agents.find(a => a.phone === user?.phone)?.id;
    if (currentAgentId) {
      try {
        await supabase
          .from('agents')
          .update({ supporting_documents: files })
          .eq('id', currentAgentId);
        toast.success('Supporting documents saved');
      } catch (err: any) {
        toast.error('Failed to save documents: ' + err.message);
      }
    }
  };

  const loadWhatsAppInstance = async () => {
    const currentAgentId = user?.id || agents.find(a => a.phone === user?.phone)?.id;
    setLoadingWa(true);
    try {
      let inst: WhatsAppInstance | null = null;
      if (currentAgentId) {
        inst = await greenApiService.getAgentInstance(currentAgentId);
      }
      if (!inst && user?.phone) {
        const cleanPhone = user.phone.replace(/\D/g, '').slice(-10);
        const { data } = await supabase
          .from('whatsapp_instances')
          .select('*')
          .or(`phone_number.ilike.%${cleanPhone}%,assigned_agent_id.eq.${currentAgentId}`)
          .maybeSingle();
        inst = data;
      }
      setWaInstance(inst);
    } catch (e) {
      console.error('Failed to load agent WhatsApp instance:', e);
    } finally {
      setLoadingWa(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!waInstance) return;
    if (!confirm('Are you sure you want to disconnect your WhatsApp account? You will need to reconnect it from the Voters section to send outreach messages.')) {
      return;
    }

    setDisconnectingWa(true);
    const toastId = toast.loading('Disconnecting WhatsApp account...');
    try {
      await greenApiService.disconnectAgentInstance(waInstance.id);
      setWaInstance(null);
      toast.success('WhatsApp disconnected successfully', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect WhatsApp', { id: toastId });
    } finally {
      setDisconnectingWa(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser(form);
    
    // If the user is also an agent, update their agent record
    const agentRecord = agents.find(a => a.phone === user?.phone);
    if (agentRecord) {
      updateAgent(agentRecord.id, form);
    }
    
    setIsEditing(false);
    toast.success('Profile updated successfully');
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
                  <MessageSquare size={20} className="text-[#004d25]" />
                  WhatsApp Integration
                </h3>

                {loadingWa ? (
                  <div className="p-8 border border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500">
                    <RefreshCw size={24} className="animate-spin text-[#004d25]" />
                    <span className="text-xs">Checking WhatsApp connection status...</span>
                  </div>
                ) : waInstance && waInstance.wa_state === 'authorized' ? (
                  <div className="p-5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600"></span>
                        </span>
                        <span className="text-sm font-bold text-emerald-950">WhatsApp Connected</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Active
                      </span>
                    </div>

                    <div className="space-y-2 text-xs bg-white/80 p-3 rounded-lg border border-emerald-100">
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-500">Connected Phone</span>
                        <span className="font-mono font-semibold text-gray-800">
                          {waInstance.phone_number ? `+${waInstance.phone_number}` : form.phone}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-500">Instance ID</span>
                        <span className="font-mono text-gray-700">#{waInstance.id_instance}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-gray-500">Voter Outreach</span>
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 size={13} /> Enabled
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDisconnectWhatsApp}
                      disabled={disconnectingWa}
                      className="w-full px-4 py-2.5 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <Unlink size={16} />
                      {disconnectingWa ? 'Disconnecting Account...' : 'Disconnect WhatsApp'}
                    </button>
                    <p className="text-[11px] text-gray-500 text-center">
                      Disconnecting will unpair this WhatsApp account from the system.
                    </p>
                  </div>
                ) : (
                  <div className="p-6 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-center space-y-3">
                    <div className="w-10 h-10 mx-auto rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">No WhatsApp Connected</h4>
                      <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                        Your WhatsApp account is not linked yet. You can connect it in the Voters section to send flyers and campaign messages.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-3 text-xs text-gray-600">
                <CreditCard size={18} className="text-[#004d25] shrink-0" />
                <span>Bank details and payout accounts are managed in the <strong>Payment</strong> tab.</span>
              </div>
            </div>
          </div>

          {/* Supporting Documents & Documentation Section */}
          <div className="mt-8 pt-6 border-t border-gray-100 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FileText size={20} className="text-[#004d25]" />
                Official Documentation & Records
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Upload your ID card, party credentials, or documentation for administrative verification and record keeping.
              </p>
            </div>

            <FileUpload
              label="Supporting Documentation"
              description="Upload ID proof, appointment letters, or credential files (PDF, Word, Excel, Images up to 10MB)"
              value={myDocuments}
              onChange={handleDocumentsChange}
              allowedExtensions={['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv', 'png', 'jpg', 'jpeg']}
              maxFiles={5}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
