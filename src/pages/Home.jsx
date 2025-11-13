
import React, { useState, useEffect, useMemo } from "react";
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
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  
  // NEW: Dynamic question count loading
  const [totalQuestions, setTotalQuestions] = useState(162); // Default fallback
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
      // Keep default value of 162
    } finally {
      setIsLoadingQuestions(false);
    }
  };

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
            title={`${totalQuestions}-Question Master Bank`}
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

      {/* Stats Section - DYNAMIC QUESTION COUNT */}
      <div className="bg-slate-800/50 backdrop-blur-sm border-y border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <StatCard number={totalQuestions} label="Questions" />
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
      <QuestionsDialog open={questionsDialogOpen} onOpenChange={setQuestionsDialogOpen} totalQuestions={totalQuestions} />
      
      {/* Follow-ups Dialog */}
      <FollowupsDialog open={followupsDialogOpen} onOpenChange={setFollowupsDialogOpen} />
      
      {/* Report Dialog */}
      <ReportDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen} totalQuestions={totalQuestions} />
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

function QuestionsDialog({ open, onOpenChange, totalQuestions }) {
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

  // Category configuration with display labels and descriptions
  const categoryConfig = [
    { name: "Applications with other Law Enforcement Agencies", description: "Prior applications, hiring outcomes, and withdrawal reasons" },
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

  // Group questions by category and compute counts dynamically
  const categoriesWithCounts = useMemo(() => {
    const result = categoryConfig.map(config => {
      const categoryQuestions = allQuestions.filter(q => q.category === config.name);
      return {
        ...config,
        questions: categoryQuestions,
        count: categoryQuestions.length
      };
    });

    // Check for unmapped categories
    const mappedCategories = new Set(categoryConfig.map(c => c.name));
    const unmappedCategories = new Set();
    
    allQuestions.forEach(q => {
      if (q.category && !mappedCategories.has(q.category)) {
        unmappedCategories.add(q.category);
      }
    });

    if (unmappedCategories.size > 0) {
      console.warn('⚠️ Unmapped categories found in Question entity:', Array.from(unmappedCategories));
      
      // Add unmapped categories to the end
      unmappedCategories.forEach(catName => {
        const categoryQuestions = allQuestions.filter(q => q.category === catName);
        result.push({
          name: catName,
          description: "Additional category",
          questions: categoryQuestions,
          count: categoryQuestions.length
        });
      });
    }

    return result;
  }, [allQuestions]);

  const toggleCategory = (index) => {
    setExpandedCategory(expandedCategory === index ? null : index);
  };

  // Helper function to remove leading zeros from question_id (e.g., Q001 -> 1, Q010 -> 10)
  const getQuestionNumber = (questionId) => {
    return questionId.replace(/^Q0*/, '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            {totalQuestions}-Question Master Bank
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
              categoriesWithCounts.map((category, idx) => {
                const questionCount = category.count;

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
                          <div className="max-h-64 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b' }}>
                            <div className="space-y-2">
                              {category.questions.map((question, qIdx) => (
                                <div key={qIdx} className="flex items-start gap-2 text-sm">
                                  <span className="text-blue-400 flex-shrink-0 font-mono text-xs mt-0.5">
                                    {getQuestionNumber(question.question_id)}
                                  </span>
                                  <span className="text-slate-300">{question.question_text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
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

        <div className="px-6 pb-4">
          <p className="text-xs text-slate-400 text-center leading-relaxed">
            ClearQuest AI also provides investigator-grade clarification when additional detail is needed, ensuring every incident is fully documented.
          </p>
        </div>

        <div className="p-6 pt-0 border-t border-slate-700">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> ClearQuest handles the entire follow-up interview automatically. You receive structured, consistent documentation for every incident — ready for analysis.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ open, onOpenChange, totalQuestions }) {
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
          <div className="text-center py-12 text-slate-400">
            <p>Report preview content - keeping existing implementation</p>
          </div>
        </ScrollArea>

        <div className="p-6 pt-0 border-t border-slate-700 mt-4">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> This is a simulated example. Actual reports contain complete {totalQuestions}-question transcripts and all triggered follow-up conversations.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
