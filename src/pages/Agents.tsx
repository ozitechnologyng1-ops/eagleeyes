import { AGENT_PUBLIC_COLUMNS, writeAgent } from "../lib/agentAuth";
import React, { useState, useCallback } from "react";
import { useApp, Role, Location, Agent, roleHierarchy } from "../context/AppContext";
import {
  Plus,
  Search,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Loader2,
  SendHorizonal,
  KeyRound,
  RefreshCw,
  X,
  Send,
  Trash2,
} from "lucide-react";
import { cn, getFriendlyErrorMessage } from "../lib/utils";
import AgentModal from "../components/AgentModal";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import {
  buildLoginSms,
  generateAgentPassword,
  retryCredentialSms,
  sendDirectEgabSms,
  sendRegistrationSms,
  type SmsResult,
} from "../lib/smsService";

const JurisdictionCell = ({ id, locations }: { id: string; locations: Location[] }) => {
  const existing = locations.find((l) => l.id === id);
  const [name, setName] = useState(existing?.name || "");

  React.useEffect(() => {
    if (existing) {
      setName(existing.name);
      return;
    }
    if (!id || id === "nat1") {
      setName(id === "nat1" ? "Nigeria" : "Unknown");
      return;
    }

    let isMounted = true;
    const fetchName = async () => {
      let table = "";
      let rawId = id;
      if (id.startsWith("pu_")) {
        table = "polling_units";
        rawId = id.replace("pu_", "");
      } else if (id.startsWith("ward_")) {
        table = "wards";
        rawId = id.replace("ward_", "");
      } else if (id.startsWith("lga_")) {
        table = "local_governments";
        rawId = id.replace("lga_", "");
      } else if (id.startsWith("state_")) {
        table = "states";
        rawId = id.replace("state_", "");
      }

      if (table) {
        const { data, error } = await supabase
          .from(table)
          .select("name")
          .eq("id", parseInt(rawId))
          .single();
        if (error) throw error;
        if (isMounted && data?.name) setName(data.name);
        else if (isMounted) setName("Unknown");
      }
    };
    Promise.resolve(fetchName()).catch((error: unknown) =>
      console.error("Async operation failed in Agents", error),
    );

    return () => {
      isMounted = false;
    };
  }, [id, existing]);

  if (!name) return <span className="text-gray-400 text-xs italic">Loading...</span>;
  return <span>{name}</span>;
};

const DeploymentCard = ({
  title,
  stats,
  colorClass,
  subtitle,
}: {
  title: string;
  stats: { covered: number; total: number };
  colorClass: string;
  subtitle: string;
}) => {
  const percent = stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0;
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">{percent}%</p>
        </div>
        <div className={cn("px-2 py-1 rounded text-[10px] font-bold text-white", colorClass)}>
          {stats.covered} / {stats.total}
        </div>
      </div>

      <div className="space-y-2">
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={cn("h-full transition-all duration-1000", colorClass)}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 italic">
          {subtitle} — {stats.total - stats.covered} remaining
        </p>
      </div>
    </div>
  );
};

const NIGERIAN_STATES: Record<number, string> = {
  1: "Abia",
  2: "Adamawa",
  3: "Akwa Ibom",
  4: "Anambra",
  5: "Bauchi",
  6: "Bayelsa",
  7: "Benue",
  8: "Borno",
  9: "Cross River",
  10: "Delta",
  11: "Ebonyi",
  12: "Edo",
  13: "Ekiti",
  14: "Enugu",
  15: "Gombe",
  16: "Imo",
  17: "Jigawa",
  18: "Kaduna",
  19: "Kano",
  20: "Katsina",
  21: "Kebbi",
  22: "Kogi",
  23: "Kwara",
  24: "Lagos",
  25: "Nasarawa",
  26: "Niger",
  27: "Ogun",
  28: "Ondo",
  29: "Osun",
  30: "Oyo",
  31: "Plateau",
  32: "Rivers",
  33: "Sokoto",
  34: "Taraba",
  35: "Yobe",
  36: "Zamfara",
  37: "FCT",
};

