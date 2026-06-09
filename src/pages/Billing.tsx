import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useApp } from '../context/AppContext';
import {  CheckCircle, Info,  ExternalLink } from 'lucide-react';
// import { cn } from '../lib/utils';
import LiveImageScanner from '../components/LiveImageScanner';

interface SimulationDetails {
  modelId: string;
  modelName: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  rpmLimitFree: number;
  rpdLimitFree: number;
  rpmLimitTier1: number;
  rpmLimitTier2: number;
  rpmLimitTier3: number;
}

const MODELS: SimulationDetails[] = [
  {
    modelId: 'gemini-3.1-flash',
    modelName: 'Gemini 3.1 Flash (Recommended - Fastest & Cost-Efficient)',
    inputCostPerMillion: 0.50,
    outputCostPerMillion: 1.50,
    rpmLimitFree: 15,
    rpdLimitFree: 1500,
    rpmLimitTier1: 2000,
    rpmLimitTier2: 10000,
    rpmLimitTier3: 20000,
  }
];

const EXCHANGE_RATE = 1405; // USD to Naira exchange rate

export default function Billing() {
  const { user } = useApp();
  const [selectedModel, setSelectedModel] = useState<SimulationDetails>(MODELS[0]);
  const [agentCount, setAgentCount] = useState<number>(8331);
  const [inputTokensPerAgent, setInputTokensPerAgent] = useState<number>(0);
  const [outputTokensPerAgent, setOutputTokensPerAgent] = useState<number>(0);
  const [hasScanned, setHasScanned] = useState<boolean>(false);
  
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simProgress, setSimProgress] = useState<number>(0);
  const [simulatedUploadsCount, setSimulatedUploadsCount] = useState<number>(0);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  
  // Calculate Totals
  const totalInputTokens = agentCount * inputTokensPerAgent;
  const totalOutputTokens = agentCount * outputTokensPerAgent;
  const totalTokens = totalInputTokens + totalOutputTokens;

  // Costs
  const inputCost = (totalInputTokens / 1000000) * selectedModel.inputCostPerMillion;
  const outputCost = (totalOutputTokens / 1000000) * selectedModel.outputCostPerMillion;
  const totalCostUSD = inputCost + outputCost;
  const totalCostNGN = totalCostUSD * EXCHANGE_RATE;

  // Rate Limits and Times
  const timeToCompleteFree = agentCount / selectedModel.rpmLimitFree; // in minutes
  const timeToCompleteTier1 = agentCount / selectedModel.rpmLimitTier1; // in minutes
  const timeToCompleteTier2 = agentCount / selectedModel.rpmLimitTier2; // in minutes

  // Active Tier Assessment
  let requiredTier = 'Tier 2 or Tier 3 (Optimal)';
  let tierReason = '';
  
  if (agentCount >= 5000) {
    requiredTier = 'Tier 2 or Tier 3';
    tierReason = `With ${agentCount.toLocaleString()} active agents uploading results concurrently, Tier 2 (10,000 RPM) or Tier 3 (20,000 RPM) is highly recommended. This ensures all election day results are processed in under 50 seconds, completely avoiding concurrency bottlenecks or queuing.`;
  } else if (agentCount > selectedModel.rpdLimitFree) {
    requiredTier = 'Tier 1 or Tier 2';
    tierReason = `Daily requests (${agentCount.toLocaleString()}) exceed Free Tier limits. Tier 1 (2,000 RPM) is sufficient, but Tier 2 is recommended to handle peak concurrent traffic on election day.`;
  } else {
    requiredTier = 'Tier 1 / Tier 2';
    tierReason = `Volume technically fits within lower constraints, but upgrading to Tier 2 or Tier 3 is recommended to completely eliminate concurrency blocks.`;
  }

  // Handle active simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSimulating) {
      interval = setInterval(() => {
        setSimProgress((prev) => {
          if (prev >= 100) {
            setIsSimulating(false);
            setSimulatedUploadsCount(agentCount);
            setSimulationLogs(logs => [
              `[SUCCESS] All ${agentCount.toLocaleString()} agent result captures analyzed.`,
              `[STATS] Total Input Tokens: ${totalInputTokens.toLocaleString()}`,
              `[STATS] Total Output Tokens: ${totalOutputTokens.toLocaleString()}`,
              `[BILLING] Est. Cost: $${totalCostUSD.toFixed(4)} (~₦${Math.round(totalCostNGN).toLocaleString()})`,
              ...logs
            ]);
            return 100;
          }
          const next = prev + 8;
          const currentCount = Math.min(agentCount, Math.round((next / 100) * agentCount));
          setSimulatedUploadsCount(currentCount);

          // Add dummy logging items
          if (next % 24 === 0) {
            const tempLga = ['Alimosho', 'Ikorodu', 'Kosofe', 'Mushin', 'Ojo', 'Surulere'][Math.floor(Math.random() * 6)];
            setSimulationLogs(logs => [
              `[API] Bulk batch ingestion: Processing ${Math.round(agentCount / 10).toLocaleString()} images from ${tempLga}...`,
              `[TOKEN] Cumulative Usage: ~${Math.round((currentCount * inputTokensPerAgent)).toLocaleString()} input tokens`,
              ...logs
            ]);
          }
          return next;
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isSimulating, agentCount, inputTokensPerAgent, totalInputTokens, totalOutputTokens, totalCostUSD, totalCostNGN]);

  const startSimulation = () => {
    setSimProgress(0);
    setSimulatedUploadsCount(0);
    setIsSimulating(true);
    setSimulationLogs([
      `[START] Initializing capacity simulation for ${agentCount.toLocaleString()} active agents...`,
      `[INFO] Target model: ${selectedModel.modelName}`,
      `[INFO] Estimating rate limit throughput at ${selectedModel.rpmLimitTier1.toLocaleString()} requests per minute...`
    ]);
  };

  const fmtCost = (usd: number) => `$${usd.toFixed(3)}`;
  const fmtNaira = (naira: number) => `₦${Math.round(naira).toLocaleString('en-NG')}`;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <Helmet>
        <title>Gemini API Token Capacity & Billing Planner | EagleEye</title>
        <meta name="description" content="Simulate real-time voter result image ingestion token consumption, billing tier thresholds, and seamless Google AI Studio upgrade paths." />
      </Helmet>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-[#004d25] to-[#00361a] p-6 rounded-3xl text-white shadow-lg">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Gemini API Cost</h1>
          <p className="text-green-100 text-sm mt-1">Determine required Google AI Studio billing tiers, token consumption, and upgrading paths for large-scale election captures.</p>
        </div>
        <div className="flex gap-2">
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 px-4 py-2.5 rounded-xl border border-white/20 transition-all text-white cursor-pointer"
          >
            Official API Billing Docs <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Live Ingestion & Scan Demonstration */}
        <section className="lg:col-span-7 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
          <LiveImageScanner 
            onScanComplete={(input, output) => {
              setInputTokensPerAgent(input);
              setOutputTokensPerAgent(output);
              setHasScanned(true);
            }} 
            onScanReset={() => {
              setInputTokensPerAgent(0);
              setOutputTokensPerAgent(0);
              setHasScanned(false);
            }}
          />
        </section>

        {/* Right Column: Key Simulation Statistics */}
        <section className="lg:col-span-5 space-y-6">
          
          {/* Card 1: Token & Cost Summary */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
            <div className="border-b border-gray-100 pb-4">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-bold text-gray-900">State-Wide Projection</h2>
                <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded border border-amber-200/50 uppercase font-mono">1 USD = ₦{EXCHANGE_RATE}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Estimated capacity and billing metrics for all <strong className="text-gray-800">8,331 active agents</strong> across the state. This projection assumes each agent successfully uploads <strong className="text-gray-800">1 result image</strong>.
              </p>
            </div>

            {!hasScanned ? (
              <div className="bg-gray-50 rounded-2xl p-6 text-center border border-dashed border-gray-200 flex flex-col items-center justify-center">
                <p className="text-sm font-semibold text-gray-400">Awaiting Live Scan Data</p>
                <p className="text-[10px] text-gray-400 mt-1 max-w-[200px] mx-auto leading-relaxed">Upload a results sheet on the left to generate real-time state-wide projections.</p>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in duration-500">
                {/* 
                <div className="flex justify-between items-baseline border-b border-gray-50 pb-2">
                  <span className="text-xs text-gray-400 font-semibold uppercase">Total Prompts + Images</span>
                  <span className="font-mono font-bold text-gray-900 text-sm">{totalInputTokens.toLocaleString()} tokens</span>
                </div>
                
                <div className="flex justify-between items-baseline border-b border-gray-50 pb-2">
                  <span className="text-xs text-gray-400 font-semibold uppercase">Total Extracted Outputs</span>
                  <span className="font-mono font-bold text-gray-900 text-sm">{totalOutputTokens.toLocaleString()} tokens</span>
                </div>
                */}

                <div className="flex justify-between items-baseline border-b border-gray-50 pb-2">
                  <span className="text-xs text-gray-400 font-semibold uppercase">Total Cumulative Tokens</span>
                  <span className="font-mono font-bold text-emerald-700 text-base">{totalTokens.toLocaleString()} tokens</span>
                </div>
{/* 
                Total Cost Display (Naira and USD) 
                <div className="bg-gradient-to-br from-[#004d25]/5 to-transparent rounded-2xl p-4 border border-[#004d25]/10 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Estimated Ingestion Cost</p>
                  <p className="text-4xl font-extrabold text-gray-900 font-mono tracking-tight leading-none mb-1">{fmtNaira(totalCostNGN)}</p>
                  <p className="text-sm font-semibold text-gray-500 font-mono">({fmtCost(totalCostUSD)} USD)</p>
                  
                  <div className="mt-3 flex items-center gap-1.5 bg-[#004d25] text-white text-[10px] px-3 py-1 rounded-full font-bold uppercase">
                    <span size={12} className="text-[#d4af37]" fill="currentColor" ></span> Gemini API Cost-Leader
                  </div>
                </div> */}
               
              </div>
            )}
          </div>

          {/* Card 2: Tier Requirement Check */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CheckCircle size={18} className="text-[#004d25]" />
              Active Tier Allocation
            </h2>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
              <Info size={20} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-blue-900 uppercase">Assessment: {requiredTier}</p>
                <p className="text-xs text-blue-800/90 mt-1 leading-relaxed">{tierReason}</p>
              </div>
            </div>
            
            {/* Speed & Rate stats */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400 font-medium">Free Tier Speed (15 RPM)</span>
                <span className="font-semibold text-red-600 font-mono">
                  {timeToCompleteFree > 60 
                    ? `${(timeToCompleteFree / 60).toFixed(1)} hrs` 
                    : `${Math.ceil(timeToCompleteFree)} mins`} (Rate Limited)
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400 font-medium">Tier 1 Speed (2,000 RPM)</span>
                <span className="font-semibold text-emerald-600 font-mono">~{Math.ceil(timeToCompleteTier1 * 60)} seconds (Seamless)</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400 font-medium">Tier 2 Speed (10,000 RPM)</span>
                <span className="font-semibold text-emerald-600 font-mono">~{Math.ceil(timeToCompleteTier2 * 60)} seconds (Instant)</span>
              </div>
            </div>
          </div>

        </section>
      </div>
    </div>
  );
}
