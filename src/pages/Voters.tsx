import React, { useState } from 'react';
import { useApp, Voter } from '../context/AppContext';
import { Search, Filter, X, Check, UserCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Voters() {
  const { voters, updateVoterStatus, addVoterNote, locations, votersPage, isLoadingVoters, fetchVotersPage } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [showNoteSuccess, setShowNoteSuccess] = useState(false);

  const filteredVoters = voters.filter(v => 
    (v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (v.phone || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentVoter = selectedVoter ? voters.find(v => String(v.id) === String(selectedVoter.id)) || selectedVoter : null;

  const handleAddNote = async () => {
    if (!noteText.trim() || !currentVoter) return;
    setIsSubmittingNote(true);
    await addVoterNote(currentVoter.id, noteText);
    setNoteText('');
    setIsSubmittingNote(false);
    setShowNoteSuccess(true);
    setTimeout(() => setShowNoteSuccess(false), 3000);
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
                  onClick={() => setSelectedVoter(voter)}
                  className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                      <UserCircle size={24} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {voter.name}
                        <span className="text-sm font-normal text-gray-500 ml-1">{getStateName(voter.stateId)}</span>
                      </h4>
                      <p className="text-xs text-gray-500">{formatPhone(voter.phone)}</p>
                    </div>
                  </div>
                  <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium border", getStatusColor(voter.status))}>
                    {voter.status}
                  </span>
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
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mx-auto mb-3">
                  <UserCircle size={48} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {currentVoter.name}
                  <span className="text-sm font-normal text-gray-500 ml-2">{getStateName(currentVoter.stateId)}</span>
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
                        onClick={() => updateVoterStatus(currentVoter.id, status)}
                        className={cn(
                          "p-3 rounded-lg border text-sm font-medium flex items-center justify-between transition-all",
                          currentVoter.status === status 
                            ? getStatusColor(status) + " ring-2 ring-offset-1"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        {status}
                        {currentVoter.status === status && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2 mt-4">Notes</h4>
                  <div className="mb-4 space-y-3 max-h-48 overflow-y-auto">
                    {(!currentVoter.notes || currentVoter.notes.length === 0) && (
                      <p className="text-sm text-gray-500 italic">No notes added yet.</p>
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

                  <textarea 
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#004d25] focus:border-transparent"
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Type a new note..."
                  ></textarea>
                  <button 
                    onClick={handleAddNote}
                    disabled={isSubmittingNote || !noteText.trim()}
                    className={cn(
                      "mt-2 w-full text-white font-medium py-2 rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2",
                      showNoteSuccess ? "bg-green-600 hover:bg-green-700" : "bg-gray-900 hover:bg-gray-800"
                    )}
                  >
                    {isSubmittingNote ? 'Adding Note...' : showNoteSuccess ? <><Check size={18}/> Note Added Successfully!</> : 'Post Note'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button 
                onClick={() => {
                  setSelectedVoter(null);
                  setNoteText('');
                  setShowNoteSuccess(false);
                }}
                className="w-full bg-[#004d25] text-white font-semibold py-3 rounded-lg hover:bg-[#006331] transition-colors"
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
