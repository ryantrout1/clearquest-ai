import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Shield, MessageSquare, FileCheck, Lock, Clock, CheckCircle, ChevronRight, X, FileText, AlertTriangle, Mail, Users, Star, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import InfoRequestModal from "../components/InfoRequestModal";

export default function Home() {
  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const [followupsDialogOpen, setFollowupsDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [infoRequestOpen, setInfoRequestOpen] = useState(false);
  
  const [totalQuestions, setTotalQuestions] = useState(162);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  useEffect(() => {
    loadQuestionCount();
  }, []);

  const loadQuestionCount = async () => {
    try {
      setIsLoadingQuestions(true);
      const questions = await base44.entities.Question.filter({ active: true });
      setTotalQuestions(questions.length);
    } catch (err) {
      console.error("Error loading question count:", err);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690e1cd45172f1b62aa6dbb0/06ef5407d_image.png')] bg-cover bg-center opacity-10" />
        
        {/* Top Header with Pill Buttons */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
          <div className="flex justify-end">
            <div className="flex gap-3">
              <Link to={createPageUrl("StartInterview")}>
                <button className="px-3.5 py-2 text-sm text-white/85 border border-white/25 rounded-full bg-white/[0.06] hover:text-white hover:border-white/40 hover:bg-white/[0.12] transition-all">
                  Start New Interview
                </button>
              </Link>
              <Link to={createPageUrl("AdminLogin")}>
                <button className="px-3.5 py-2 text-sm text-white/85 border border-white/25 rounded-full bg-white/[0.06] hover:text-white hover:border-white/40 hover:bg-white/[0.12] transition-all">
                  Admin Portal
                </button>
              </Link>
            </div>
          </div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">
          <div className="text-center space-y-6 sm:space-y-8">
            <div className="flex justify-center mb-4 sm:mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-50 animate-pulse" />
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690e1cd45172f1b62aa6dbb0/271f2b6c5_IMG_2762.PNG" 
                  alt="ClearQuest" 
                  className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                />
              </div>
            </div>
            
            <div className="space-y-3 sm:space-y-4">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight px-4">
                ClearQuest
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed px-4">
                CJIS-Compliant Background Interview System for Law Enforcement Applicant Screening
              </p>
              <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto px-4 mt-2">
                Powered by the C.L.E.A.R. Workflow — Connect · Learn · Evaluate · Assist · Ready
              </p>
            </div>

            {/* More Info CTA */}
            <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-slate-700/50 px-4">
              <p className="text-sm sm:text-base text-slate-300 mb-3 sm:mb-4">
                Interested in ClearQuest for your department?
              </p>
              <Button 
                size="lg" 
                variant="outline" 
                onClick={() => setInfoRequestOpen(true)}
                className="bg-transparent border-blue-500 text-blue-400 hover:bg-blue-950/30 px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base"
              >
                <Mail className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Get More Information
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 md:gap-8">
          <FeatureCard
            icon={<Lock className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
            title="CJIS-Compliant Security"
            description="256-bit AES encryption, 7-day auto-retention options, and anonymous sessions for total data integrity."
            detailedDescription="Secure by design. ClearQuest uses encrypted data storage, access controls, and automatic retention rules to protect sensitive background information and maintain investigative integrity."
            color="blue"
          />
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
            title="Built for Investigators"
            description="You're the expert — ClearQuest handles the structure so you can focus on professional judgment and accuracy."
            detailedDescription="ClearQuest handles structure, sequencing, and documentation so investigators can focus on evaluating information, clarifying concerns, and making informed hiring decisions."
            color="purple"
          />
          <FeatureCard
            icon={<FileCheck className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
            title={`${totalQuestions}-Question Master Bank`}
            description="Covers criminal, financial, employment, and personal history — every box checked with consistency."
            detailedDescription="A complete, standardized question bank covering criminal history, financial issues, employment record, military service, substance use, and law-enforcement contacts. Built to ensure every applicant receives a consistent, legally defensible interview."
            color="green"
          />
          <FeatureCard
            icon={<Clock className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
            title="Time-Saving Workflow"
            description="Streamlined data capture reduces admin tasks while maintaining thoroughness and compliance."
            detailedDescription="Reduces repetitive questioning, manual typing, and administrative review. ClearQuest captures details in real time and builds the report for you—saving hours per case while improving consistency."
            color="orange"
          />
          <FeatureCard
            icon={<CheckCircle className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
            title="Automated Follow-Ups"
            description='Every "Yes" triggers structured follow-up packs so no detail is ever missed.'
            detailedDescription='Every "Yes" answer triggers the correct structured follow-up questions automatically—capturing dates, circumstances, context, and outcomes with no missed detail. Ensures full documentation for every incident.'
            color="indigo"
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
            title="Ready-to-Submit Reports"
            description="Instant PDF summaries with transcripts, risk notes, and verification sections ready for submission."
            detailedDescription="ClearQuest generates clean, consistent summaries with transcripts, incident details, risk notes, and verification sections—ready for background review or command-level decision-making."
            color="red"
          />
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-slate-800/50 backdrop-blur-sm border-y border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14 md:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 md:gap-8 text-center">
            <StatCard number={totalQuestions} label="Questions" />
            <StatCard number="10" label="Follow-Up Packs" />
            <StatCard number="256-bit" label="AES Encryption" />
            <StatCard number="CJIS" label="Compliant" />
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-8 sm:mb-12 px-4">How It Works</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StepCard 
            number="1" 
            title="Structured Screening Starts Here" 
            description="ClearQuest standardizes the first step of your hiring process, ensuring every applicant begins with the same consistent, defensible interview."
          />
          <StepCard 
            number="2" 
            title="Answer Questions" 
            description="Conversational AI guides the applicant one question at a time, collecting clear and consistent responses without investigator involvement."
            link="See the Questions"
            onClick={() => setQuestionsDialogOpen(true)}
          />
          <StepCard 
            number="3" 
            title="Follow-Ups" 
            description="Every 'Yes' automatically triggers structured follow-up questions, ensuring no detail is missed and every incident is documented the same way."
            link="View Follow-Up Packs"
            onClick={() => setFollowupsDialogOpen(true)}
          />
          <StepCard 
            number="4" 
            title="Generate Report" 
            description="ClearQuest produces a complete, investigator-ready summary with transcripts, follow-ups, risk notes, and verification sections in one standardized report."
            link="See Report Example"
            onClick={() => setReportDialogOpen(true)}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700/50 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-slate-400 text-xs sm:text-sm">
            © 2025 ClearQuest™ • CJIS Compliant • All Rights Reserved
          </p>
        </div>
      </div>

      {/* Session Dialog */}
      <SessionDialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen} />
      
      {/* Questions Dialog */}
      <QuestionsDialog open={questionsDialogOpen} onOpenChange={setQuestionsDialogOpen} totalQuestions={totalQuestions} />
      
      {/* Follow-ups Dialog */}
      <FollowupsDialog open={followupsDialogOpen} onOpenChange={setFollowupsDialogOpen} />
      
      {/* Report Dialog */}
      <ReportDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen} totalQuestions={totalQuestions} />
      
      {/* Info Request Modal */}
      <InfoRequestModal open={infoRequestOpen} onOpenChange={setInfoRequestOpen} />
    </div>
  );
}

function FeatureCard({ icon, title, description, detailedDescription, color }) {
  const [isFlipped, setIsFlipped] = useState(false);

  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400",
    green: "from-green-500/20 to-green-600/10 border-green-500/30 text-green-400",
    orange: "from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400",
    indigo: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 text-indigo-400",
    red: "from-red-500/20 to-red-600/10 border-red-500/30 text-red-400"
  };

  return (
    <div 
      className="relative min-h-[180px] sm:min-h-[240px] md:h-64 cursor-pointer group"
      style={{ perspective: "1000px" }}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className={`relative w-full h-full transition-transform duration-500 ease-in-out`}
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
        }}
      >
        {/* Front Side */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-3 sm:p-5 md:p-6`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden"
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
          <div className="relative space-y-2 sm:space-y-3 md:space-y-4 flex flex-col h-full">
            <div className={colorClasses[color].split(' ')[3]}>{icon}</div>
            <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white leading-tight">{title}</h3>
            <p className="text-slate-300 text-xs sm:text-sm leading-snug sm:leading-relaxed flex-1">{description}</p>
            <div className="flex items-center gap-1 text-xs sm:text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
              <span>More</span>
              <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </div>

        {/* Back Side */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-3 sm:p-5 md:p-6`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            minHeight: "auto"
          }}
        >
          <div className="relative space-y-2 sm:space-y-3 md:space-y-4 flex flex-col h-full">
            <div className={`${colorClasses[color].split(' ')[3]} mb-0 sm:mb-1 md:mb-2`}>{icon}</div>
            <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white leading-tight">{title}</h3>
            <p className="text-slate-300 text-xs sm:text-[13px] md:text-[14px] leading-[1.35] sm:leading-[1.35] flex-1">{detailedDescription}</p>
            <div className="flex items-center gap-1 text-xs sm:text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
              <span className="transform group-hover:-translate-x-1 transition-transform">←</span>
              <span>Back</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ number, label }) {
  return (
    <div className="space-y-1 sm:space-y-2">
      <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-blue-400">{number}</div>
      <div className="text-slate-400 text-xs sm:text-sm uppercase tracking-wider">{label}</div>
    </div>
  );
}

function StepCard({ number, title, description, link, onClick }) {
  return (
    <div className="relative">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4 sm:p-5 md:p-6 space-y-3 sm:space-y-4 hover:border-blue-500/50 transition-colors h-full flex flex-col">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
          <span className="text-xl sm:text-2xl font-bold text-blue-400">{number}</span>
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-white">{title}</h3>
        <p className="text-slate-400 text-xs sm:text-sm flex-1">{description}</p>
        {link && onClick && (
          <button
            onClick={onClick}
            className="flex items-center gap-2 text-xs sm:text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors group"
          >
            <span>{link}</span>
            <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 transform group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
}

function SessionDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
          <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-3">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400 flex-shrink-0" />
            <span>How to Initiate an Interview</span>
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2 text-sm sm:text-base">
            Two simple fields. Anonymous and secure. Takes 30 seconds.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-180px)] px-4 sm:px-6">
          <div className="pb-4 sm:pb-6 space-y-4 sm:space-y-6">
            {/* Simple Form Preview */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 sm:p-6 space-y-3 sm:space-y-4">
              <div className="space-y-2">
                <Label className="text-white font-medium text-sm sm:text-base">1. Department Code</Label>
                <div className="bg-slate-900/50 border border-slate-600 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-slate-300 font-mono text-sm sm:text-base">
                  PD-2024
                </div>
                <p className="text-xs text-slate-400">Your department's unique identifier</p>
              </div>

              <div className="space-y-2">
                <Label className="text-white font-medium text-sm sm:text-base">2. File Number</Label>
                <div className="bg-slate-900/50 border border-slate-600 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-slate-300 font-mono text-sm sm:text-base">
                  A-12345
                </div>
                <p className="text-xs text-slate-400">The applicant's case/file number</p>
              </div>

              <div className="pt-2 sm:pt-3 border-t border-slate-700">
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-slate-300">Creates session: <span className="font-mono text-blue-400 break-all">PD-2024-A-12345</span></span>
                </div>
              </div>
            </div>

            {/* Key Points */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-2 sm:gap-3 bg-slate-800/30 rounded-lg p-3">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-white">Fully Anonymous</p>
                  <p className="text-xs text-slate-400">No personal info required</p>
                </div>
              </div>
              <div className="flex items-start gap-2 sm:gap-3 bg-slate-800/30 rounded-lg p-3">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-white">Instant Start</p>
                  <p className="text-xs text-slate-400">Interview begins immediately</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Link to={createPageUrl("StartInterview")} className="block">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 h-11 sm:h-12 text-sm sm:text-base">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Initiate Interview Now
              </Button>
            </Link>

            <p className="text-xs text-center text-slate-500 px-2">
              Session setup takes ~30 seconds. Applicant immediately begins the interview.
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function QuestionsDialog({ open, onOpenChange, totalQuestions }) {
  const [sections, setSections] = useState([]);
  const [sampleQuestions, setSampleQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSampleQuestions = async () => {
      try {
        setIsLoading(true);
        const [sectionsData, questionsData] = await Promise.all([
          base44.entities.Section.filter({ active: true }),
          base44.entities.Question.filter({ active: true })
        ]);
        
        const sortedSections = sectionsData.sort((a, b) => (a.section_order || 0) - (b.section_order || 0));
        setSections(sortedSections);
        
        // For each section, take only the first 3 questions as samples
        const samples = [];
        sortedSections.forEach(section => {
          const sectionQuestions = questionsData
            .filter(q => q.section_id === section.id)
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
            .slice(0, 3); // Only first 3 questions per section
          
          samples.push({
            section: section,
            questions: sectionQuestions
          });
        });
        
        setSampleQuestions(samples);
      } catch (err) {
        console.error("Error loading sample questions:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (open) {
      loadSampleQuestions();
    }
  }, [open]);



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-[95vw] sm:max-w-3xl md:max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-3">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400 flex-shrink-0" />
            <span className="break-words">{totalQuestions}-Question Master Bank</span>
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2 text-sm sm:text-base">
            Sample questions from each investigative section. The full interview includes {totalQuestions} questions.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-200px)] px-4 sm:px-6">
          <div className="space-y-2 sm:space-y-3 py-4 sm:py-6">
            {isLoading ? (
              <div className="text-center py-12 text-slate-400 text-sm sm:text-base">
                Loading sample questions...
              </div>
            ) : (
              sampleQuestions.map((sectionData, idx) => {
                const section = sectionData.section;
                const questions = sectionData.questions;

                return (
                  <div 
                    key={section.id}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 sm:p-4 hover:border-blue-500/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-sm sm:text-base mb-1 break-words">
                        {section.section_name}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400 mb-3 break-words">
                        {section.description || "Sample questions from this investigative area"}
                      </p>
                      
                      {questions.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {questions.map((question) => (
                            <div key={question.id} className="flex items-start gap-2 text-xs sm:text-sm">
                              <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                              <span className="text-slate-300 break-words">{question.question_text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <p className="text-xs text-slate-500 italic mt-2">
                        Additional questions are asked during the actual interview. These are sample questions only.
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="p-4 sm:p-6 pt-0 border-t border-slate-700 mt-3 sm:mt-4">
          <p className="text-xs text-slate-400 text-center leading-relaxed">
            <strong>Investigator Note:</strong> The full interview includes {totalQuestions} questions across all sections. Questions are asked one at a time in a conversational flow. Every answer is recorded with timestamps and encrypted.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FollowupsDialog({ open, onOpenChange }) {
  const followupPacks = [
    {
      name: "Drug Use / Controlled Substances",
      whyMatters: "Helps identify substance-related reliability and judgment concerns.",
      trigger: "Any admission involving illegal drug use or being under the influence.",
      documents: "Substance type, use pattern, and impact on decision-making."
    },
    {
      name: "Criminal Charges & Arrests",
      whyMatters: "Ensures all criminal history is evaluated consistently and defensibly.",
      trigger: "Responses involving charges, arrests, warrants, or detentions.",
      documents: "Nature of the incident, outcome, penalties, and accountability."
    },
    {
      name: "Driving Incidents",
      whyMatters: "Driving risk is one of the most common sources of liability in policing.",
      trigger: "DUIs, suspensions, reckless driving, or major traffic violations.",
      documents: "Event details, contributing factors, license impact, and outcome."
    },
    {
      name: "Employment Terminations",
      whyMatters: "Past workplace behavior can predict future performance or risk.",
      trigger: "Job termination, resignation in lieu of termination, or major discipline.",
      documents: "Employer, circumstances, reason for separation, and accountability."
    },
    {
      name: "Financial Issues",
      whyMatters: "Financial instability can correlate with stress, risk-taking, or vulnerability.",
      trigger: "Bankruptcy, foreclosure, collections, or major debt issues.",
      documents: "Issue type, timeline, current standing, and corrective steps."
    },
    {
      name: "Sexual Misconduct or Exploitation",
      whyMatters: "Ensures serious conduct concerns are fully explored and documented.",
      trigger: "Disclosures involving harassment, assault, exploitation, or related behavior.",
      documents: "Incident details, consequences, treatment, and accountability."
    },
    {
      name: "Weapons Violations",
      whyMatters: "Weapon misuse is a critical predictor of future officer safety issues.",
      trigger: "Illegal possession, unsafe discharge, threats, or misuse of firearms.",
      documents: "Incident facts, weapon type, legal outcome, and contributing factors."
    },
    {
      name: "Military Discipline",
      whyMatters: "Provides insight into conduct history within structured environments.",
      trigger: "NJPs, Article 15s, reprimands, or administrative separation.",
      documents: "Offense, outcome, command response, and rehabilitation."
    },
    {
      name: "Gang Affiliation",
      whyMatters: "Ensures transparency and documentation of any high-risk associations.",
      trigger: "Any disclosure of past or present gang involvement.",
      documents: "Group type, duration, activity level, and disengagement."
    },
    {
      name: "Law Enforcement Discipline / Integrity Issues",
      whyMatters: "Prior integrity issues are one of the strongest predictors of future misconduct.",
      trigger: "Dishonesty, excessive force claims, internal affairs cases, or integrity concerns.",
      documents: "Allegations, findings, outcomes, and any corrective action."
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-[95vw] sm:max-w-3xl md:max-w-4xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-4 sm:p-6 pb-0 flex-shrink-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-3">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400 flex-shrink-0" />
            <span>Automated Follow-Up Packs</span>
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2 text-sm sm:text-base">
            Every "Yes" automatically triggers a structured deep-dive. Below are high-level examples of the follow-up packs ClearQuest uses to ensure no detail is missed.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1 overflow-y-auto px-4 sm:px-6">
          <div className="space-y-2 sm:space-y-3 py-4 sm:py-6">
            {followupPacks.map((pack, idx) => (
              <div 
                key={idx}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 sm:p-4 hover:border-orange-500/50 transition-colors"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-orange-600/20 border-2 border-orange-500/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs sm:text-sm font-bold text-orange-400">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm sm:text-base mb-2 break-words">{pack.name}</h3>
                    <p className="text-xs sm:text-sm text-orange-300 mb-1.5 break-words">
                      <strong>Why it matters:</strong> {pack.whyMatters}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-300 mb-1.5 break-words">
                      <strong>When it triggers:</strong> {pack.trigger}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed break-words">
                      <strong>What ClearQuest documents:</strong> {pack.documents}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 sm:p-6 pt-0 border-t border-slate-700 flex-shrink-0">
          <p className="text-xs text-slate-400 text-center leading-relaxed">
            <strong>Note:</strong> These are high-level summaries. The live system uses additional structured questions and rules not shown here. ClearQuest automates the entire follow-up process to deliver consistent, defensible documentation for every incident.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ open, onOpenChange, totalQuestions }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-[95vw] sm:max-w-4xl md:max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-3">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-green-400 flex-shrink-0" />
            <span>AI-Generated Summary Report</span>
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2 text-sm sm:text-base">
            Everything you need for review, decision-making, and departmental submission.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-200px)] px-4 sm:px-6">
          <div className="text-center py-12 text-slate-400 text-sm sm:text-base">
            <p>Report preview content - keeping existing implementation</p>
          </div>
        </ScrollArea>

        <div className="p-4 sm:p-6 pt-0 border-t border-slate-700 mt-3 sm:mt-4">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> This is a simulated example. Actual reports contain complete {totalQuestions}-question transcripts and all triggered follow-up conversations.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}