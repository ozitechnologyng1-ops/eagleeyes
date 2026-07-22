import React, { useState, useEffect } from 'react';
import { useApp, Voter, VoterNote } from '../context/AppContext';
import { Search, Filter, X, Check, UserCircle, ChevronLeft, ChevronRight, MessageCircle, MessageSquare, Phone, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

export default function Voters() {
  const { user, voters, updateVoterDetails, logVoterContact, locations, votersPage, isLoadingVoters, fetchVotersPage, voterPuFilter, setVoterPuFilter } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteSuccess, setShowNoteSuccess] = useState(false);
  const [wardAgents, setWardAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');

  // Fetch agents in ward for ward_admin to filter voters
  useEffect(() => {
    if (user?.role === 'ward_admin' && user?.wardId) {
      supabase
        .from('agents')
        .select('id, name, phone, polling_units_id')
        .eq('wards_id', user.wardId)
        .eq('role', 'pu_agent')
        .then(({ data }) => {
          const list = data || [];
          setWardAgents(list);
          if (list.length > 0) {
            if (!voterPuFilter) {
              setVoterPuFilter(list[0].polling_units_id);
              setSelectedAgent(list[0].id);
            } else {
              const matching = list.find(a => a.polling_units_id === voterPuFilter);
              if (matching) setSelectedAgent(matching.id);
            }
          }
        });
    }
  }, [user, voterPuFilter, setVoterPuFilter]);

  // Edit fields and notes view state
  const [selectedStatus, setSelectedStatus] = useState<Voter['status'] | null>(null);
  const [showNotesList, setShowNotesList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sort alphabetically by name
  const filteredVoters = voters
    .filter(v => 
      (v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (v.phone || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const currentVoter = selectedVoter ? voters.find(v => String(v.id) === String(selectedVoter.id)) || selectedVoter : null;

  const handleSelectVoter = (voter: Voter) => {
    setSelectedVoter(voter);
    setSelectedStatus(voter.status);
    setNoteText('');
    setShowNoteSuccess(false);
    setShowNotesList(false);
  };

  const handleSaveChanges = async () => {
    if (!currentVoter) return;
    setIsSaving(true);
    try {
      const updates: Partial<Voter> = {};
      if (selectedStatus && selectedStatus !== currentVoter.status) {
        updates.status = selectedStatus;
      }
      if (noteText.trim()) {
        const newNote: VoterNote = {
          text: noteText.trim(),
          agentId: user?.id || 'unknown',
          agentName: user?.name || 'Unknown Agent',
          createdAt: new Date().toISOString()
        };
        updates.notes = [...(currentVoter.notes || []), newNote];
      }

      if (Object.keys(updates).length > 0) {
        await updateVoterDetails(currentVoter.id, updates);
        setNoteText('');
        setShowNoteSuccess(true);
        setTimeout(() => setShowNoteSuccess(false), 3000);
      }
    } catch (err) {
      alert('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const getWhatsAppLink = (phone: string, name: string) => {
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '234' + cleaned.substring(1);
    } else if (!cleaned.startsWith('234') && cleaned.length === 10) {
      cleaned = '234' + cleaned;
    }
    const message = `Hello ${name}, this is a friendly message from the ADC canvassing team. We'd love to chat and hear your feedback about your polling unit! Let us know when is a good time.`;
    return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  };

  const getSMSLink = (phone: string, name: string) => {
    const message = `Hello ${name}, this is a friendly message from the ADC canvassing team. We'd love to chat and hear your feedback about your polling unit! Let us know when is a good time.`;
    return `sms:${phone}?body=${encodeURIComponent(message)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ADC Supporter': return 'bg-green-100 text-green-800 border-green-200';
      case 'Opposition': return 'bg-red-100 text-red-800 border-red-200';
      case 'Undecided': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Unreachable': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStateName = (stateId?: number | null) => {
    if (!stateId) return '';
    const stateLoc = locations.find(l => l.id === `state_${stateId}`);
    return stateLoc ? ` • ${stateLoc.name} State` : '';
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return 'N/A';
    let p = String(phone).replace(/^\+?234/, '0');
    if (p.length === 10 && !p.startsWith('0')) {
      p = '0' + p;
    }
    return p;
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Voter Register</h1>
        <p className="text-gray-500">Manage and update voter canvassing status</p>
      </div>

      {user?.role === 'ward_admin' && wardAgents.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#004d25] uppercase tracking-wider">Agent Monitoring</h2>
            <p className="text-xs text-gray-400">Viewing voter register for the selected agent's polling unit</p>
          </div>
          <select 
            value={selectedAgent} 
            onChange={(e) => {
              const val = e.target.value;
              setSelectedAgent(val);
              const agent = wardAgents.find(a => a.id === val);
              if (agent) {
                setVoterPuFilter(agent.polling_units_id);
              }
            }} 
            className="w-full sm:w-72 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-[#004d25] font-medium text-gray-700 bg-white"
          >
            {wardAgents.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.phone})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by Name or Phone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#004d25] focus:border-transparent"
          />
        </div>
        <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-700">
          <Filter size={20} />
          <span className="hidden sm:inline">Filter</span>
        </button>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          {filteredVoters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
                <UserCircle size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No voters found</h3>
              <p className="text-gray-500">
                {searchTerm ? 'No voters match your search criteria.' : 'Voters to be added soon.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredVoters.map(voter => (
                <li 
                  key={voter.id} 
                  onClick={() => handleSelectVoter(voter)}
                  className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 overflow-hidden">
                      {voter.image ? (
                        <img src={voter.image} alt={voter.name} className="w-full h-full object-cover" />
                      ) : (
                        <UserCircle size={24} />
                      )}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {voter.name}
                      </h4>
                      <p className="text-xs text-gray-500">{formatPhone(voter.phone)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {voter.phone && (
                      <div className="flex items-center gap-1.5 mr-2" onClick={(e) => e.stopPropagation()}>
                        <a 
                          href={getWhatsAppLink(voter.phone, voter.name)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          title="WhatsApp Voter"
                          onClick={() => logVoterContact(voter.id, 'whatsapp')}
                          className="p-1.5 rounded-full hover:bg-green-50 text-green-600 transition-colors"
                        >
                          <MessageCircle size={18} />
                        </a>
                        <a 
                          href={getSMSLink(voter.phone, voter.name)} 
                          title="SMS Voter"
                          onClick={() => logVoterContact(voter.id, 'sms')}
                          className="p-1.5 rounded-full hover:bg-blue-50 text-blue-600 transition-colors"
                        >
                          <MessageSquare size={18} />
                        </a>
                        <a 
                          href={`tel:${voter.phone}`} 
                          title="Call Voter"
                          onClick={() => logVoterContact(voter.id, 'call')}
                          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
                        >
                          <Phone size={18} />
                        </a>
                      </div>
                    )}
                    <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium border", getStatusColor(voter.status))}>
                      {voter.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-gray-100 text-sm text-gray-500 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            Showing {filteredVoters.length} voters {isLoadingVoters && <span className="ml-2 text-xs text-[#004d25] italic font-medium animate-pulse">Loading...</span>}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchVotersPage(votersPage - 1)}
              disabled={votersPage === 1 || isLoadingVoters}
              className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-medium text-gray-700 bg-white px-3 py-1 rounded border border-gray-200">Page {votersPage}</span>
            <button 
              onClick={() => fetchVotersPage(votersPage + 1)}
              disabled={voters.length < 500 || isLoadingVoters}
              className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
              title="Next Page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Side Drawer / Modal for Voter Details */}
        {currentVoter && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setSelectedVoter(null)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300 translate-x-0">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-[#004d25] text-white">
              <h3 className="font-bold text-lg">Voter Details</h3>
              <button onClick={() => setSelectedVoter(null)} className="p-1 hover:bg-[#006331] rounded-full">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mx-auto mb-3 overflow-hidden">
                  {currentVoter.image ? (
                    <img src={currentVoter.image} alt={currentVoter.name} className="w-full h-full object-cover" />
                  ) : (
                    <UserCircle size={48} />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {currentVoter.name}
                </h2>
                <p className="text-gray-500">{currentVoter.puId || currentVoter.vin}</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 block mb-1">Location ID</span>
                    <span className="font-semibold text-gray-900">{currentVoter.locationId}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 block mb-1">PU ID</span>
                    <span className="font-semibold text-gray-900">{currentVoter.puId || currentVoter.vin}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 block mb-1">Phone Number</span>
                    <span className="font-semibold text-gray-900">{formatPhone(currentVoter.phone)}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 block mb-1">Date of Birth</span>
                    <span className="font-semibold text-gray-900">{currentVoter.dob || 'N/A'}</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Update Status</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(['ADC Supporter', 'Opposition', 'Undecided', 'Unreachable'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setSelectedStatus(status)}
                        className={cn(
                          "p-3 rounded-lg border text-sm font-medium flex items-center justify-between transition-all cursor-pointer",
                          selectedStatus === status 
                            ? getStatusColor(status) + " ring-2 ring-offset-1"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        {status}
                        {selectedStatus === status && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <button
                    onClick={() => setShowNotesList(!showNotesList)}
                    className="w-full flex items-center justify-between py-2 text-gray-700 hover:text-gray-900 font-semibold transition-colors focus:outline-none cursor-pointer"
                  >
                    <span>Voter Notes ({currentVoter.notes?.length || 0})</span>
                    {showNotesList ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  
                  {showNotesList && (
                    <div className="mt-2 mb-4 space-y-3 max-h-48 overflow-y-auto">
                      {(!currentVoter.notes || currentVoter.notes.length === 0) && (
                        <p className="text-sm text-gray-500 italic py-2">No notes added yet.</p>
                      )}
                      {currentVoter.notes?.map((n, i) => (
                        <div key={i} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-sm text-gray-800 mb-2">{n.text}</p>
                          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                            <span>{n.agentName}</span>
                            <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Write a New Note</h4>
                    <textarea 
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#004d25] focus:border-transparent outline-none"
                      rows={3}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add key insights, canvassing records, or special details here..."
                    ></textarea>
                    {showNoteSuccess && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1 font-medium animate-pulse">
                        <Check size={14} /> Changes saved successfully!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button 
                onClick={handleSaveChanges} 
                disabled={isSaving || (selectedStatus === currentVoter.status && !noteText.trim())}
                className="flex-1 bg-[#004d25] text-white font-semibold py-3 rounded-lg hover:bg-[#006331] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
              <button 
                onClick={() => {
                  setSelectedVoter(null);
                  setNoteText('');
                  setShowNoteSuccess(false);
                }}
                disabled={isSaving}
                className="flex-1 bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
