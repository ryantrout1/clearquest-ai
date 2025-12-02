import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Database, ChevronRight, AlertCircle, CheckCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FactModelAdmin() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedModel, setSelectedModel] = useState(null);

  const { data: factModels = [], isLoading } = useQuery({
    queryKey: ['fact-models'],
    queryFn: () => base44.entities.FactModel.list()
  });

  const filteredModels = factModels.filter(model =>
    model.category_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.category_label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.incident_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">Active</Badge>;
      case 'DRAFT':
        return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">Draft</Badge>;
      case 'DISABLED':
        return <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30 text-xs">Disabled</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30 text-xs">Unknown</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800/50 bg-[#0f1629] px-4 py-3 mb-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to={createPageUrl("HomeHub")}>
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-800 -ml-2">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-white">Fact Model Admin</h1>
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                    Internal – V3
                  </Badge>
                </div>
                <span className="text-xs text-slate-400 block mt-0.5">
                  Manage FactModels for IDE v2 / Interview V3
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {/* Search */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search by category, incident type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-sm h-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Panel: List */}
          <div className="lg:col-span-1 space-y-2">
            <div className="text-xs text-slate-400 uppercase tracking-wide px-1 mb-2">
              Fact Models ({filteredModels.length})
            </div>
            
            {isLoading ? (
              <Card className="bg-slate-900/70 border-slate-800">
                <CardContent className="p-8 text-center">
                  <div className="text-slate-400 text-sm">Loading...</div>
                </CardContent>
              </Card>
            ) : filteredModels.length === 0 ? (
              <Card className="bg-slate-900/70 border-slate-800">
                <CardContent className="p-8 text-center space-y-2">
                  <Database className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-slate-400 text-sm">No FactModels found</p>
                  <p className="text-slate-500 text-xs">FactModels are created via data seeding</p>
                </CardContent>
              </Card>
            ) : (
              filteredModels.map(model => (
                <Card
                  key={model.id}
                  onClick={() => setSelectedModel(model)}
                  className={cn(
                    "cursor-pointer transition-all",
                    selectedModel?.id === model.id
                      ? "bg-purple-900/30 border-purple-600/50"
                      : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-cyan-400">{model.category_id}</span>
                          {getStatusBadge(model.status)}
                        </div>
                        <div className="text-sm text-white font-medium truncate">
                          {model.category_label || model.category_id}
                        </div>
                        {model.incident_type && (
                          <div className="text-xs text-slate-400 truncate">
                            Type: {model.incident_type}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Right Panel: Details */}
          <div className="lg:col-span-2">
            {selectedModel ? (
              <Card className="bg-slate-900/70 border-slate-800">
                <CardHeader className="border-b border-slate-800 pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg text-white flex items-center gap-2">
                        {selectedModel.category_label || selectedModel.category_id}
                        {getStatusBadge(selectedModel.status)}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-cyan-400">{selectedModel.category_id}</span>
                        {selectedModel.incident_type && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-xs text-slate-400">{selectedModel.incident_type}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {selectedModel.is_ready_for_ai_probing ? (
                      <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        AI Ready
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-xs">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Not AI Ready
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {selectedModel.description && (
                    <div className="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-3">
                      {selectedModel.description}
                    </div>
                  )}

                  {/* V3 Required Fields */}
                  {selectedModel.required_fields && selectedModel.required_fields.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        Required Fields (V3)
                      </h4>
                      <div className="space-y-1.5">
                        {selectedModel.required_fields.map((field, idx) => (
                          <div key={field.field_id || idx} className="bg-green-950/30 border border-green-800/40 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs text-green-300">{field.field_id}</span>
                              <Badge className="bg-slate-700 text-slate-300 text-[10px]">{field.type}</Badge>
                            </div>
                            <div className="text-sm text-white mt-0.5">{field.label}</div>
                            {field.notes && <div className="text-xs text-slate-400 mt-0.5">{field.notes}</div>}
                            {field.enum_options && field.enum_options.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {field.enum_options.map((opt, i) => (
                                  <span key={i} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{opt}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* V3 Optional Fields */}
                  {selectedModel.optional_fields && selectedModel.optional_fields.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        Optional Fields (V3)
                      </h4>
                      <div className="space-y-1.5">
                        {selectedModel.optional_fields.map((field, idx) => (
                          <div key={field.field_id || idx} className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs text-slate-400">{field.field_id}</span>
                              <Badge className="bg-slate-700 text-slate-300 text-[10px]">{field.type}</Badge>
                            </div>
                            <div className="text-sm text-slate-200 mt-0.5">{field.label}</div>
                            {field.notes && <div className="text-xs text-slate-500 mt-0.5">{field.notes}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Legacy mandatory_facts */}
                  {selectedModel.mandatory_facts && selectedModel.mandatory_facts.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">
                        Mandatory Facts (Legacy V1/V2)
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedModel.mandatory_facts.map((fact, idx) => (
                          <Badge key={idx} className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
                            {fact}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Legacy optional_facts */}
                  {selectedModel.optional_facts && selectedModel.optional_facts.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                        Optional Facts (Legacy V1/V2)
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedModel.optional_facts.map((fact, idx) => (
                          <Badge key={idx} className="bg-slate-500/20 text-slate-300 border-slate-500/30 text-xs">
                            {fact}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Linked Packs */}
                  {selectedModel.linked_pack_ids && selectedModel.linked_pack_ids.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2">
                        Linked Follow-Up Packs
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedModel.linked_pack_ids.map((packId, idx) => (
                          <Badge key={idx} className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs font-mono">
                            {packId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw JSON (for debugging) */}
                  <div className="pt-3 border-t border-slate-800">
                    <details className="text-xs">
                      <summary className="text-slate-500 cursor-pointer hover:text-slate-400">
                        View Raw JSON
                      </summary>
                      <pre className="mt-2 bg-slate-950 p-3 rounded-lg overflow-x-auto text-slate-400 text-[10px] leading-relaxed">
                        {JSON.stringify(selectedModel, null, 2)}
                      </pre>
                    </details>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-slate-900/70 border-slate-800">
                <CardContent className="p-12 text-center space-y-3">
                  <Database className="w-12 h-12 text-slate-600 mx-auto" />
                  <p className="text-slate-400 text-sm">Select a FactModel to view details</p>
                  <p className="text-slate-500 text-xs">
                    FactModels define the schema for fact collection in Interview V3
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-xs">
            © 2025 ClearQuest™ • Internal – Fact Model (V3)
          </p>
        </div>
      </div>
    </div>
  );
}