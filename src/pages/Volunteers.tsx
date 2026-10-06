import React, { useState, useEffect, useCallback } from 'react';
import { useApp, Location, Role } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { 
  Users, Search, Filter, CheckCircle2, UserPlus, Phone, Mail, MapPin, 
  Calendar, Check, AlertCircle, Loader2, RefreshCw, ChevronRight, X, Edit3, Shield
} from 'lucide-react';
import { cn, getFriendlyErrorMessage } from '../lib/utils';
import toast from 'react-hot-toast';
import AgentModal from '../components/AgentModal';

export interface Volunteer {
  id: string;
  created_at: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  state_id: number;
  local_government_id: number | null;
  ward_id: number | null;
  help_categories: string[] | null;
  message: string | null;
  // Resolved names
  state_name?: string;
  lga_name?: string;
  ward_name?: string;
}

interface VolunteersProps {
  embedded?: boolean;
}

export default function Volunteers({ embedded = false }: VolunteersProps) {
  const { user, locations, addAgent } = useApp();
  
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLgaFilter, setSelectedLgaFilter] = useState<string>('all');
  
  // Available LGAs & Wards for the State
  const [stateLgas, setStateLgas] = useState<{ id: number; name: string }[]>([]);
  const [wardMap, setWardMap] = useState<Record<number, { id: number; name: string }[]>>({});
  
  // Edit Jurisdiction Modal
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);
  const [editLgaId, setEditLgaId] = useState<number | null>(null);
  const [editWardId, setEditWardId] = useState<number | null>(null);
  const [editWardsList, setEditWardsList] = useState<{ id: number; name: string }[]>([]);
  const [isUpdatingJurisdiction, setIsUpdatingJurisdiction] = useState(false);

  // Convert/Assign to Agent Modal
  const [assigningVolunteer, setAssigningVolunteer] = useState<Volunteer | null>(null);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [agentInitialData, setAgentInitialData] = useState<any>(null);
  const [agentFixedLocation, setAgentFixedLocation] = useState<Location | null>(null);

  // Only state_admin (and national_admin fallback) should view
  const canView = user?.role === 'state_admin' || user?.role === 'national_admin';
  const userStateId = user?.stateId;

  // 1. Fetch State LGAs
  useEffect(() => {
    if (!userStateId) return;
    const fetchLgas = async () => {
      const { data } = await supabase
        .from('local_governments')
        .select('id, name')
        .eq('state_id', userStateId)
        .order('name');
      if (data) setStateLgas(data);
    };
    fetchLgas();
  }, [userStateId]);

  // 2. Fetch Volunteers for user's state
  const fetchVolunteers = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      let query = supabase.from('volunteers').select('*');
      
      // State agents only see people that are volunteering in their state
      if (userStateId) {
        query = query.eq('state_id', userStateId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        setVolunteers([]);
        setIsLoading(false);
        return;
      }

      // Collect LGA IDs and Ward IDs to resolve names
      const lgaIds = Array.from(new Set(data.map(v => v.local_government_id).filter(Boolean))) as number[];
      const wardIds = Array.from(new Set(data.map(v => v.ward_id).filter(Boolean))) as number[];

      let lgaMapLocal: Record<number, string> = {};
      let wardMapLocal: Record<number, string> = {};

      if (lgaIds.length > 0) {
        const { data: lgas } = await supabase
          .from('local_governments')
          .select('id, name')
          .in('id', lgaIds);
        if (lgas) {
          lgas.forEach(l => { lgaMapLocal[l.id] = l.name; });
        }
      }

      if (wardIds.length > 0) {
        const { data: wards } = await supabase
          .from('wards')
          .select('id, name')
          .in('id', wardIds);
        if (wards) {
          wards.forEach(w => { wardMapLocal[w.id] = w.name; });
        }
      }

      const enriched: Volunteer[] = data.map(v => ({
        ...v,
        lga_name: v.local_government_id ? lgaMapLocal[v.local_government_id] || `LGA #${v.local_government_id}` : 'Unassigned',
        ward_name: v.ward_id ? wardMapLocal[v.ward_id] || `Ward #${v.ward_id}` : 'Unassigned'
      }));

      setVolunteers(enriched);
    } catch (err: any) {
      console.error('Error fetching volunteers:', err);
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [canView, userStateId]);

  useEffect(() => {
    fetchVolunteers();
  }, [fetchVolunteers]);

  // Handle changing editing LGA and loading its wards
  const handleEditLgaChange = async (lgaId: number | null) => {
    setEditLgaId(lgaId);
    setEditWardId(null);
    if (!lgaId) {
      setEditWardsList([]);
      return;
    }
    const { data } = await supabase
      .from('wards')
      .select('id, name')
      .eq('localgovernment_id', lgaId)
      .order('name');
    setEditWardsList(data || []);
  };

  const openEditJurisdiction = async (v: Volunteer) => {
    setEditingVolunteer(v);
    setEditLgaId(v.local_government_id);
    setEditWardId(v.ward_id);

    if (v.local_government_id) {
      const { data } = await supabase
        .from('wards')
        .select('id, name')
        .eq('localgovernment_id', v.local_government_id)
        .order('name');
      setEditWardsList(data || []);
    } else {
      setEditWardsList([]);
    }
  };

  // Save jurisdiction change to Supabase
  const handleSaveJurisdiction = async () => {
    if (!editingVolunteer) return;
    setIsUpdatingJurisdiction(true);
    try {
      const { error } = await supabase
        .from('volunteers')
        .update({
          local_government_id: editLgaId,
          ward_id: editWardId
        })
        .eq('id', editingVolunteer.id);

      if (error) throw error;

      toast.success('Jurisdiction updated successfully');
      setEditingVolunteer(null);
      fetchVolunteers();
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setIsUpdatingJurisdiction(false);
    }
  };

  // Open Assign / Convert to Agent modal
  const handleOpenAssignModal = (v: Volunteer) => {
    setAssigningVolunteer(v);
    
    // Parse first/last name
    const parts = (v.full_name || '').trim().split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    // Determine initial role & location
    const initialRole: Role = v.ward_id ? 'ward_admin' : v.local_government_id ? 'lga_admin' : 'pu_agent';
    
    // Try to find matching Location object if present in context
    let matchedLoc: Location | null = null;
    if (v.ward_id) {
      matchedLoc = locations.find(l => l.id === `ward_${v.ward_id}`) || null;
    } else if (v.local_government_id) {
      matchedLoc = locations.find(l => l.id === `lga_${v.local_government_id}`) || null;
    }

    setAgentFixedLocation(matchedLoc);
    setAgentInitialData({
      firstName,
      lastName,
      name: v.full_name,
      phone: v.phone_number,
      role: initialRole,
      stateId: v.state_id,
      lgaId: v.local_government_id,
      wardId: v.ward_id,
      locationId: matchedLoc?.id || (v.ward_id ? `ward_${v.ward_id}` : v.local_government_id ? `lga_${v.local_government_id}` : `state_${v.state_id}`)
    });
    setIsAgentModalOpen(true);
  };

  // Handle agent registration success
  const handleSaveAgent = async (agentData: any) => {
    try {
      await addAgent(agentData);
      toast.success(`Successfully registered ${assigningVolunteer?.full_name} as an Agent!`);
      setIsAgentModalOpen(false);
      setAssigningVolunteer(null);
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err));
    }
  };

  // Filter volunteers
  const filteredVolunteers = volunteers.filter(v => {
    const matchesSearch = 
      v.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.phone_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.email && v.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (v.message && v.message.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesLga = 
      selectedLgaFilter === 'all' || 
      String(v.local_government_id) === selectedLgaFilter;

    return matchesSearch && matchesLga;
  });

  if (!canView) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center shadow-xs">
        <Shield className="mx-auto text-amber-500 mb-3" size={40} />
        <h3 className="text-base font-bold text-gray-900">Restricted Access</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
          The Volunteers section is designated for State Administrators to inspect and deploy volunteers within their state command.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", embedded ? "" : "h-full flex flex-col")}>
      {/* Header section (if full page) */}
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
              <span>Volunteers</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                {volunteers.length} Submissions
              </span>
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
              Review volunteer applications for your state, modify jurisdictions, and deploy them as official agents.
            </p>
          </div>
          <button
            onClick={fetchVolunteers}
            disabled={isLoading}
            className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin text-emerald-600" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search volunteer by name, phone, email, or message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#004d25] focus:border-transparent"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter size={15} className="text-gray-400 shrink-0" />
          <select
            value={selectedLgaFilter}
            onChange={(e) => setSelectedLgaFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#004d25]"
          >
            <option value="all">All LGAs ({volunteers.length})</option>
            {stateLgas.map(lga => {
              const count = volunteers.filter(v => v.local_government_id === lga.id).length;
              return (
                <option key={lga.id} value={String(lga.id)}>
                  {lga.name} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Volunteers Table / List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-400">
            <Loader2 size={32} className="animate-spin text-[#004d25] mb-2" />
            <p className="text-xs font-medium">Loading volunteer records...</p>
          </div>
        ) : filteredVolunteers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Users size={36} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-700">No volunteers found</p>
            <p className="text-xs text-gray-400 mt-1">
              {searchTerm || selectedLgaFilter !== 'all' 
                ? 'Try adjusting your search query or LGA filter.' 
                : 'No volunteer submissions recorded for your state yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="py-3 px-4">Volunteer</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Requested Jurisdiction</th>
                  <th className="py-3 px-4">Interests & Help</th>
                  <th className="py-3 px-4">Date Submitted</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                {filteredVolunteers.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/60 transition">
                    {/* Volunteer Name & Initials */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-[#004d25] font-bold text-xs flex items-center justify-center shrink-0 uppercase shadow-xs">
                          {v.full_name.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-xs sm:text-sm">{v.full_name}</div>
                          {v.message && (
                            <p className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-1 max-w-xs" title={v.message}>
                              "{v.message}"
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contact details */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-gray-800 font-mono text-[11px]">
                          <Phone size={12} className="text-gray-400" />
                          <span>{v.phone_number}</span>
                        </div>
                        {v.email && (
                          <div className="flex items-center gap-1.5 text-gray-500 text-[11px]">
                            <Mail size={12} className="text-gray-400" />
                            <span className="truncate max-w-[140px]" title={v.email}>{v.email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Jurisdiction Pill + Edit Button */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-medium text-gray-900">
                          <MapPin size={12} className="text-[#004d25] shrink-0" />
                          <span>{v.lga_name}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 pl-4">
                          {v.ward_name}
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditJurisdiction(v)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline pt-0.5 cursor-pointer"
                        >
                          <Edit3 size={10} />
                          <span>Change Jurisdiction</span>
                        </button>
                      </div>
                    </td>

                    {/* Help categories */}
                    <td className="py-3.5 px-4">
                      {v.help_categories && v.help_categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {v.help_categories.map((cat, i) => (
                            <span 
                              key={i} 
                              className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-[10px] font-medium"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-[11px] italic">General Volunteer</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-gray-500 text-[11px] whitespace-nowrap">
                      {new Date(v.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>

                    {/* Actions: Assign as Agent */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenAssignModal(v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#004d25] hover:bg-[#006331] text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                        title="Accept and onboard as an official agent"
                      >
                        <UserPlus size={13} />
                        <span>Assign as Agent</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Jurisdiction Modal */}
      {editingVolunteer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6 border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Change Jurisdiction</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Update assigned LGA & Ward for {editingVolunteer.full_name}
                </p>
              </div>
              <button 
                onClick={() => setEditingVolunteer(null)} 
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* LGA Select */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Local Government Area (LGA)
                </label>
                <select
                  value={editLgaId || ''}
                  onChange={(e) => handleEditLgaChange(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium text-gray-800 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none"
                >
                  <option value="">Select LGA...</option>
                  {stateLgas.map(lga => (
                    <option key={lga.id} value={lga.id}>{lga.name}</option>
                  ))}
                </select>
              </div>

              {/* Ward Select */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Ward
                </label>
                <select
                  disabled={!editLgaId}
                  value={editWardId || ''}
                  onChange={(e) => setEditWardId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium text-gray-800 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">Select Ward...</option>
                  {editWardsList.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {!editLgaId && (
                  <p className="text-[10px] text-gray-400 mt-1">Please select an LGA first to pick a ward.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditingVolunteer(null)}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingJurisdiction}
                onClick={handleSaveJurisdiction}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#004d25] hover:bg-[#006331] text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isUpdatingJurisdiction ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboard Volunteer as Agent Modal */}
      {isAgentModalOpen && (
        <AgentModal
          isOpen={isAgentModalOpen}
          onClose={() => {
            setIsAgentModalOpen(false);
            setAssigningVolunteer(null);
          }}
          onSave={handleSaveAgent}
          initialData={agentInitialData}
          fixedLocation={agentFixedLocation || undefined}
          locations={locations}
          userRole={user.role}
        />
      )}
    </div>
  );
}
