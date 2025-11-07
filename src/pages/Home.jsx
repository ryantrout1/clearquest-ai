
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Shield, MessageSquare, FileCheck, Lock, Clock, CheckCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1596930742491-b7fbf27c63b3?w=1600')] bg-cover bg-center opacity-10" />
        
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
                  Admin Dashboard
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
            title="CJIS Compliant"
            description="Full encryption (TLS 1.2+, AES-256), anonymous sessions, SHA-256 audit trails, and 7-30 day retention policies."
            color="blue"
          />
          <FeatureCard
            icon={<MessageSquare className="w-8 h-8" />}
            title="Conversational AI"
            description="One question at a time with dynamic follow-up packs. Natural language processing for structured data capture."
            color="purple"
          />
          <FeatureCard
            icon={<FileCheck className="w-8 h-8" />}
            title="162 Questions"
            description="Comprehensive question bank covering employment, criminal history, substance use, financial integrity, and more."
            color="green"
          />
          <FeatureCard
            icon={<Clock className="w-8 h-8" />}
            title="Time Efficient"
            description="Streamlined interview process reduces investigator workload while maintaining thoroughness and accuracy."
            color="orange"
          />
          <FeatureCard
            icon={<CheckCircle className="w-8 h-8" />}
            title="Smart Follow-Ups"
            description="10 standardized follow-up packs with 6-phase playbook: Acknowledge → Facts → Accountability → Pattern → Changes → Summary."
            color="indigo"
          />
          <FeatureCard
            icon={<Shield className="w-8 h-8" />}
            title="Investigator Reports"
            description="Department-branded PDF reports with summaries, transcripts, risk ratings, and secure hash verification."
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
          <StepCard number="1" title="Start Session" description="Create anonymous session with department code and file number" />
          <StepCard number="2" title="Answer Questions" description="Conversational AI asks one question at a time" />
          <StepCard number="3" title="Follow-Ups" description="'Yes' answers trigger structured follow-up packs" />
          <StepCard number="4" title="Generate Report" description="Investigator receives complete PDF summary" />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, color }) {
  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400",
    green: "from-green-500/20 to-green-600/10 border-green-500/30 text-green-400",
    orange: "from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400",
    indigo: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 text-indigo-400",
    red: "from-red-500/20 to-red-600/10 border-red-500/30 text-red-400"
  };

  return (
    <div className={`relative group bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-6 hover:scale-105 transition-transform duration-300`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
      <div className="relative space-y-4">
        <div className={colorClasses[color].split(' ')[3]}>{icon}</div>
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="text-slate-300 text-sm leading-relaxed">{description}</p>
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

function StepCard({ number, title, description }) {
  return (
    <div className="relative">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4 hover:border-blue-500/50 transition-colors">
        <div className="w-12 h-12 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center">
          <span className="text-2xl font-bold text-blue-400">{number}</span>
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-slate-400 text-sm">{description}</p>
      </div>
    </div>
  );
}
