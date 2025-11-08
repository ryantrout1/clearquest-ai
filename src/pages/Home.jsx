
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
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

export default function Home() {
  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const [followupsDialogOpen, setFollowupsDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690e1cd45172f1b62aa6dbb0/7af242d9a_image.png')] bg-cover bg-center opacity-10" />
        
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
                ClearQuest AI
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
            detailedDescription="ClearQuest AI meets full CJIS standards with encrypted data storage, secure access controls, and automatic data retention to protect investigator integrity."
            color="blue"
          />
          <FeatureCard
            icon={<MessageSquare className="w-8 h-8" />}
            title="Built for Investigators"
            description="You're the expert — ClearQuest AI handles the structure so you can focus on professional judgment and accuracy."
            detailedDescription="Designed around real investigator workflows — you stay in control while ClearQuest AI handles structure, documentation, and follow-up precision."
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
            title="Start Session" 
            description="Create anonymous session with department code and file number"
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
            © 2025 ClearQuest AI™ • CJIS Compliant • All Rights Reserved
          </p>
        </div>
      </div>

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

function QuestionsDialog({ open, onOpenChange }) {
  const categories = [
    {
      name: "Applications with Other LE Agencies",
      count: "4 questions",
      questions: ["Q001-Q004: Prior law enforcement applications, outcomes, and reasons for non-hire"]
    },
    {
      name: "Driving Record",
      count: "17 questions",
      questions: ["Q005-Q021: License status, DUIs, suspensions, accidents, violations, and driving habits"]
    },
    {
      name: "Criminal Involvement / Police Contacts",
      count: "44 questions",
      questions: ["Q022-Q065: Arrests, charges, convictions, warrants, restraining orders, gang affiliation, weapons violations"]
    },
    {
      name: "Extremist Organizations",
      count: "4 questions",
      questions: ["Q066-Q069: Membership or affiliation with hate groups, extremist organizations"]
    },
    {
      name: "Sexual Activities",
      count: "18 questions",
      questions: ["Q070-Q087: Prostitution, pornography, sexual assault, harassment, exploitation"]
    },
    {
      name: "Financial History",
      count: "8 questions",
      questions: ["Q088-Q095: Bankruptcy, foreclosure, repossession, liens, judgments, debt, gambling"]
    },
    {
      name: "Illegal Drug / Narcotic History",
      count: "18 questions",
      questions: ["Q096-Q113: Drug use, sales, manufacturing, prescriptions, including 47-substance checklist"]
    },
    {
      name: "Alcohol History",
      count: "3 questions",
      questions: ["Q114-Q116: Alcohol dependency, treatment, DUIs"]
    },
    {
      name: "Military History",
      count: "8 questions",
      questions: ["Q117-Q124: Service branch, discharge type, courts-martial, discipline"]
    },
    {
      name: "Employment History",
      count: "23 questions",
      questions: ["Q125-Q147: Terminations, resignations, investigations, misconduct, policy violations"]
    },
    {
      name: "Prior Law Enforcement",
      count: "11 questions",
      questions: ["Q148-Q158: LE employment, complaints, discipline, use of force, integrity violations"]
    },
    {
      name: "General Disclosures & Eligibility",
      count: "4 questions",
      questions: ["Q159-Q162: Citizenship, tattoos, statements, additional disclosures"]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            162-Question Master Bank
          </DialogTitle>
          <DialogDescription className="text-slate-300 mt-2">
            Every question, organized by investigative domain. Complete standardization across all applicants.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-200px)] px-6">
          <div className="space-y-4 py-6">
            {categories.map((category, idx) => (
              <div 
                key={idx}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="font-semibold text-white text-base">{category.name}</h3>
                  <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/30 whitespace-nowrap">
                    {category.count}
                  </Badge>
                </div>
                <p className="text-sm text-slate-400">
                  {category.questions[0]}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-6 pt-0 border-t border-slate-700 mt-4">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> AI asks one question at a time conversationally. Applicants cannot skip ahead or see what's coming.
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
            <strong>Investigator Note:</strong> ClearQuest AI handles the entire follow-up interview automatically. You receive structured, consistent documentation for every incident — ready for analysis.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] p-0">
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
            {/* Report Preview */}
            <div className="bg-white text-slate-900 rounded-lg p-6 border-4 border-slate-700 shadow-2xl">
              <div className="border-b-2 border-slate-900 pb-4 mb-4">
                <h2 className="text-xl font-bold">APPLICANT BACKGROUND INTERVIEW SUMMARY</h2>
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div><strong>Session Code:</strong> PD-2024-A1234</div>
                  <div><strong>Date:</strong> Nov 8, 2025</div>
                  <div><strong>Questions Answered:</strong> 162/162</div>
                  <div><strong>Risk Level:</strong> <span className="font-bold text-orange-600">MODERATE</span></div>
                </div>
              </div>

              <div className="space-y-4 text-sm">
                <div>
                  <h3 className="font-bold text-base mb-2 text-slate-900">EXECUTIVE SUMMARY</h3>
                  <p className="text-slate-700 leading-relaxed">
                    Applicant completed full 162-question interview. Disclosed prior DUI (2019), marijuana use (college), and voluntary resignation from retail position (2020). No current criminal charges, gang affiliation, or financial issues. Follow-up responses demonstrate accountability and lifestyle changes. Recommend proceeding to next phase with investigator review of drug use timeline.
                  </p>
                </div>

                <div>
                  <h3 className="font-bold text-base mb-2 text-slate-900">KEY DISCLOSURES</h3>
                  <div className="bg-slate-100 rounded p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-red-600 font-bold">•</span>
                      <span className="text-slate-700"><strong>DUI (2019):</strong> BAC 0.09, completed court-ordered classes, no repeat incidents</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-orange-500 font-bold">•</span>
                      <span className="text-slate-700"><strong>Drug Use:</strong> Marijuana 15-20 times (2016-2018, college), last use May 2018</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold">•</span>
                      <span className="text-slate-700"><strong>Employment:</strong> Resigned from Target (2020) due to attendance issues, no policy violations</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-base mb-2 text-slate-900">FOLLOW-UP RESPONSES (3 PACKS TRIGGERED)</h3>
                  <p className="text-slate-700 text-xs">All follow-ups completed with detailed accountability statements and timeline documentation.</p>
                </div>

                <div>
                  <h3 className="font-bold text-base mb-2 text-slate-900">INVESTIGATOR NOTES</h3>
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3">
                    <p className="text-slate-700 text-xs">
                      <strong>Review Required:</strong> Drug use timeline verification (2016-2018)<br/>
                      <strong>Red Flags:</strong> None<br/>
                      <strong>Recommendation:</strong> Proceed to background check phase
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-base mb-2 text-slate-900">FULL TRANSCRIPT</h3>
                  <p className="text-slate-600 text-xs italic">Complete Q&A transcript attached (pages 2-47)</p>
                </div>
              </div>
            </div>

            {/* Report Features */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-3">What You Get in Every Report:</h3>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Executive summary with risk assessment</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Color-coded disclosure highlights</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Complete follow-up documentation</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Full Q&A transcript with timestamps</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">Investigator review sections</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">One-click PDF export</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 pt-0 border-t border-slate-700 mt-4">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> Reports are generated instantly at interview completion. All data is structured, searchable, and ready for departmental submission or further investigation.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
