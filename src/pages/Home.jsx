import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Shield, MessageSquare, FileCheck, Lock, Clock, CheckCircle, ChevronRight, FileText, AlertTriangle, Mail, Star, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import InfoRequestModal from "../components/InfoRequestModal";
import AnimatedSection from "../components/home/AnimatedSection";
import AnimatedHeading from "../components/home/AnimatedHeading";
import AnimatedCard from "../components/home/AnimatedCard";
import AnimatedStatCard from "../components/home/AnimatedStatCard";

export default function Home() {
  const [questionsDialogOpen, setQuestionsDialogOpen] = useState(false);
  const [followupsDialogOpen, setFollowupsDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [infoRequestOpen, setInfoRequestOpen] = useState(false);
  
  const [totalQuestions, setTotalQuestions] = useState(162);

  useEffect(() => {
    loadQuestionCount();
  }, []);

  const loadQuestionCount = async () => {
    try {
      const questions = await base44.entities.Question.filter({ active: true });
      setTotalQuestions(questions.length);
    } catch (err) {
      console.error("Error loading question count:", err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690e1cd45172f1b62aa6dbb0/06ef5407d_image.png')] bg-cover bg-center opacity-10" />
        
        {/* Top Header with Pill Buttons */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
          <div className="flex justify-center sm:justify-end">
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
              <Link to={createPageUrl("StartInterview")}>
                <button className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-white/85 border border-white/25 rounded-full bg-white/[0.06] hover:text-white hover:border-white/40 hover:bg-white/[0.12] transition-all whitespace-nowrap min-h-[44px] flex items-center">
                  Start New Interview
                </button>
              </Link>
              <Link to={createPageUrl("AdminLogin")}>
                <button className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-white/85 border border-white/25 rounded-full bg-white/[0.06] hover:text-white hover:border-white/40 hover:bg-white/[0.12] transition-all whitespace-nowrap min-h-[44px] flex items-center">
                  Admin Portal
                </button>
              </Link>
            </div>
          </div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-24">
          <div className="text-center space-y-6 sm:space-y-8">
            <div className="flex justify-center mb-6 sm:mb-8">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-50 animate-pulse" />
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690e1cd45172f1b62aa6dbb0/271f2b6c5_IMG_2762.PNG" 
                  alt="ClearQuest" 
                  className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                />
              </div>
            </div>
            
            <div className="space-y-4 sm:space-y-5">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight px-4">
                ClearQuest
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed px-4">
                CJIS-Aware Background Interview System for Law Enforcement Applicant Screening
              </p>
              <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto px-4">
                Powered by the C.L.E.A.R. Workflow — Connect · Learn · Evaluate · Assist · Ready
              </p>
              <p className="text-sm sm:text-base text-blue-300/80 max-w-2xl mx-auto px-4">
                A modern, consistent, and defensible way to conduct applicant interviews.
              </p>
            </div>

            {/* More Info CTA */}
            <div className="mt-10 sm:mt-14 pt-8 sm:pt-10 border-t border-slate-700/50 px-4">
              <p className="text-sm sm:text-base text-slate-300 mb-4 sm:mb-5">
                Interested in ClearQuest for your department?
              </p>
              <Button 
                size="lg" 
                variant="outline" 
                onClick={() => setInfoRequestOpen(true)}
                className="bg-transparent border-blue-500 text-blue-400 hover:text-white hover:bg-blue-950/30 px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base min-h-[48px] w-full sm:w-auto"
              >
                <Mail className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Talk to Our Team
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <AnimatedSection 
        className="py-16 sm:py-20 md:py-24"
        bgStyle="subtle1"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6">
            <AnimatedCard delay={0}>
              <FeatureCard
                icon={<Lock className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
                title="CJIS-Compliant Security"
                description="AES-256 encryption, optional 7-day retention, and anonymous-by-design workflow."
                detailedDescription="AES-256 encryption, optional 7-day retention, and an anonymous-by-design workflow that keeps PII out of the system."
                color="blue"
              />
            </AnimatedCard>
            <AnimatedCard delay={50}>
              <FeatureCard
                icon={<MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
                title="Built for Investigators"
                description="Structured interview process investigators control — reducing busywork."
                detailedDescription="ClearQuest provides a structured interview process investigators control — reducing busywork and supporting professional judgment."
                color="purple"
              />
            </AnimatedCard>
            <AnimatedCard delay={100}>
              <FeatureCard
                icon={<FileCheck className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
                title={`${totalQuestions}-Question Master Bank`}
                description="Comprehensive coverage of employment, criminal history, finances, and disclosures."
                detailedDescription="Comprehensive coverage of employment, criminal history, finances, and personal disclosures — consistently captured every time."
                color="green"
              />
            </AnimatedCard>
            <AnimatedCard delay={150}>
              <FeatureCard
                icon={<Clock className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
                title="Time-Saving Workflow"
                description="Cuts repetitive questioning so investigators can focus on credibility."
                detailedDescription="Cuts repetitive questioning and manual note-taking so investigators can focus on assessing credibility and character."
                color="orange"
              />
            </AnimatedCard>
            <AnimatedCard delay={200}>
              <FeatureCard
                icon={<CheckCircle className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
                title="Automated Follow-Ups"
                description='Every "Yes" triggers structured follow-ups for complete disclosures.'
                detailedDescription='Every "Yes" answer triggers structured follow-ups to ensure complete and consistent applicant disclosures.'
                color="indigo"
              />
            </AnimatedCard>
            <AnimatedCard delay={250}>
              <FeatureCard
                icon={<Shield className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />}
                title="Ready-to-Submit Reports"
                description="Clean summaries with transcripts and follow-up details — ready for review."
                detailedDescription="Instantly generate clean summaries with transcripts and follow-up details — ready for review or filing."
                color="red"
              />
            </AnimatedCard>
          </div>
        </div>
      </AnimatedSection>

      {/* Why Agencies Choose ClearQuest */}
      <AnimatedSection 
        className="py-16 sm:py-20 md:py-24"
        bgStyle="subtle2"
        transitionLine="Designed to support investigators, supervisors, and support staff across your agency."
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-14">
            <AnimatedHeading className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
              Why Agencies Choose ClearQuest
            </AnimatedHeading>
            <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
              Built for the people who use it every day — investigators, supervisors, and support staff.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            <AnimatedCard delay={0}>
              <PersonaCard
                icon={<FileCheck className="w-6 h-6 sm:w-7 sm:h-7" />}
                title="For Background Investigators"
                subheadline="Reduce interview time and capture more complete details."
                body="ClearQuest standardizes your interviews so you spend less time repeating questions and more time evaluating an applicant's truthfulness and credibility."
                color="blue"
              />
            </AnimatedCard>
            <AnimatedCard delay={100}>
              <PersonaCard
                icon={<Star className="w-6 h-6 sm:w-7 sm:h-7" />}
                title="For Command Staff"
                subheadline="Consistent and defensible screening."
                body="Every applicant goes through the same structured process, reducing risk and increasing fairness across all interviews."
                color="purple"
              />
            </AnimatedCard>
            <AnimatedCard delay={200}>
              <PersonaCard
                icon={<Building2 className="w-6 h-6 sm:w-7 sm:h-7" />}
                title="For Support Staff"
                subheadline="Clean documentation and easy reviews."
                body="ClearQuest keeps PII out of the system while providing organized, easy-to-follow interview summaries for internal use."
                color="green"
              />
            </AnimatedCard>
          </div>
        </div>
      </AnimatedSection>

      {/* Built to Support Investigator Judgment */}
      <AnimatedSection 
        className="py-14 sm:py-18 md:py-20"
        bgStyle="subtle1"
        transitionLine="ClearQuest organizes the interview, while investigators keep full control over every decision."
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <AnimatedHeading className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-5 sm:mb-6">
            Built to Support Investigator Judgment — Not Replace It
          </AnimatedHeading>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-3xl mx-auto">
            ClearQuest structures the interview, but the investigator remains in full control. The system never makes hiring decisions — it simply helps ensure clarity, consistency, and completeness during the applicant's disclosure process.
          </p>
        </div>
      </AnimatedSection>

      {/* For Your Agency Team */}
      <AnimatedSection 
        className="py-14 sm:py-18 md:py-20"
        bgStyle="subtle2"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedHeading className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center mb-8 sm:mb-10">
            For Your Agency Team
          </AnimatedHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm sm:text-base">
            {[
              { role: "Investigators", benefit: "Faster, consistent interviews" },
              { role: "Supervisors", benefit: "Clearer, more reliable documentation" },
              { role: "HR / Admin", benefit: "Easier review and file organization" },
              { role: "Training Staff", benefit: "Clean transcripts for onboarding" },
              { role: "Polygraphers", benefit: "More consistent pre-polygraph statements" },
              { role: "Applicants", benefit: "Clearer expectations & easier disclosures" }
            ].map((item, idx) => (
              <AnimatedCard key={idx} delay={idx * 50} hoverLift={false}>
                <div className="flex items-start gap-3 py-2">
                  <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                  <span className="text-slate-300">
                    <strong className="text-white">{item.role}:</strong> {item.benefit}
                  </span>
                </div>
              </AnimatedCard>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* Stats Section */}
      <AnimatedSection 
        className="py-14 sm:py-18 md:py-20 border-y border-slate-700"
        bgStyle="dark"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 md:gap-10 text-center">
            <AnimatedStatCard number={totalQuestions} label="Interview Questions" />
            <AnimatedStatCard number={10} label="Follow-Up Packs" />
            <AnimatedStatCard number="256-bit" label="AES Encryption" />
            <AnimatedStatCard number="CJIS" label="Aware Framework" />
          </div>
        </div>
      </AnimatedSection>

      {/* Early Access Strip */}
      <AnimatedSection 
        className="py-14 sm:py-18 md:py-20 border-y border-blue-500/20"
        bgStyle="accent"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <AnimatedHeading as="h3" className="text-lg sm:text-xl md:text-2xl font-semibold text-white mb-3">
            Now Onboarding Arizona Agencies
          </AnimatedHeading>
          <p className="text-slate-400 text-sm sm:text-base mb-6 sm:mb-8 max-w-2xl mx-auto">
            ClearQuest is live and in use. We're opening a limited number of early-access spots for agencies ready to modernize their applicant screening.
          </p>
          <Button 
            onClick={() => setInfoRequestOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 sm:px-8 py-3 sm:py-4 min-h-[48px] w-full sm:w-auto text-sm sm:text-base"
          >
            Request Early Access
          </Button>
        </div>
      </AnimatedSection>

      {/* How It Works */}
      <AnimatedSection 
        className="py-16 sm:py-20 md:py-24"
        bgStyle="subtle1"
        transitionLine="Here's what the applicant experience looks like from start to finish."
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedHeading className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center mb-10 sm:mb-14 px-4">
            How It Works
          </AnimatedHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <AnimatedCard delay={0}>
              <StepCard 
                number="1" 
                title="Structured Screening Starts Here" 
                description="ClearQuest standardizes the first step of your hiring process, ensuring every applicant begins with the same consistent, defensible interview."
              />
            </AnimatedCard>
            <AnimatedCard delay={100}>
              <StepCard 
                number="2" 
                title="Answer Questions" 
                description="Conversational AI guides the applicant one question at a time, collecting clear and consistent responses without investigator involvement."
                link="See the Questions"
                onClick={() => setQuestionsDialogOpen(true)}
              />
            </AnimatedCard>
            <AnimatedCard delay={200}>
              <StepCard 
                number="3" 
                title="Follow-Ups" 
                description="Every 'Yes' automatically triggers structured follow-up questions, ensuring no detail is missed and every incident is documented the same way."
                link="View Follow-Up Packs"
                onClick={() => setFollowupsDialogOpen(true)}
              />
            </AnimatedCard>
            <AnimatedCard delay={300}>
              <StepCard 
                number="4" 
                title="Generate Report" 
                description="ClearQuest produces a complete, investigator-ready summary with transcripts, follow-ups, risk notes, and verification sections in one standardized report."
                link="See Report Example"
                onClick={() => setReportDialogOpen(true)}
              />
            </AnimatedCard>
          </div>
        </div>
      </AnimatedSection>

      {/* Security & Compliance Strip */}
      <AnimatedSection 
        className="py-10 sm:py-14 md:py-16 border-t border-slate-700/50"
        bgStyle="subtle2"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <AnimatedHeading as="h3" className="text-base sm:text-xl md:text-2xl font-semibold text-white mb-4 sm:mb-6">
            Security & Compliance You Can Trust
          </AnimatedHeading>
          <div className="flex flex-wrap justify-center gap-x-4 sm:gap-x-6 gap-y-2 text-xs sm:text-sm md:text-base text-slate-300">
            <span>AES-256 encryption</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span>Anonymous-by-design</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span>7-day retention</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span>No PII stored</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span>CJIS-aware</span>
          </div>
        </div>
      </AnimatedSection>

      {/* Footer */}
      <div className="border-t border-slate-700/50 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-slate-500 text-xs sm:text-sm">
            © 2025 ClearQuest™ • CJIS Compliant • All Rights Reserved
          </p>
        </div>
      </div>

      {/* Dialogs */}
      <SessionDialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen} />
      <QuestionsDialog open={questionsDialogOpen} onOpenChange={setQuestionsDialogOpen} totalQuestions={totalQuestions} />
      <FollowupsDialog open={followupsDialogOpen} onOpenChange={setFollowupsDialogOpen} />
      <ReportDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen} totalQuestions={totalQuestions} />
      <InfoRequestModal open={infoRequestOpen} onOpenChange={setInfoRequestOpen} />
    </div>
  );
}

function FeatureCard({ icon, title, description, detailedDescription, color }) {
  const [isFlipped, setIsFlipped] = useState(false);

  const colorClasses = {
    blue: "from-blue-500/25 to-blue-600/15 border-blue-400/20 text-blue-400",
    purple: "from-purple-500/25 to-purple-600/15 border-purple-400/20 text-purple-400",
    green: "from-green-500/25 to-green-600/15 border-green-400/20 text-green-400",
    orange: "from-orange-500/25 to-orange-600/15 border-orange-400/20 text-orange-400",
    indigo: "from-indigo-500/25 to-indigo-600/15 border-indigo-400/20 text-indigo-400",
    red: "from-red-500/25 to-red-600/15 border-red-400/20 text-red-400"
  };

  return (
    <div 
      className="relative h-[220px] sm:h-[250px] md:h-[270px] cursor-pointer group"
      style={{ perspective: "1000px" }}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className="relative w-full h-full transition-all duration-200 ease-in-out md:group-hover:-translate-y-1"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
        }}
      >
        {/* Front Side */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4 sm:p-5 md:p-6 shadow-lg shadow-black/20 md:group-hover:shadow-xl md:group-hover:shadow-black/30 transition-shadow duration-200`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden"
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl" />
          <div className="relative flex flex-col h-full">
            <div className={`${colorClasses[color].split(' ')[3]} opacity-90 md:group-hover:opacity-100 md:group-hover:brightness-110 transition-all duration-200 mb-3`}>{icon}</div>
            <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white leading-tight mb-2 md:group-hover:brightness-110 transition-all duration-200">{title}</h3>
            <div className="flex-1 min-h-[60px] sm:min-h-[70px]">
              <p className="text-slate-300 text-sm leading-relaxed">{description}</p>
            </div>
            <div className="flex items-center gap-1 text-xs sm:text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors mt-auto pt-2">
              <span>More</span>
              <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </div>

        {/* Back Side */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4 sm:p-5 md:p-6 shadow-lg shadow-black/20`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)"
          }}
        >
          <div className="relative flex flex-col h-full">
            <div className={`${colorClasses[color].split(' ')[3]} opacity-90 mb-3`}>{icon}</div>
            <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white leading-tight mb-2">{title}</h3>
            <div className="flex-1 min-h-[60px] sm:min-h-[70px]">
              <p className="text-slate-300 text-sm leading-relaxed">{detailedDescription}</p>
            </div>
            <div className="flex items-center gap-1 text-xs sm:text-sm font-medium text-blue-300 group-hover:text-blue-200 transition-colors mt-auto pt-2">
              <span className="transform group-hover:-translate-x-1 transition-transform">←</span>
              <span>Back</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonaCard({ icon, title, subheadline, body, color }) {
  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400",
    green: "from-green-500/20 to-green-600/10 border-green-500/30 text-green-400"
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-5 sm:p-6 h-full min-h-[220px] flex flex-col`}>
      <div className="space-y-3 sm:space-y-4 flex flex-col flex-1">
        <div className={colorClasses[color].split(' ')[3]}>{icon}</div>
        <h3 className="text-lg sm:text-xl font-semibold text-white">{title}</h3>
        <p className={`text-sm font-medium ${colorClasses[color].split(' ')[3]}`}>{subheadline}</p>
        <p className="text-slate-300 text-sm leading-relaxed flex-1">{body}</p>
      </div>
    </div>
  );
}

function StepCard({ number, title, description, link, onClick }) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-5 sm:p-6 space-y-4 hover:border-blue-500/50 transition-all h-full flex flex-col min-h-[240px]">
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
        <span className="text-xl sm:text-2xl font-bold text-blue-400">{number}</span>
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-white">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed flex-1">{description}</p>
      {link && onClick && (
        <button
          onClick={onClick}
          className="flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors group mt-auto"
        >
          <span>{link}</span>
          <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
        </button>
      )}
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

            <Link to={createPageUrl("StartInterview")} className="block">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-sm sm:text-base">
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
  const staticSampleQuestions = [
    {
      sectionName: "Applications with Other Law Enforcement Agencies",
      description: "Questions about prior law enforcement applications and outcomes",
      questions: [
        "Have you ever applied with any other law enforcement agency?",
        "Have you purposely withheld any information about prior applications with other law enforcement agencies?",
        "Have you ever been disqualified by another law enforcement agency during their selection process?"
      ]
    },
    {
      sectionName: "Driving Record",
      description: "Questions about driving history and incidents",
      questions: [
        "As a driver, have you ever been involved in a traffic collision?",
        "Have you ever been involved in a collision involving alcohol?",
        "Have you ever been involved in any unreported collisions?"
      ]
    },
    {
      sectionName: "Criminal Involvement / Police Contacts",
      description: "Questions about criminal history and law enforcement interactions",
      questions: [
        "Have you ever been arrested for any reason?",
        "Have you ever been charged with a crime, even if the charges were later dismissed?",
        "Have you ever been the subject of a protective or restraining order?"
      ]
    },
    {
      sectionName: "Illegal Drug / Narcotic History",
      description: "Questions about substance use history",
      questions: [
        "Have you ever used marijuana or cannabis products?",
        "Have you ever used any illegal drugs other than marijuana?",
        "Have you ever sold, manufactured, or distributed any illegal drugs?"
      ]
    },
    {
      sectionName: "Alcohol Use",
      description: "Questions about alcohol consumption and related incidents",
      questions: [
        "Have you ever consumed alcohol to the point of intoxication?",
        "Have you ever been told by anyone that you have a drinking problem?",
        "Have you ever attended any alcohol treatment or counseling programs?"
      ]
    },
    {
      sectionName: "Financial History",
      description: "Questions about financial responsibility and issues",
      questions: [
        "Have you ever filed for bankruptcy?",
        "Have you ever had a vehicle repossessed?",
        "Have you ever been more than 90 days late on any debt payment?"
      ]
    },
    {
      sectionName: "Employment History",
      description: "Questions about work history and conduct",
      questions: [
        "Have you ever been fired or terminated from any job?",
        "Have you ever resigned from a job to avoid being fired?",
        "Have you ever been disciplined at work for misconduct?"
      ]
    },
    {
      sectionName: "Military Service",
      description: "Questions about military background and service record",
      questions: [
        "Have you ever served in any branch of the military?",
        "Did you receive any disciplinary action during your military service?",
        "What type of discharge did you receive from military service?"
      ]
    },
    {
      sectionName: "Personal Conduct",
      description: "Questions about personal behavior and integrity",
      questions: [
        "Have you ever been involved in a physical fight as an adult?",
        "Have you ever engaged in any conduct that could be considered domestic violence?",
        "Is there anything in your background that could cause embarrassment to you or the department?"
      ]
    },
    {
      sectionName: "Prior Law Enforcement Experience",
      description: "Questions about previous law enforcement employment",
      questions: [
        "Have you ever worked for a law enforcement agency in any capacity?",
        "Have you ever been the subject of an internal affairs investigation?",
        "Have you ever been accused of using excessive force?"
      ]
    }
  ];

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
          <div className="space-y-3 py-4 sm:py-6">
            {staticSampleQuestions.map((sectionData, idx) => (
              <div 
                key={idx}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
              >
                <h3 className="font-semibold text-white text-sm sm:text-base mb-1">
                  {sectionData.sectionName}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mb-3">
                  {sectionData.description}
                </p>
                
                <div className="space-y-2 mb-3">
                  {sectionData.questions.map((question, qIdx) => (
                    <div key={qIdx} className="flex items-start gap-2 text-xs sm:text-sm">
                      <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                      <span className="text-slate-300">{question}</span>
                    </div>
                  ))}
                </div>
                
                <p className="text-xs text-slate-500 italic">
                  Additional questions are asked during the actual interview. These are sample questions only.
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 sm:p-6 pt-0 border-t border-slate-700 mt-3">
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
    { name: "Drug Use / Controlled Substances", whyMatters: "Helps identify substance-related reliability and judgment concerns.", trigger: "Any admission involving illegal drug use or being under the influence.", documents: "Substance type, use pattern, and impact on decision-making." },
    { name: "Criminal Charges & Arrests", whyMatters: "Ensures all criminal history is evaluated consistently and defensibly.", trigger: "Responses involving charges, arrests, warrants, or detentions.", documents: "Nature of the incident, outcome, penalties, and accountability." },
    { name: "Driving Incidents", whyMatters: "Driving risk is one of the most common sources of liability in policing.", trigger: "DUIs, suspensions, reckless driving, or major traffic violations.", documents: "Event details, contributing factors, license impact, and outcome." },
    { name: "Employment Terminations", whyMatters: "Past workplace behavior can predict future performance or risk.", trigger: "Job termination, resignation in lieu of termination, or major discipline.", documents: "Employer, circumstances, reason for separation, and accountability." },
    { name: "Financial Issues", whyMatters: "Financial instability can correlate with stress, risk-taking, or vulnerability.", trigger: "Bankruptcy, foreclosure, collections, or major debt issues.", documents: "Issue type, timeline, current standing, and corrective steps." },
    { name: "Sexual Misconduct or Exploitation", whyMatters: "Ensures serious conduct concerns are fully explored and documented.", trigger: "Disclosures involving harassment, assault, exploitation, or related behavior.", documents: "Incident details, consequences, treatment, and accountability." },
    { name: "Weapons Violations", whyMatters: "Weapon misuse is a critical predictor of future officer safety issues.", trigger: "Illegal possession, unsafe discharge, threats, or misuse of firearms.", documents: "Incident facts, weapon type, legal outcome, and contributing factors." },
    { name: "Military Discipline", whyMatters: "Provides insight into conduct history within structured environments.", trigger: "NJPs, Article 15s, reprimands, or administrative separation.", documents: "Offense, outcome, command response, and rehabilitation." },
    { name: "Gang Affiliation", whyMatters: "Ensures transparency and documentation of any high-risk associations.", trigger: "Any disclosure of past or present gang involvement.", documents: "Group type, duration, activity level, and disengagement." },
    { name: "Law Enforcement Discipline / Integrity Issues", whyMatters: "Prior integrity issues are one of the strongest predictors of future misconduct.", trigger: "Dishonesty, excessive force claims, internal affairs cases, or integrity concerns.", documents: "Allegations, findings, outcomes, and any corrective action." }
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
          <div className="space-y-3 py-4 sm:py-6">
            {followupPacks.map((pack, idx) => (
              <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-orange-500/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-orange-600/20 border-2 border-orange-500/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs sm:text-sm font-bold text-orange-400">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm sm:text-base mb-2">{pack.name}</h3>
                    <p className="text-xs sm:text-sm text-orange-300 mb-1.5"><strong>Why it matters:</strong> {pack.whyMatters}</p>
                    <p className="text-xs sm:text-sm text-slate-300 mb-1.5"><strong>When it triggers:</strong> {pack.trigger}</p>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed"><strong>What ClearQuest documents:</strong> {pack.documents}</p>
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

        <div className="p-4 sm:p-6 pt-0 border-t border-slate-700 mt-3">
          <p className="text-xs text-slate-400 text-center">
            <strong>Investigator Note:</strong> This is a simulated example. Actual reports contain complete {totalQuestions}-question transcripts and all triggered follow-up conversations.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}