export default function Agents() {
  const {
    user,
    locations,
    stats,
    addAgent,
    updateAgent,
    updateAgentStatus,
    deleteAgent,
    refreshDeploymentStats,
  } = useApp();
  const deployment = stats.deployment || {};
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [smsModalAgent, setSmsModalAgent] = useState<Agent | null>(null);
  const [smsMode, setSmsMode] = useState<"normal" | "password">("normal");
  const [normalSmsText, setNormalSmsText] = useState("");
  const [smsPassword, setSmsPassword] = useState("");
  const [syncPasswordToDb, setSyncPasswordToDb] = useState(true);
  const [sendingSms, setSendingSms] = useState(false);
  const [credentialSms, setCredentialSms] = useState<SmsResult | null>(null);
  const [selectedRoleTab, setSelectedRoleTab] = useState<string>("all");
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canDeleteAgent = (target: Agent) => {
    if (!user || user.id === target.id) return false;
    if (user.role === "national_admin") return true;
    if (user.role === "state_admin") {
      if (target.role === "national_admin" || target.role === "state_admin") return false;
      return user.stateId ? target.stateId === user.stateId : true;
    }
    return false;
  };

  const getStateNameForAgent = React.useCallback(
    (agent: Agent): string => {
      if (agent.stateId && NIGERIAN_STATES[agent.stateId]) {
        return NIGERIAN_STATES[agent.stateId];
      }
      if (agent.stateId) {
        const loc = locations.find(
          (l) =>
            l.id === `state_${agent.stateId}` ||
            (l.type === "state" && l.id === String(agent.stateId)),
        );
        if (loc?.name) return loc.name;
      }
      if (agent.locationId) {
        let curr = locations.find((l) => l.id === agent.locationId);
        while (curr) {
          if (curr.type === "state") return curr.name;
          if (!curr.parentId || curr.parentId === "nat1") break;
          curr = locations.find((l) => l.id === curr!.parentId);
        }
      }
      return "";
    },
    [locations],
  );

  const generateTempPassword = () => {
    // Generate a strong temporary password strictly between 6 and 24 characters (8 chars)
    return generateAgentPassword(8);
  };

  const handleOpenSmsModal = (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSmsModalAgent(agent);
    setCredentialSms(null);
    setSmsPassword(generateTempPassword());
    setSyncPasswordToDb(true);
    setSmsMode("normal");
    setNormalSmsText("");
  };

  const handleSendSms = async () => {
    if (!smsModalAgent) return;
    setSendingSms(true);
    try {
      if (smsMode === "normal") {
        if (!normalSmsText.trim()) {
          throw new Error("Please enter a message to send.");
        }
        const res = await sendDirectEgabSms(
          smsModalAgent.phone,
          normalSmsText.trim(),
          undefined,
          {
            type: "custom_agent_sms",
            recipient: smsModalAgent.phone,
            message: normalSmsText.trim(),
            timestamp: new Date().toISOString(),
          },
          {
            agent_id: smsModalAgent.id,
            sender: user?.name,
          },
        );
        if (res.reference || res.status === "pending" || res.status === "submitted") {
          toast.success(`SMS sent to ${smsModalAgent.phone}`);
        } else {
          toast(`SMS status: ${res.status}`);
        }
        setSmsModalAgent(null);
        setNormalSmsText("");
      } else {
        if (!syncPasswordToDb || !smsPassword)
          throw new Error("Set and save the password before sending login credentials.");
        const result = credentialSms
          ? { smsSubmission: await retryCredentialSms(smsModalAgent.phone, smsPassword) }
          : await writeAgent(smsModalAgent.id, { password: smsPassword }, true);

        let finalSubmission = result.smsSubmission;
        if (!finalSubmission?.reference) {
          // Direct EGAB SMS dispatch fallback
          const firstName = String(smsModalAgent.firstName || smsModalAgent.name || "Agent").split(
            " ",
          )[0];
          finalSubmission = await sendRegistrationSms({
            firstname: firstName,
            phone: smsModalAgent.phone,
            password: smsPassword,
            agentId: smsModalAgent.id,
            stateId: smsModalAgent.stateId,
          });
        }

        setCredentialSms(finalSubmission || null);
        if (!finalSubmission?.reference && finalSubmission?.status !== "pending")
          throw new Error(
            `Password updated. SMS ${finalSubmission?.status || "unavailable"}; check console for error details.`,
          );
        toast.success(`Login SMS submitted (${finalSubmission.status})`);
        setSmsModalAgent(null);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send SMS");
    } finally {
      setSendingSms(false);
    }
  };

  const fetchLocalAgents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase.from("agents").select(AGENT_PUBLIC_COLUMNS);

      // Jurisdiction Filtering
      if (user.role === "state_admin" && user.stateId) {
        query = query.eq("state_id", user.stateId);
      } else if (user.role === "lga_admin" && user.lgaId) {
        query = query.eq("local_governments_id", user.lgaId);
      } else if (user.role === "ward_admin" && user.wardId) {
        query = query.eq("wards_id", user.wardId);
      } else if (user.role === "pu_agent" && user.puId) {
        query = query.eq("polling_units_id", user.puId);
      }

      const { data, error } = await query.order("name").limit(200);
      if (error) throw error;

      setAgents(
        (data || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          role: a.role as Role,
          status: (a.status || "active").toLowerCase() as Agent["status"],
          locationId: a.polling_units_id
            ? `pu_${a.polling_units_id}`
            : a.wards_id
              ? `ward_${a.wards_id}`
              : a.local_governments_id
                ? `lga_${a.local_governments_id}`
                : a.state_id
                  ? `state_${a.state_id}`
                  : a.jurisdiction_id || "nat1",
          firstName: a.first_name || (a.name ? a.name.split(" ")[0] : ""),
          lastName: a.last_name || (a.name ? a.name.split(" ").slice(1).join(" ") : ""),
          phone: a.phone,
          picture: a.profile_picture_url || "",
          bankName: a.bank_name || "",
          accountName: a.account_name || "",
          accountNumber: a.account_number || "",
          stateId: a.state_id,
          lgaId: a.local_governments_id,
          wardId: a.wards_id,
          puId: a.polling_units_id || a.pollingunit_lagos_id,
          lagosPollingUnitId: a.polling_units_id || a.pollingunit_lagos_id,
        })),
      );
    } catch (err) {
      console.error("Failed to fetch agents", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    Promise.resolve(fetchLocalAgents()).catch((error: unknown) =>
      console.error("Async operation failed in Agents", error),
    );
    Promise.resolve(refreshDeploymentStats?.()).catch((error: unknown) =>
      console.error("Async operation failed in Agents", error),
    );
  }, [fetchLocalAgents, refreshDeploymentStats]);

  if (!user) return null;

  const availableTabs = React.useMemo(() => {
    if (!user) return [];
    if (user.role === "national_admin") {
      return [
        { id: "all", label: "All Agents" },
        { id: "state_admin", label: "State Admins" },
        { id: "lga_admin", label: "LGA Coordinators" },
        { id: "ward_admin", label: "Ward Admins" },
        { id: "pu_agent", label: "Polling Unit Agents" },
      ];
    }
    if (user.role === "state_admin") {
      return [
        { id: "all", label: "All Agents" },
        { id: "lga_admin", label: "LGA Coordinators" },
        { id: "ward_admin", label: "Ward Admins" },
        { id: "pu_agent", label: "Polling Unit Agents" },
      ];
    }
    if (user.role === "lga_admin") {
      return [
        { id: "all", label: "All Agents" },
        { id: "ward_admin", label: "Ward Admins" },
        { id: "pu_agent", label: "Polling Unit Agents" },
      ];
    }
    if (user.role === "ward_admin") {
      return [
        { id: "all", label: "All Agents" },
        { id: "pu_agent", label: "Polling Unit Agents" },
      ];
    }
    return [{ id: "all", label: "All Agents" }];
  }, [user]);

  const tabCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    availableTabs.forEach((t) => {
      counts[t.id] = 0;
    });

    agents.forEach((a) => {
      if (user && roleHierarchy[a.role] < roleHierarchy[user.role]) {
        counts.all = (counts.all || 0) + 1;
        if (counts[a.role] !== undefined) {
          counts[a.role] = (counts[a.role] || 0) + 1;
        }
      }
    });

    return counts;
  }, [agents, availableTabs, user]);

  // Apply hierarchical, tab, and search filters to the locally loaded agents
  const filteredAgents = agents.filter((a) => {
    // 1. Hierarchy Check
    if (roleHierarchy[a.role] >= roleHierarchy[user!.role]) return false;

    // 2. Role Tab Filter
    if (selectedRoleTab !== "all" && a.role !== selectedRoleTab) return false;

    // 3. Search Check
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      a.name.toLowerCase().includes(term) ||
      a.phone.includes(term) ||
      (a.firstName && a.firstName.toLowerCase().includes(term)) ||
      (a.lastName && a.lastName.toLowerCase().includes(term))
    );
  });

  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteAgent(agentToDelete.id);
      toast.success(`${agentToDelete.name} has been deleted.`);
      setAgentToDelete(null);
      if (editAgent?.id === agentToDelete.id) {
        setEditAgent(null);
      }
      Promise.resolve(fetchLocalAgents()).catch((error: unknown) =>
        console.error("Async operation failed in Agents", error),
      );
      Promise.resolve(refreshDeploymentStats?.()).catch((error: unknown) =>
        console.error("Async operation failed in Agents", error),
      );
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to delete agent");
    } finally {
      setIsDeleting(false);
    }
  };

  // Determine what roles the current user can create
  const getCreatableRoles = (): Role[] => {
    switch (user.role) {
      case "national_admin":
        return ["state_admin", "lga_admin", "ward_admin", "pu_agent"];
      case "state_admin":
        return ["lga_admin", "ward_admin", "pu_agent"];
      case "lga_admin":
        return ["ward_admin", "pu_agent"];
      case "ward_admin":
        return ["pu_agent"];
      default:
        return [];
    }
  };

  const creatableRoles = getCreatableRoles();

  const handleSaveAgent = async (agentData: Partial<Agent>) => {
    try {
      if (editAgent) {
        await updateAgent(editAgent.id, agentData);
        toast.success("Agent updated successfully");
      } else {
        await addAgent(agentData as Omit<Agent, "id">);
        toast.success("Agent registered successfully");
      }
      setShowAddModal(false);
      setEditAgent(null);
      Promise.resolve(fetchLocalAgents()).catch((error: unknown) =>
        console.error("Async operation failed in Agents", error),
      );
      Promise.resolve(refreshDeploymentStats?.()).catch((error: unknown) =>
        console.error("Async operation failed in Agents", error),
      );
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err));
      throw err;
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Management</h1>
          <p className="text-gray-500">Manage agents within your jurisdiction</p>
        </div>
        {creatableRoles.length > 0 && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#004d25] text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-[#006331] transition-colors"
          >
            <Plus size={20} />
            <span>Register Agent</span>
          </button>
        )}
      </div>

      {/* Deployment Coverage Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {deployment.state && (
          <DeploymentCard
            title="State Coverage"
            stats={deployment.state}
            colorClass="bg-indigo-500"
            subtitle="Regional Recruitment"
          />
        )}
        {deployment.lga && (
          <DeploymentCard
            title="LGA Coverage"
            stats={deployment.lga}
            colorClass="bg-blue-500"
            subtitle="Local Recruitment"
          />
        )}
        {deployment.ward && (
          <DeploymentCard
            title="Ward Coverage"
            stats={deployment.ward}
            colorClass="bg-purple-500"
            subtitle="Ward Recruitment"
          />
        )}
        {deployment.pu && (
          <DeploymentCard
            title="PU Coverage"
            stats={deployment.pu}
            colorClass="bg-orange-500"
            subtitle="Unit Recruitment"
          />
        )}
      </div>

      {/* Role Categorization Tabs */}
      <div className="flex border-b border-gray-200 mb-4 overflow-x-auto gap-1 scrollbar-none">
        {availableTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedRoleTab(t.id)}
            className={cn(
              "px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer",
              selectedRoleTab === t.id
                ? "border-[#004d25] text-[#004d25] font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            <span>{t.label}</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-semibold",
                selectedRoleTab === t.id
                  ? "bg-[#004d25]/10 text-[#004d25]"
                  : "bg-gray-100 text-gray-600",
              )}
            >
              {tabCounts[t.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search agents by name or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#004d25] focus:border-transparent"
        />
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0">
              <tr>
                <th className="px-6 py-3 font-medium">Name & Phone</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Jurisdiction</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      <span>Loading agents...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No agents found in your jurisdiction.
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setEditAgent(agent)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{agent.name}</div>
                      <div className="text-gray-500 text-xs flex items-center gap-1.5 flex-wrap">
                        <span>{agent.phone}</span>
                        {user.role === "national_admin" &&
                          (agent.role === "lga_admin" ||
                            agent.role === "ward_admin" ||
                            agent.role === "pu_agent") &&
                          getStateNameForAgent(agent) && (
                            <span className="text-gray-500 font-medium capitalize">
                              • {getStateNameForAgent(agent).toLowerCase()}
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize text-gray-700 bg-gray-100 px-2 py-1 rounded text-xs">
                        {agent.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <JurisdictionCell id={agent.locationId} locations={locations} />
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium",
                          agent.status === "active"
                            ? "bg-green-100 text-green-800"
                            : agent.status === "suspended"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800",
                        )}
                      >
                        {agent.status === "active" && <CheckCircle size={12} />}
                        {agent.status === "suspended" && <ShieldAlert size={12} />}
                        {agent.status === "revoked" && <XCircle size={12} />}
                        <span className="capitalize">{agent.status}</span>
                      </span>
                    </td>
                    <td
                      className="px-6 py-4 text-right space-x-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => handleOpenSmsModal(agent, e)}
                        className="text-blue-600 hover:text-blue-800 font-medium text-xs inline-flex items-center gap-1 cursor-pointer"
                        title="Send login credentials SMS via EGAB"
                      >
                        <SendHorizonal size={12} />
                        SMS
                      </button>
                      {agent.status !== "active" && (
                        <button
                          onClick={async () => {
                            await updateAgentStatus(agent.id, "active");
                            Promise.resolve(fetchLocalAgents()).catch((error: unknown) =>
                              console.error("Async operation failed in Agents", error),
                            );
                          }}
                          className="text-green-600 hover:text-green-800 font-medium text-xs"
                        >
                          Activate
                        </button>
                      )}
                      {agent.status === "active" && (
                        <button
                          onClick={async () => {
                            await updateAgentStatus(agent.id, "suspended");
                            Promise.resolve(fetchLocalAgents()).catch((error: unknown) =>
                              console.error("Async operation failed in Agents", error),
                            );
                          }}
                          className="text-yellow-600 hover:text-yellow-800 font-medium text-xs"
                        >
                          Suspend
                        </button>
                      )}
                      {agent.status !== "revoked" && (
                        <button
                          onClick={async () => {
                            await updateAgentStatus(agent.id, "revoked");
                            Promise.resolve(fetchLocalAgents()).catch((error: unknown) =>
                              console.error("Async operation failed in Agents", error),
                            );
                          }}
                          className="text-red-600 hover:text-red-800 font-medium text-xs cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                      {canDeleteAgent(agent) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAgentToDelete(agent);
                          }}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors inline-flex items-center gap-1 font-medium text-xs cursor-pointer"
                          title={`Delete ${agent.name}`}
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Modal */}
      <AgentModal
        isOpen={showAddModal || !!editAgent}
        onClose={() => {
          setShowAddModal(false);
          setEditAgent(null);
        }}
        onSave={handleSaveAgent}
        onDelete={
          editAgent && canDeleteAgent(editAgent)
            ? async (id) => {
                await deleteAgent(id);
                setShowAddModal(false);
                setEditAgent(null);
                await fetchLocalAgents();
              }
            : undefined
        }
        initialData={editAgent || undefined}
        fixedLocation={undefined}
        userRole={user.role}
      />

      {/* Send SMS Modal (Normal SMS or Update Password) */}
      {smsModalAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSmsModalAgent(null)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md min-h-[500px] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 border-b border-gray-100 bg-[#004d25] text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <SendHorizonal size={18} />
                  Send SMS
                </h3>
                <p className="text-xs text-green-100">
                  Recipient: {smsModalAgent.name} ({smsModalAgent.phone})
                </p>
              </div>
              <button
                onClick={() => setSmsModalAgent(null)}
                className="text-green-100 hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Mode Selector Tabs: Normal SMS vs Update Password */}
            <div className="grid grid-cols-2 w-full border-b border-gray-200 bg-gray-50/60">
              <button
                type="button"
                onClick={() => setSmsMode("normal")}
                className={cn(
                  "w-full h-11 text-xs sm:text-sm font-semibold border-b-2 text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                  smsMode === "normal"
                    ? "border-[#004d25] text-[#004d25] bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50",
                )}
              >
                Normal SMS
              </button>
              <button
                type="button"
                onClick={() => setSmsMode("password")}
                className={cn(
                  "w-full h-11 text-xs sm:text-sm font-semibold border-b-2 text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                  smsMode === "password"
                    ? "border-[#004d25] text-[#004d25] bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50",
                )}
              >
                Update Password
              </button>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between">
              {smsMode === "normal" ? (
                /* Normal SMS Message Input */
                <div className="flex-1 flex flex-col space-y-2 mb-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Message Content
                  </label>
                  <textarea
                    value={normalSmsText}
                    onChange={(e) => setNormalSmsText(e.target.value)}
                    placeholder={`Hello ${smsModalAgent.firstName || smsModalAgent.name.split(" ")[0]}, type your message here...`}
                    className="w-full flex-1 min-h-[180px] p-3 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none transition-colors resize-none"
                  />
                  <div className="flex justify-between items-center text-[11px] text-gray-500 pt-1">
                    <span>Delivered via EGAB SMS</span>
                    <span>
                      {normalSmsText.length} chars ({Math.ceil(normalSmsText.length / 160) || 1}{" "}
                      page
                      {Math.ceil(normalSmsText.length / 160) > 1 ? "s" : ""})
                    </span>
                  </div>
                </div>
              ) : (
                /* Update Password & Send Credentials */
                <div className="flex-1 flex flex-col justify-between space-y-3 mb-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                        Password to Send in SMS
                      </label>
                      <button
                        type="button"
                        onClick={() => setSmsPassword(generateTempPassword())}
                        className="text-xs text-[#004d25] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <RefreshCw size={11} /> Generate New
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={smsPassword}
                        onChange={(e) => setSmsPassword(e.target.value)}
                        placeholder="Enter password (6-24 chars)..."
                        maxLength={24}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 font-mono focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                      />
                      <KeyRound
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-green-50 p-2.5 rounded-lg border border-green-200 text-xs text-green-900">
                    <input
                      id="sync-pwd-checkbox"
                      type="checkbox"
                      checked={syncPasswordToDb}
                      onChange={(e) => setSyncPasswordToDb(e.target.checked)}
                      className="rounded text-[#004d25] focus:ring-[#004d25] cursor-pointer"
                    />
                    <label htmlFor="sync-pwd-checkbox" className="cursor-pointer select-none">
                      Update agent password in database so they can log in with this password
                    </label>
                  </div>

                  <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-2.5 text-xs space-y-1">
                    <span className="font-semibold text-gray-700 block">SMS Message Preview:</span>
                    <p className="font-mono text-gray-800 break-words leading-relaxed">
                      {buildLoginSms({
                        firstname:
                          smsModalAgent.firstName || smsModalAgent.name.split(" ")[0] || "",
                        phone: smsModalAgent.phone,
                        password: smsPassword || "(as registered)",
                        stateId: smsModalAgent.stateId,
                      })}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSmsModalAgent(null)}
                  disabled={sendingSms}
                  className="flex-1 py-2 px-3 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendSms}
                  disabled={
                    sendingSms || (smsMode === "normal" ? !normalSmsText.trim() : !smsPassword)
                  }
                  className="flex-1 py-2 px-3 bg-[#004d25] hover:bg-[#00381b] text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {sendingSms ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Agent Confirmation Modal */}
      {agentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => !isDeleting && setAgentToDelete(null)}
          />
          <div className="relative bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Agent</h3>
                <p className="text-xs text-gray-500">
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            <div className="bg-red-50/70 border border-red-100 rounded-xl p-3.5 text-xs text-red-900 space-y-1">
              <p className="font-semibold text-sm text-red-950">{agentToDelete.name}</p>
              <p className="text-red-700">
                Phone: <span className="font-mono font-medium">{agentToDelete.phone}</span>
              </p>
              <p className="text-red-700">
                Role:{" "}
                <span className="capitalize font-medium">
                  {agentToDelete.role.replace("_", " ")}
                </span>
              </p>
            </div>

            <p className="text-xs text-gray-600">
              Deleting this agent will permanently revoke their credentials, remove all associated
              active sessions, and purge their profile from your jurisdiction.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setAgentToDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
