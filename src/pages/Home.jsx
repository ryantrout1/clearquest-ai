
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Shield, MessageSquare, FileCheck, Lock, Clock, CheckCircle, ChevronRight, X, FileText, AlertTriangle } from "lucide-react";
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

export default function Home() {
  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const [followupsDialogOpen, setFollowupsDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false); // New state for session dialog

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690e1cd45172f1b62aa6dbb0/06ef5407d_image.png')] bg-cover bg-center opacity-10" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center space-y-8">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-50 animate-pulse" />
                <Shield className="relative w-24 h-24 text-blue-400" strokeWidth={1.5} />
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight">
                ClearQuest
              </h1>
              <p className="text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
                CJIS-Compliant Background Interview System for Law Enforcement Applicant Screening
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Link to={createPageUrl("StartInterview")}>
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg">
                  <MessageSquare className="w-5 h-5 mr-2" />
                  Start New Interview
                </Button>
              </Link>
              <Link to={createPageUrl("AdminLogin")}>
                <Button size="lg" variant="outline" className="bg-slate-800/50 border-slate-600 text-white hover:bg-slate-700 px-8 py-6 text-lg">
                  <Shield className="w-5 h-5 mr-2" />
                  Admin Portal
                </Button>
              </Link>
            </div>

            {/* Trial Signup CTA */}
            <div className="mt-12 pt-8 border-t border-slate-700/50">
              <p className="text-slate-300 mb-4">
                New department? Start your free trial today
              </p>
              <Link to={createPageUrl("TrialSignup")}>
                <Button size="lg" variant="outline" className="bg-transparent border-blue-500 text-blue-400 hover:bg-blue-950/30 px-8 py-4">
                  Start 30-Day Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Lock className="w-8 h-8" />}
            title="CJIS-Compliant Security"
            description="256-bit AES encryption, 7-day auto-retention options, and anonymous sessions for total data integrity."
            detailedDescription="ClearQuest meets full CJIS standards with encrypted data storage, secure access controls, and automatic data retention to protect investigator integrity."
            color="blue"
          />
          <FeatureCard
            icon={<MessageSquare className="w-8 h-8" />}
            title="Built for Investigators"
            description="You're the expert — ClearQuest handles the structure so you can focus on professional judgment and accuracy."
            detailedDescription="Designed around real investigator workflows — you stay in control while ClearQuest handles structure, documentation, and follow-up precision."
            color="purple"
          />
          <FeatureCard
            icon={<FileCheck className="w-8 h-8" />}
            title="162-Question Master Bank"
            description="Covers criminal, financial, employment, and personal history — every box checked with consistency."
            detailedDescription="Covers every investigative domain from employment to criminal history, ensuring every applicant is evaluated consistently and completely."
            color="green"
          />
          <FeatureCard
            icon={<Clock className="w-8 h-8" />}
            title="Time-Saving Workflow"
            description="Streamlined data capture reduces admin tasks while maintaining thoroughness and compliance."
            detailedDescription="Automates repetitive interview steps so investigators can focus on analysis and decision-making, not manual data entry."
            color="orange"
          />
          <FeatureCard
            icon={<CheckCircle className="w-8 h-8" />}
            title="Automated Follow-Ups"
            description='Every "Yes" triggers structured follow-up packs so no detail is ever missed.'
            detailedDescription='Every "Yes" answer launches the correct follow-up pack instantly — guaranteeing no missed detail and standardized documentation.'
            color="indigo"
          />
          <FeatureCard
            icon={<Shield className="w-8 h-8" />}
            title="Ready-to-Submit Reports"
            description="Instant PDF summaries with transcripts, risk notes, and verification sections ready for submission."
            detailedDescription="One-click generation of full reports with transcripts, notes, and risk summaries formatted for easy departmental submission."
            color="red"
          />
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-slate-800/50 backdrop-blur-sm border-y border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <StatCard number="162" label="Questions" />
            <StatCard number="10" label="Follow-Up Packs" />
            <StatCard number="256-bit" label="AES Encryption" />
            <StatCard number="CJIS" label="Compliant" />
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-4xl font-bold text-white text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <StepCard 
            number="1" 
            title="Initiate Interview" 
            description="Create anonymous session with department code and file number"
            link="See How to Start"
            onClick={() => setSessionDialogOpen(true)}
          />
          <StepCard 
            number="2" 
            title="Answer Questions" 
            description="Conversational AI asks one question at a time"
            link="See the Questions"
            onClick={() => setQuestionsDialogOpen(true)}
          />
          <StepCard 
            number="3" 
            title="Follow-Ups" 
            description="'Yes' answers trigger structured follow-up packs"
            link="View Follow-Up Packs"
            onClick={() => setFollowupsDialogOpen(true)}
          />
          <StepCard 
            number="4" 
            title="Generate Report" 
            description="Investigator receives complete PDF summary"
            link="See Report Example"
            onClick={() => setReportDialogOpen(true)}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-slate-400 text-sm">
            © 2025 ClearQuest™ • CJIS Compliant • All Rights Reserved
          </p>
        </div>
      </div>

      {/* Session Dialog */}
      <SessionDialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen} />
      
      {/* Questions Dialog */}
      <QuestionsDialog open={questionsDialogOpen} onOpenChange={setQuestionsDialogOpen} />
      
      {/* Follow-ups Dialog */}
      <FollowupsDialog open={followupsDialogOpen} onOpenChange={setFollowupsDialogOpen} />
      
      {/* Report Dialog */}
      <ReportDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen} />
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
      className="relative h-64 cursor-pointer group"
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
          className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-6`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden"
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
          <div className="relative space-y-4 flex flex-col h-full">
            <div className={colorClasses[color].split(' ')[3]}>{icon}</div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="text-slate-300 text-sm leading-relaxed flex-1">{description}</p>
            <div className="flex items-center gap-1 text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
              <span>More</span>
              <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </div>

        {/* Back Side */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-6`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)"
          }}
        >
          <div className="relative space-y-4 flex flex-col h-full">
            <div className={`${colorClasses[color].split(' ')[3]} mb-2`}>{icon}</div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            <p className="text-slate-300 text-sm leading-relaxed flex-1">{detailedDescription}</p>
            <div className="flex items-center gap-1 text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
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
    <div className="space-y-2">
      <div className="text-4xl md:text-5xl font-bold text-blue-400">{number}</div>
      <div className="text-slate-400 text-sm uppercase tracking-wider">{label}</div>
    </div>
  );
}

