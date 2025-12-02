import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, User, Info, Loader2 } from "lucide-react";
import { formatDateTimeAZ } from "../utils/dateFormatters";

/**
 * V3 Transcript Tab - Chronological view of all V3 probing messages
 */
export default function V3TranscriptTab({ sessionId, incidents }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterIncident, setFilterIncident] = useState("all");

  useEffect(() => {
    loadTranscript();
  }, [sessionId]);

  const loadTranscript = async () => {
    setIsLoading(true);
    try {
      const transcriptMessages = await base44.entities.InterviewTranscript.filter(
        { session_id: sessionId },
        'created_date',
        500
      );
      
      // Sort by created_date ascending
      const sorted = transcriptMessages.sort((a, b) => 
        new Date(a.created_date) - new Date(b.created_date)
      );
      
      setMessages(sorted);
    } catch (err) {
      console.error("[V3 TRANSCRIPT TAB] Error loading transcript:", err);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique categories and incidents for filters
  const categories = [...new Set(messages.map(m => m.category_id).filter(Boolean))];
  const incidentIds = [...new Set(messages.map(m => m.incident_id).filter(Boolean))];

  // Filter messages
  const filteredMessages = messages.filter(msg => {
    if (filterCategory !== "all" && msg.category_id !== filterCategory) return false;
    if (filterIncident !== "all" && msg.incident_id !== filterIncident) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        <span className="ml-2 text-slate-400">Loading transcript...</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p>No V3 transcript messages recorded for this session.</p>
        <p className="text-xs mt-2 text-slate-500">
          V3 transcripts are only generated during V3 FactModel-based probing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-600 text-white text-sm">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="all" className="text-white">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat} className="text-white">
                {cat.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterIncident} onValueChange={setFilterIncident}>
          <SelectTrigger className="w-48 bg-slate-800 border-slate-600 text-white text-sm">
            <SelectValue placeholder="All Incidents" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="all" className="text-white">All Incidents</SelectItem>
            {incidentIds.map(id => (
              <SelectItem key={id} value={id} className="text-white text-xs">
                {id.substring(0, 20)}...
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <div className="text-xs text-slate-500 flex items-center">
          Showing {filteredMessages.length} of {messages.length} messages
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
        {filteredMessages.map((msg, idx) => (
          <TranscriptMessage key={msg.id || idx} message={msg} />
        ))}
      </div>
    </div>
  );
}

function TranscriptMessage({ message }) {
  const { role, message_type, message_text, category_id, incident_id, created_date, probe_count } = message;
  
  // Determine styling based on role
  const roleConfig = {
    AI: {
      bg: "bg-slate-800/60",
      border: "border-emerald-700/40",
      icon: <Bot className="w-4 h-4 text-emerald-400" />,
      label: "AI Investigator",
      labelColor: "text-emerald-400"
    },
    CANDIDATE: {
      bg: "bg-blue-900/30",
      border: "border-blue-700/40",
      icon: <User className="w-4 h-4 text-blue-400" />,
      label: "Candidate",
      labelColor: "text-blue-400"
    },
    SYSTEM: {
      bg: "bg-slate-900/40",
      border: "border-slate-700/40",
      icon: <Info className="w-4 h-4 text-slate-400" />,
      label: "System",
      labelColor: "text-slate-400"
    }
  };
  
  const config = roleConfig[role] || roleConfig.SYSTEM;
  
  // Message type badge color
  const typeColors = {
    OPENING: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    FOLLOWUP_QUESTION: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    ANSWER: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    RECAP: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    INCIDENT_CREATED: "bg-green-500/20 text-green-300 border-green-500/30",
    INCIDENT_COMPLETED: "bg-green-500/20 text-green-300 border-green-500/30",
    PROBING_STOPPED: "bg-red-500/20 text-red-300 border-red-500/30",
    SYSTEM_NOTE: "bg-slate-500/20 text-slate-300 border-slate-500/30"
  };
  
  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-3`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {config.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs font-medium ${config.labelColor}`}>
              {config.label}
            </span>
            {message_type && (
              <Badge className={`text-[10px] ${typeColors[message_type] || typeColors.SYSTEM_NOTE}`}>
                {message_type.replace(/_/g, ' ')}
              </Badge>
            )}
            {category_id && (
              <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-600">
                {category_id.replace(/_/g, ' ')}
              </Badge>
            )}
            {probe_count !== null && probe_count !== undefined && (
              <span className="text-[10px] text-slate-500">
                Probe #{probe_count}
              </span>
            )}
          </div>
          
          {/* Message content */}
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
            {message_text}
          </p>
          
          {/* Footer */}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
            <span>{formatDateTimeAZ(created_date)}</span>
            {incident_id && (
              <span className="truncate max-w-[150px]">
                Incident: {incident_id.substring(0, 15)}...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}