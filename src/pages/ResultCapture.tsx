import React, { useState, useEffect } from 'react';
import { Camera, Upload, CheckCircle, AlertTriangle, ChevronRight, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

type Step = 'select_pu' | 'select_election' | 'camera' | 'scanning' | 'verify' | 'success';

export default function ResultCapture() {
  const { user, locations, submitResult, activeElectionGroup, analyzeResultImage } = useApp();
  const navigate = useNavigate();
  
  // Skip PU selection if user is a pu_agent
  const initialStep: Step = user?.role === 'pu_agent' ? 'select_election' : 'select_pu';
  const [step, setStep] = useState<Step>(initialStep);
  
  const initialPu = user?.role === 'pu_agent' 
    ? locations.find(l => l.id === user.locationId)?.name || ''
    : '';
  const [selectedPu, setSelectedPu] = useState(initialPu);
  const [searchPu, setSearchPu] = useState('');
  const [selectedElection, setSelectedElection] = useState('');

  const nationalElections = [
    { id: 'presidential', name: 'Presidential Election' },
    { id: 'governorship', name: 'Governorship' },
    { id: 'senate', name: 'Senate Election' },
    { id: 'house', name: 'Federal House of Representatives' }
  ];

  const stateElections = [
    { id: 'governorship', name: 'Governorship' },
    { id: 'state_house', name: 'State House of Assembly' }
  ];

  const electionTypes = activeElectionGroup === 'national' ? nationalElections : stateElections;

  // Mock extracted data directly mapping the new JSON prompt
  const [results, setResults] = useState({
    state: "",
    local_government_area: "",
    local_government: 0,
    registration_area: "",
    polling_unit: "",
    number_of_voters_on_register: 0, // 1
    number_of_accredited_voters: 0,   // 2
    number_of_ballot_papers_issued: 0, // 3
    number_of_unused_ballot_papers: 0, // 4
    number_of_spoiled_ballot_papers: 0,// 5
    number_of_rejected_ballots: 0,     // 6
    number_of_valid_votes: 0,          // 7
    total_number_of_used_ballots: 0,   // 8
    total_votes_cast: 0,               // Same as 8
    political_party_results: [] as { party: string, votes_in_figures: number }[],
    presiding_officer_name: "",
    tags: [] as string[],
    status: 'verified',
    aiNotes: ''
  });

  const partyList = ['adc', 'apc', 'pdp', 'lp', 'nnpp', 'sdp', 'apga', 'zlp', 'ypp', 'prp'] as const;

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [aiProvider, setAiProvider] = useState<string | null>(null);

  const puList = ['PU 001 - Town Hall', 'PU 002 - Primary School', 'PU 003 - Market Square', 'PU 004 - Health Center'];

  const processImage = async (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setStep('scanning');
    
    if (isMockMode) {
      setTimeout(() => {
        setStep('verify');
      }, 2500);
      return;
    }

    try {
      const data = await analyzeResultImage(file);
      if (data && data.results) {
        setResults(prev => ({
          ...prev,
          state: data.results.state || '',
          local_government_area: data.results.local_government_area || '',
          local_government: data.results.local_government || 0,
          number_of_voters_on_register: data.results.number_of_voters_on_register || 0,
          number_of_accredited_voters: data.results.number_of_accredited_voters || 0,
          number_of_ballot_papers_issued: data.results.number_of_ballot_papers_issued || 0,
          number_of_unused_ballot_papers: data.results.number_of_unused_ballot_papers || 0,
          number_of_spoiled_ballot_papers: data.results.number_of_spoiled_ballot_papers || 0,
          number_of_rejected_ballots: data.results.number_of_rejected_ballots || 0,
          number_of_valid_votes: data.results.number_of_valid_votes || 0,
          total_number_of_used_ballots: data.results.total_number_of_used_ballots || 0,
          total_votes_cast: data.results.total_votes_cast || data.results.total_number_of_used_ballots || 0,
          political_party_results: data.results.political_party_results || [],
          tags: [],
          status: 'verified',
          aiNotes: data.results.aiNotes || ''
        }));
        setAiProvider(data.ai_used || null);
        toast.success("Image analyzed successfully!");
      } else {
        toast.error("Failed to extract data properly.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error connecting to Vision AI. Please check API keys.");
    } finally {
      setStep('verify');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processImage(e.target.files[0]);
    }
  };

  const getPartyVotes = (party: string) => {
    const found = results.political_party_results?.find(p => p.party?.toLowerCase() === party.toLowerCase());
    return found ? found.votes_in_figures : 0;
  };

  const handleResultChange = (party: string, value: string) => {
    const num = parseInt(value) || 0;
    setResults(prev => {
      let newParties = [...(prev.political_party_results || [])];
      const index = newParties.findIndex(p => p.party?.toLowerCase() === party.toLowerCase());
      if (index >= 0) {
        newParties[index] = { ...newParties[index], votes_in_figures: num };
      } else {
        newParties.push({ party: party.toUpperCase(), votes_in_figures: num });
      }
      return { ...prev, political_party_results: newParties };
    });
  };

  const handleFieldChange = (field: keyof typeof results, value: string) => {
    const num = parseInt(value) || 0;
    setResults(prev => ({ ...prev, [field]: num }));
  };

  const isMathValid = () => {
    const sumParties = partyList.reduce((sum, party) => sum + getPartyVotes(party), 0);
    const item8 = results.total_number_of_used_ballots || results.total_votes_cast;
    const sumForm = results.number_of_spoiled_ballot_papers + results.number_of_rejected_ballots + results.number_of_valid_votes;
    
    return sumParties === results.number_of_valid_votes && sumForm === item8;
  };

  const isOverVoting = () => results.total_votes_cast > results.number_of_accredited_voters;

  const handleSubmit = async () => {
    let finalTags = [...results.tags];
    let finalStatus = 'verified';

    if (!isMathValid()) {
      finalTags.push('math_error');
      finalStatus = 'pending_review';
    }

    if (isOverVoting()) {
      finalTags.push('over_voting');
      finalStatus = 'disputed';
    }

    try {
      await submitResult(selectedPu, selectedElection, {
         ...results,
         tags: finalTags,
         status: finalStatus
      }, imageFile);
      setStep('success');
    } catch (error) {
      toast.error("Failed to submit result.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto h-full flex flex-col">
      {/* Progress Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Result Capture</h1>
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm font-medium text-gray-500 overflow-x-auto whitespace-nowrap pb-2">
          {user?.role !== 'pu_agent' && (
            <>
              <button 
                onClick={() => setStep('select_pu')}
                className={cn("hover:text-gray-900", step === 'select_pu' ? 'text-[#004d25] font-semibold' : '')}
              >
                1. Select PU
              </button>
              <ChevronRight size={16} />
            </>
          )}
          <button 
            onClick={() => selectedPu && setStep('select_election')}
            disabled={!selectedPu}
            className={cn("disabled:opacity-50 hover:text-gray-900 disabled:cursor-not-allowed", step === 'select_election' ? 'text-[#004d25] font-semibold' : '')}
          >
            {user?.role !== 'pu_agent' ? '2.' : '1.'} Select Election
          </button>
          <ChevronRight size={16} />
          <button 
            onClick={() => selectedElection && setStep('camera')}
            disabled={!selectedElection}
            className={cn("disabled:opacity-50 hover:text-gray-900 disabled:cursor-not-allowed", step === 'camera' || step === 'scanning' ? 'text-[#004d25] font-semibold' : '')}
          >
            {user?.role !== 'pu_agent' ? '3.' : '2.'} Scan
          </button>
          <ChevronRight size={16} />
          <button 
            onClick={() => selectedElection && setStep('verify')}
            disabled={!selectedElection || step === 'select_election' || step === 'select_pu'}
            className={cn("disabled:opacity-50 hover:text-gray-900 disabled:cursor-not-allowed", step === 'verify' ? 'text-[#004d25] font-semibold' : '')}
          >
            {user?.role !== 'pu_agent' ? '4.' : '3.'} Verify
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative">
        {step === 'select_pu' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex-1">
            <h2 className="text-lg font-semibold mb-4">Select Polling Unit</h2>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="text" 
                placeholder="Search PU..." 
                value={searchPu}
                onChange={(e) => setSearchPu(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#004d25] focus:border-transparent"
              />
            </div>
            <div className="space-y-2">
              {puList.filter(pu => pu.toLowerCase().includes(searchPu.toLowerCase())).map(pu => (
                <button
                  key={pu}
                  onClick={() => setSelectedPu(pu)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                    selectedPu === pu 
                      ? "bg-green-50 border-[#004d25] text-[#004d25] font-semibold" 
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {pu}
                </button>
              ))}
            </div>
            <button 
              disabled={!selectedPu}
              onClick={() => setStep('select_election')}
              className="w-full mt-8 bg-[#004d25] text-white font-semibold py-3 rounded-lg hover:bg-[#006331] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'select_election' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex-1">
            <h2 className="text-lg font-semibold mb-4">Select Election Type</h2>
            <p className="text-sm text-gray-500 mb-4">For: {selectedPu}</p>
            <div className="space-y-2">
              {electionTypes.map(election => (
                <button
                  key={election.id}
                  onClick={() => setSelectedElection(election.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                    selectedElection === election.id 
                      ? "bg-green-50 border-[#004d25] text-[#004d25] font-semibold" 
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {election.name}
                </button>
              ))}
            </div>
            <div className="flex gap-4 mt-8">
              {user?.role !== 'pu_agent' && (
                <button 
                  onClick={() => setStep('select_pu')}
                  className="flex-1 border border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
              )}
              <button 
                disabled={!selectedElection}
                onClick={() => setStep('camera')}
                className="flex-1 bg-[#004d25] text-white font-semibold py-3 rounded-lg hover:bg-[#006331] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'camera' && (
          <div className="bg-black rounded-xl overflow-hidden flex-1 flex flex-col relative">
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
              <button onClick={() => setStep('select_election')} className="bg-black/50 text-white p-2 rounded-full backdrop-blur-sm">
                <X size={24} />
              </button>
              <div className="bg-black/50 text-white px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm">
                {selectedPu} - {electionTypes.find(e => e.id === selectedElection)?.name}
              </div>
            </div>
            
            {/* Viewfinder Frame */}
            <div className="flex-1 relative flex items-center justify-center p-8">
              <div className="absolute inset-8 border-2 border-dashed border-white/50 rounded-lg"></div>
              <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-[#d4af37]"></div>
              <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-[#d4af37]"></div>
              <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-[#d4af37]"></div>
              <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-[#d4af37]"></div>
              <p className="text-white/70 text-center px-12">Align the EC8A form within the frame. Ensure good lighting.</p>
            </div>

            <div className="bg-black p-6 flex justify-center gap-8 pb-12">
              <label className="w-20 h-20 bg-white rounded-full flex items-center justify-center border-4 border-gray-300 hover:bg-gray-100 transition-colors active:scale-95 cursor-pointer flex-col gap-1">
                <Camera className="text-gray-800" size={28} />
                <span className="text-[10px] font-bold text-gray-800">SNAP</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={handleFileChange} 
                />
              </label>

              <label className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center border-4 border-gray-600 hover:bg-gray-700 transition-colors active:scale-95 cursor-pointer flex-col gap-1">
                <Upload className="text-white" size={28} />
                <span className="text-[10px] font-bold text-white">FILE</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
              </label>
            </div>
          </div>
        )}

        {step === 'scanning' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="relative w-32 h-32 mb-8">
              <div className="absolute inset-0 border-4 border-gray-100 rounded-xl"></div>
              <div className="absolute inset-0 border-4 border-[#004d25] rounded-xl border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Upload className="text-[#004d25] animate-pulse" size={40} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing Document...</h2>
            <p className="text-gray-500">EagleEye AI is extracting results from the EC8A form.</p>
          </div>
        )}

        {step === 'verify' && (
          <div className="flex-1 flex flex-col md:flex-row gap-6 h-full">
            {/* Top/Left: Image Preview */}
            <div className="md:w-1/2 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden flex flex-col">
              <div className="p-3 bg-gray-800 text-white text-sm font-medium flex justify-between items-center">
                <span>Captured Image</span>
                <button onClick={() => setStep('camera')} className="text-gray-300 hover:text-white text-xs underline">Retake</button>
              </div>
              <div className="flex-1 relative bg-gray-200 min-h-[200px]">
                {imagePreview ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img src={imagePreview} className="max-w-full max-h-full object-contain" alt="Captured form" />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="bg-white w-full h-full shadow-sm p-4 text-[10px] text-gray-400 font-mono flex flex-col">
                      <div className="border-b-2 border-black pb-2 mb-2 text-center font-bold text-black text-xs">INDEPENDENT NATIONAL ELECTORAL COMMISSION</div>
                    <div className="flex-1 border border-gray-300 p-2 overflow-y-auto max-h-[160px]">
                       {partyList.map(party => (
                         <div key={party} className="flex justify-between border-b border-gray-200 py-1">
                           <span className="text-black uppercase">{party}</span>
                           <span className="font-bold text-black">{getPartyVotes(party)}</span>
                         </div>
                       ))}
                    </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom/Right: Editable Form */}
            <div className="md:w-1/2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-100 bg-[#004d25] text-white rounded-t-xl flex justify-between items-center">
                <div>
                  <h3 className="font-bold">Verify Extracted Data</h3>
                  <p className="text-xs text-green-100">Please confirm the numbers match the image.</p>
                </div>
                {aiProvider && (
                  <div className="bg-white/20 px-2 py-1 rounded text-[10px] font-mono border border-white/30">
                    AI: {aiProvider}
                  </div>
                )}
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                {results.aiNotes && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-lg flex items-start gap-2 text-sm">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <p><strong>AI Notes:</strong> {results.aiNotes}</p>
                  </div>
                )}
                {!isMathValid() && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-start gap-2 text-sm">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <p><strong>Math Error:</strong> The sum of party votes does not match Total Valid, or Total Valid + Rejected does not equal Total Cast. Review will be required.</p>
                  </div>
                )}
                {isOverVoting() && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-start gap-2 text-sm">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <p><strong>Over-voting Alert:</strong> Total votes cast exceeds accredited voters. This result will be disputed.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 border-b border-gray-100 pb-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">1. Registered Voters</label>
                    <input type="number" value={results.number_of_voters_on_register} onChange={(e) => handleFieldChange('number_of_voters_on_register', e.target.value)} className="w-full border border-gray-300 rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">2. Accredited Voters</label>
                    <input type="number" value={results.number_of_accredited_voters} onChange={(e) => handleFieldChange('number_of_accredited_voters', e.target.value)} className="w-full border border-gray-300 rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">3. Ballot Papers Issued</label>
                    <input type="number" value={results.number_of_ballot_papers_issued} onChange={(e) => handleFieldChange('number_of_ballot_papers_issued', e.target.value)} className="w-full border border-gray-300 rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">4. Unused Ballots</label>
                    <input type="number" value={results.number_of_unused_ballot_papers} onChange={(e) => handleFieldChange('number_of_unused_ballot_papers', e.target.value)} className="w-full border border-gray-300 rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {partyList.map(party => (
                    <div key={party} className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">{party}</label>
                      <input type="number" value={getPartyVotes(party)} onChange={(e) => handleResultChange(party, e.target.value)} className="w-full border border-gray-300 rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]" />
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 pt-4 grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">5. Spoiled Ballots</label>
                    <input type="number" value={results.number_of_spoiled_ballot_papers} onChange={(e) => handleFieldChange('number_of_spoiled_ballot_papers', e.target.value)} className="w-full border border-gray-300 rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">6. Rejected Ballots</label>
                    <input type="number" value={results.number_of_rejected_ballots} onChange={(e) => handleFieldChange('number_of_rejected_ballots', e.target.value)} className={cn("w-full border rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]", !isMathValid() ? "border-red-500 bg-red-50 text-red-700" : "border-gray-300")} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">7. Total Valid Votes</label>
                    <input type="number" value={results.number_of_valid_votes} onChange={(e) => handleFieldChange('number_of_valid_votes', e.target.value)} className={cn("w-full border rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]", !isMathValid() ? "border-red-500 bg-red-50 text-red-700" : "border-gray-300")} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">8. Total Used Ballots</label>
                    <input type="number" value={results.total_number_of_used_ballots || results.total_votes_cast} onChange={(e) => handleFieldChange('total_number_of_used_ballots', e.target.value)} className={cn("w-full border rounded-md p-2 font-bold text-lg focus:ring-[#004d25] focus:border-[#004d25]", (!isMathValid() || isOverVoting()) ? "border-red-500 bg-red-50 text-red-700" : "border-gray-300")} />
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button 
                  onClick={handleSubmit}
                  className="w-full bg-[#004d25] text-white font-semibold py-3 rounded-lg hover:bg-[#006331] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  <Upload size={20} /> Submit Verified Result
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col items-center justify-center p-8 text-center transform transition-all duration-300 scale-100 opacity-100">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="text-green-600 w-16 h-16" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Upload Successful!</h2>
            <p className="text-gray-500 mb-8 max-w-md">
              The result for <strong>{selectedPu}</strong> has been securely transmitted to the National Database.
            </p>
            <button 
              onClick={() => navigate('/dashboard')}
              className="bg-[#004d25] text-white font-semibold py-3 px-8 rounded-lg hover:bg-[#006331] transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