function StepCard({ number, title, description, link, onClick }) {
  return (
    <div className="relative">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4 hover:border-blue-500/50 transition-colors h-full flex flex-col">
        <div className="w-12 h-12 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl font-bold text-blue-400">{number}</span>
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-slate-400 text-sm flex-1">{description}</p>
        {link && onClick && (
          <button
            onClick={onClick}
            className="flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors group"
          >
            <span>{link}</span>
            <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
}

function SessionDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-400" />
            How to Initiate an Interview
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2">
            Two simple fields. Anonymous and secure. Takes 30 seconds.
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-6 pb-6 space-y-6">
          {/* Simple Form Preview */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-white font-medium">1. Department Code</Label>
              <div className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-slate-300 font-mono">
                PD-2024
              </div>
              <p className="text-xs text-slate-400">Your department's unique identifier</p>
            </div>

            <div className="space-y-2">
              <Label className="text-white font-medium">2. File Number</Label>
              <div className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-slate-300 font-mono">
                A-12345
              </div>
              <p className="text-xs text-slate-400">The applicant's case/file number</p>
            </div>

            <div className="pt-3 border-t border-slate-700">
              <div className="flex items-center gap-2 text-sm">
                <ChevronRight className="w-4 h-4 text-blue-400" />
                <span className="text-slate-300">Creates session: <span className="font-mono text-blue-400">PD-2024-A-12345</span></span>
              </div>
            </div>
          </div>

          {/* Key Points */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-3">
              <Lock className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white">Fully Anonymous</p>
                <p className="text-xs text-slate-400">No personal info required</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-3">
              <Clock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white">Instant Start</p>
                <p className="text-xs text-slate-400">Interview begins immediately</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <Link to={createPageUrl("StartInterview")} className="block">
            <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12">
              <Shield className="w-5 h-5 mr-2" />
              Initiate Interview Now
            </Button>
          </Link>

          <p className="text-xs text-center text-slate-500">
            Session setup takes ~30 seconds. Applicant immediately begins the interview.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionsDialog({ open, onOpenChange }) {
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [allQuestions, setAllQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        setIsLoading(true);
        const questions = await base44.entities.Question.filter({ active: true });
        setAllQuestions(questions.sort((a, b) => a.display_order - b.display_order));
      } catch (err) {
        console.error("Error loading questions:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (open) {
      loadQuestions();
    }
  }, [open]);

  const categories = [
    { name: "Applications with Other LE Agencies", description: "Prior applications, hiring outcomes, and withdrawal reasons" },
    { name: "Driving Record", description: "License history, DUIs, suspensions, accidents, and traffic violations" },
    { name: "Criminal Involvement / Police Contacts", description: "Arrests, charges, convictions, warrants, gang ties, and weapons violations" },
    { name: "Extremist Organizations", description: "Membership or support of hate groups and extremist ideologies" },
    { name: "Sexual Activities", description: "Prostitution, pornography, harassment, assault, and exploitation" },
    { name: "Financial History", description: "Bankruptcy, foreclosure, liens, debt, and gambling issues" },
    { name: "Illegal Drug / Narcotic History", description: "47-substance checklist covering use, sales, manufacturing, and prescriptions" },
    { name: "Alcohol History", description: "Alcohol dependency, treatment programs, and related incidents" },
    { name: "Military History", description: "Service branch, discharge status, discipline, and courts-martial" },
    { name: "Employment History", description: "Terminations, resignations, workplace investigations, and policy violations" },
    { name: "Prior Law Enforcement", description: "LE work history, complaints, use of force, and integrity violations" },
    { name: "General Disclosures & Eligibility", description: "Citizenship, visible tattoos, sworn statements, and final disclosures" }
  ];

  const getCategoryQuestions = (categoryName) => {
    return allQuestions.filter(q => q.category === categoryName);
  };

  const toggleCategory = (index) => {
    setExpandedCategory(expandedCategory === index ? null : index);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            162-Question Master Bank
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2">
            Every question, organized by investigative domain. Click any section to see all questions.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-200px)] px-6">
          <div className="space-y-3 py-6">
            {isLoading ? (
              <div className="text-center py-12 text-slate-400">
                Loading questions...
              </div>
            ) : (
              categories.map((category, idx) => {
                const categoryQuestions = getCategoryQuestions(category.name);
                const questionCount = categoryQuestions.length;

                return (
                  <div 
                    key={idx}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden hover:border-blue-500/50 transition-colors"
                  >
                    <button
                      onClick={() => toggleCategory(idx)}
                      className="w-full p-4 text-left flex items-center justify-between gap-4 hover:bg-slate-800/70 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white text-base">{category.name}</h3>
                          <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/30 whitespace-nowrap text-xs">
                            {questionCount} {questionCount === 1 ? 'question' : 'questions'}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400">
                          {category.description}
                        </p>
                      </div>
                      <ChevronRight 
                        className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${
                          expandedCategory === idx ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {expandedCategory === idx && (
                      <div className="px-4 pb-4 border-t border-slate-700/50">
                        <div className="pt-3">
                          <p className="text-xs font-semibold text-blue-400 mb-3">All Questions in this Category:</p>
                          <ScrollArea className="max-h-64">
                            <div className="space-y-2 pr-4">
                              {categoryQuestions.map((question, qIdx) => (
                                <div key={qIdx} className="flex items-start gap-2 text-sm">
                                  <span className="text-blue-400 flex-shrink-0 font-mono text-xs mt-0.5">
                                    {question.question_id}
                                  </span>
                                  <span className="text-slate-300">{question.question_text}</span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="p-6 pt-0 border-t border-slate-700 mt-4">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> AI asks one question at a time conversationally. Applicants cannot skip ahead or see what's coming. Every answer is recorded with timestamps.
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
      trigger: "Any 'Yes' to Q096-Q113 drug questions",
      collects: "Substance name, frequency, dates (first/last use), context, how obtained, who with, accountability, changes since"
    },
    {
      name: "Criminal Charges & Arrests",
      trigger: "Any 'Yes' to arrest/charge questions",
      collects: "Date, location, charge description, legal outcome, penalties, property damage, injuries, accountability, current status"
    },
    {
      name: "Driving Incidents",
      trigger: "'Yes' to DUI, suspensions, or major violations",
      collects: "Date, location, BAC (if DUI), outcome, penalties, license impact, insurance impact, circumstances"
    },
    {
      name: "Employment Terminations",
      trigger: "'Yes' to being fired or forced to resign",
      collects: "Employer, dates, reason for termination, circumstances, disciplinary history, accountability, references"
    },
    {
      name: "Financial Issues",
      trigger: "'Yes' to bankruptcy, foreclosure, major debt",
      collects: "Type of issue, date, amount, resolution status, current financial standing, plan to address"
    },
    {
      name: "Sexual Misconduct",
      trigger: "'Yes' to prostitution, harassment, assault questions",
      collects: "Date, nature of incident, legal consequences, accountability, counseling/treatment, changes made"
    },
    {
      name: "Weapons Violations",
      trigger: "'Yes' to illegal weapon possession or use",
      collects: "Date, type of weapon, circumstances, legal outcome, current weapon access, accountability"
    },
    {
      name: "Gang Affiliation",
      trigger: "'Yes' to gang membership or association",
      collects: "Gang name, dates of involvement, level of participation, criminal activity, why left, current contact"
    },
    {
      name: "Military Discipline",
      trigger: "'Yes' to courts-martial, Article 15s, or discharges",
      collects: "Type of discipline, date, circumstances, outcome, impact on discharge, accountability"
    },
    {
      name: "Law Enforcement Discipline",
      trigger: "'Yes' to LE complaints, suspensions, or integrity issues",
      collects: "Department, date, nature of complaint, investigation outcome, discipline received, lessons learned"
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-400" />
            Automated Follow-Up Packs
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2">
            Every "Yes" answer triggers a structured deep-dive. No detail missed, no investigator guesswork.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-200px)] px-6">
          <div className="space-y-4 py-6">
            {followupPacks.map((pack, idx) => (
              <div 
                key={idx}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-orange-500/50 transition-colors"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-orange-600/20 border-2 border-orange-500/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-orange-400">{idx + 1}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white text-base mb-1">{pack.name}</h3>
                    <p className="text-xs text-orange-300 mb-2">
                      <strong>Triggered by:</strong> {pack.trigger}
                    </p>
                    <p className="text-sm text-slate-300">
                      <strong>Data collected:</strong> {pack.collects}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-6 pt-0 border-t border-slate-700 mt-4">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> ClearQuest handles the entire follow-up interview automatically. You receive structured, consistent documentation for every incident — ready for analysis.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <FileText className="w-6 h-6 text-green-400" />
            AI-Generated Summary Report
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2">
            Everything you need for review, decision-making, and departmental submission.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-200px)] px-6">
          <div className="space-y-6 py-6">
            {/* Page 1 - Executive Summary */}
            <div className="bg-white text-slate-900 rounded-lg p-8 border-4 border-slate-700 shadow-2xl">
              <div className="border-b-2 border-slate-900 pb-4 mb-6">
                <h2 className="text-2xl font-bold">APPLICANT BACKGROUND INTERVIEW SUMMARY</h2>
                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div><strong>Session Code:</strong> PD-2024-A1234</div>
                  <div><strong>Date:</strong> Nov 8, 2025</div>
                  <div><strong>Questions Answered:</strong> 162/162</div>
                  <div><strong>Risk Level:</strong> <span className="font-bold text-orange-600">MODERATE</span></div>
                </div>
              </div>

              <div className="space-y-5 text-sm">
                <div>
                  <h3 className="font-bold text-lg mb-3 text-slate-900">EXECUTIVE SUMMARY</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Applicant completed full 162-question interview. Disclosed prior marijuana use (2016-2018, college period), 
                    DUI (2019), and voluntary resignation from retail position (2020). No current criminal charges, gang affiliation, 
                    financial issues, or law enforcement employment history. Follow-up responses demonstrate accountability, 
                    lifestyle changes, and candor. Recommend proceeding to next phase with investigator review of drug use timeline 
                    and circumstances.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-lg mb-3 text-slate-900">KEY DISCLOSURES</h3>
                  <div className="bg-slate-100 rounded p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <span className="text-red-600 font-bold text-lg">•</span>
                      <div>
                        <p className="font-semibold text-slate-900">Drug Use - Marijuana (Q096)</p>
                        <p className="text-slate-700">Used 15-20 times during college (2016-2018), social settings only. Last use May 2018. 
                        No other controlled substances. Full follow-up completed.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-orange-500 font-bold text-lg">•</span>
                      <div>
                        <p className="font-semibold text-slate-900">DUI (Q025) - 2019</p>
                        <p className="text-slate-700">BAC 0.09, completed court-ordered classes, license suspended 90 days. 
                        No repeat incidents. Demonstrates accountability.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold text-lg">•</span>
                      <div>
                        <p className="font-semibold text-slate-900">Employment (Q142) - Voluntary Resignation</p>
                        <p className="text-slate-700">Resigned from Target (2020) due to attendance issues. No policy violations, 
                        theft, or misconduct. Left on good terms.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-lg mb-3 text-slate-900">FOLLOW-UP PACKS TRIGGERED (3)</h3>
                  <div className="bg-blue-50 rounded p-4 space-y-2 text-xs">
                    <p><strong>1. Drug Use / Controlled Substances:</strong> Marijuana - 15-20 instances, 2016-2018</p>
                    <p><strong>2. Driving Incidents:</strong> DUI - Single occurrence, 2019, completed remediation</p>
                    <p><strong>3. Employment Terminations:</strong> Voluntary resignation, attendance-related, 2020</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-lg mb-3 text-slate-900">INVESTIGATOR RECOMMENDATIONS</h3>
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
                    <p className="text-slate-700 text-sm leading-relaxed">
                      <strong>✓ Verify Timeline:</strong> Confirm last marijuana use date (May 2018) through questioning<br/>
                      <strong>✓ Review Context:</strong> Social use in college dormitory setting - assess frequency accuracy<br/>
                      <strong>✓ Accountability Check:</strong> Applicant demonstrates self-awareness in follow-up responses<br/>
                      <strong>✓ Red Flags:</strong> None identified<br/>
                      <strong>✓ Recommendation:</strong> <span className="font-bold text-green-700">PROCEED TO BACKGROUND CHECK PHASE</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-300 text-xs text-slate-500 text-center">
                Page 1 of 3 • Complete transcript follows
              </div>
            </div>

            {/* Page 2 - Question Responses */}
            <div className="bg-white text-slate-900 rounded-lg p-8 border-4 border-slate-700 shadow-2xl">
              <div className="border-b-2 border-slate-900 pb-4 mb-6">
                <h2 className="text-xl font-bold">INTERVIEW TRANSCRIPT - QUESTION RESPONSES</h2>
                <p className="text-sm text-slate-600 mt-2">Session: PD-2024-A1234 • All responses timestamped</p>
              </div>

              <div className="space-y-6">
                {/* Question 1 */}
                <div className="border-b border-slate-200 pb-4">
                  <div className="flex items-start gap-3 mb-2">
                    <span className="font-bold text-blue-600">Q001</span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">Have you ever applied to any other law enforcement agency?</p>
                      <p className="text-xs text-slate-500 mt-1">Category: Applications with Other LE Agencies • 11/08/2025 10:23 AM</p>
                    </div>
                  </div>
                  <div className="ml-12 bg-slate-50 rounded p-3">
                    <span className="font-semibold text-slate-700">Response:</span> <span className="text-slate-900">No</span>
                  </div>
                </div>

                {/* Question 2 */}
                <div className="border-b border-slate-200 pb-4">
                  <div className="flex items-start gap-3 mb-2">
                    <span className="font-bold text-blue-600">Q004</span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">Is there anything else regarding your applications to other law enforcement agencies that you would like to disclose?</p>
                      <p className="text-xs text-slate-500 mt-1">Category: Applications with Other LE Agencies • 11/08/2025 10:23 AM</p>
                    </div>
                  </div>
                  <div className="ml-12 bg-slate-50 rounded p-3">
                    <span className="font-semibold text-slate-700">Response:</span> <span className="text-slate-900">No</span>
                  </div>
                </div>

                {/* Question 3 */}
                <div className="border-b border-slate-200 pb-4">
                  <div className="flex items-start gap-3 mb-2">
                    <span className="font-bold text-blue-600">Q005</span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">Do you have a valid driver's license?</p>
                      <p className="text-xs text-slate-500 mt-1">Category: Driving Record • 11/08/2025 10:24 AM</p>
                    </div>
                  </div>
                  <div className="ml-12 bg-slate-50 rounded p-3">
                    <span className="font-semibold text-slate-700">Response:</span> <span className="text-slate-900">Yes</span>
                  </div>
                </div>

                {/* Question with Follow-up - Drug Use */}
                <div className="bg-orange-50 border-l-4 border-orange-500 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="font-bold text-blue-600">Q096</span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">Have you ever used marijuana or cannabis?</p>
                      <p className="text-xs text-slate-500 mt-1">Category: Illegal Drug / Narcotic History • 11/08/2025 10:42 AM</p>
                    </div>
                  </div>
                  <div className="ml-12 mb-4 bg-white rounded p-3 border border-orange-200">
                    <span className="font-semibold text-slate-700">Response:</span> <span className="text-orange-700 font-bold">Yes</span>
                    <span className="ml-3 text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">FOLLOW-UP TRIGGERED</span>
                  </div>

                  <div className="ml-12 space-y-3">
                    <p className="text-sm font-semibold text-orange-700 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Follow-Up Pack: Drug Use / Controlled Substances
                    </p>
                    
                    <div className="bg-white rounded-lg p-4 border border-orange-200 space-y-3 text-sm">
                      <div className="bg-slate-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">AI Interviewer:</p>
                        <p className="text-slate-700">Thank you for your honesty. I need to gather some additional details about your marijuana use. Let's start with the substance itself - can you tell me the specific name or form of marijuana you used? For example, was it cannabis flower, edibles, concentrates, or something else?</p>
                      </div>

                      <div className="bg-blue-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">Applicant:</p>
                        <p className="text-slate-700">It was marijuana flower, regular cannabis.</p>
                      </div>

                      <div className="bg-slate-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">AI Interviewer:</p>
                        <p className="text-slate-700">Thank you. Now, can you tell me approximately how many times you used marijuana? I understand it may be difficult to recall exactly, but please provide your best estimate.</p>
                      </div>

                      <div className="bg-blue-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">Applicant:</p>
                        <p className="text-slate-700">I'd say between 15 to 20 times total, maybe a bit more. It wasn't a regular thing.</p>
                      </div>

                      <div className="bg-slate-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">AI Interviewer:</p>
                        <p className="text-slate-700">I appreciate your candor. Can you tell me when you first used marijuana? Please provide the month and year if possible.</p>
                      </div>

                      <div className="bg-blue-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">Applicant:</p>
                        <p className="text-slate-700">It was in September 2016, at the start of my sophomore year in college.</p>
                      </div>

                      <div className="bg-slate-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">AI Interviewer:</p>
                        <p className="text-slate-700">And when was the last time you used marijuana? Again, month and year if you can recall.</p>
                      </div>

                      <div className="bg-blue-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">Applicant:</p>
                        <p className="text-slate-700">May 2018. That was right before I graduated. I haven't touched it since.</p>
                      </div>

                      <div className="bg-slate-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">AI Interviewer:</p>
                        <p className="text-slate-700">Can you describe the circumstances in which you typically used marijuana? Where were you, who were you with, and what was the context?</p>
                      </div>

                      <div className="bg-blue-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">Applicant:</p>
                        <p className="text-slate-700">It was always in social settings on campus. Usually in my dorm room or at friends' apartments with a few people from my dorm floor. Just college social stuff, nothing organized or regular. It would happen maybe at parties or weekend hangouts.</p>
                      </div>

                      <div className="bg-slate-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">AI Interviewer:</p>
                        <p className="text-slate-700">How did you obtain the marijuana? Did you purchase it, or was it provided by someone else?</p>
                      </div>

                      <div className="bg-blue-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">Applicant:</p>
                        <p className="text-slate-700">Someone else always had it. I never bought it myself or dealt with purchasing it. It was just offered in social situations and I participated a few times.</p>
                      </div>

                      <div className="bg-slate-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">AI Interviewer:</p>
                        <p className="text-slate-700">This is an important question for accountability - how do you reflect on your marijuana use now? What would you say about those decisions and what has changed since then?</p>
                      </div>

                      <div className="bg-blue-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">Applicant:</p>
                        <p className="text-slate-700">Looking back, it was poor judgment. I was young and made decisions influenced by my social circle at the time. Since graduating and starting my career, I've completely changed my lifestyle and the people I associate with. I understand the seriousness of law enforcement work and the standards required. I haven't used any substances since 2018 and have no intention of ever doing so again. I take full responsibility for those past choices.</p>
                      </div>

                      <div className="bg-slate-50 rounded p-3 space-y-2">
                        <p className="font-semibold text-slate-900">AI Interviewer:</p>
                        <p className="text-slate-700">Thank you for your thorough and honest responses. That completes the follow-up questions about marijuana use. The information you've provided has been documented. We'll now continue with the standard interview questions.</p>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 bg-slate-100 rounded p-2">
                      <strong>Follow-up Completed:</strong> 11/08/2025 10:48 AM • Duration: 6 minutes • 8 exchanges documented
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 italic text-center pt-4">
                  Transcript continues with remaining 158 questions...
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-300 text-xs text-slate-500 text-center">
                Page 2 of 3 • Continued on next page
              </div>
            </div>

            {/* Page 3 - Report Features */}
            <div className="bg-white text-slate-900 rounded-lg p-8 border-4 border-slate-700 shadow-2xl">
              <div className="border-b-2 border-slate-900 pb-4 mb-6">
                <h2 className="text-xl font-bold">REPORT FEATURES & DATA INTEGRITY</h2>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900 text-lg">What Every Report Includes:</h3>
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">AI Executive Summary</p>
                      <p className="text-slate-600">Risk assessment, key disclosures, investigator recommendations</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">Complete Q&A Transcript</p>
                      <p className="text-slate-600">All 162 questions with timestamps and categories</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">Follow-Up Transcripts</p>
                      <p className="text-slate-600">Full AI-applicant conversation for every triggered pack</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">Color-Coded Highlights</p>
                      <p className="text-slate-600">Red/orange/blue flags for quick scanning</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">Investigator Review Sections</p>
                      <p className="text-slate-600">Verification checklists and recommendation notes</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">One-Click PDF Export</p>
                      <p className="text-slate-600">Ready for submission or case file inclusion</p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mt-6">
                  <p className="text-sm text-slate-700 leading-relaxed">
                    <strong>Investigator Note:</strong> Reports are generated instantly at interview completion. All timestamps are UTC-synchronized. 
                    Session hash (SHA-256) included for audit trail verification. Data encrypted at rest and in transit per CJIS standards.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-300 text-xs text-slate-500 text-center">
                Page 3 of 3 • End of Report Preview
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 pt-0 border-t border-slate-700 mt-4">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> This is a simulated example. Actual reports contain complete 162-question transcripts and all triggered follow-up conversations.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
