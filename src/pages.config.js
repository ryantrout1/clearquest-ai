/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import AiSettings from './pages/AiSettings';
import BackfillSummaries from './pages/BackfillSummaries';
import CandidateInterview from './pages/CandidateInterview';
import CandidateInterviewSession from './pages/CandidateInterviewSession';
import candidateinterviewClean from './pages/CandidateInterview_CLEAN';
import CreateDepartment from './pages/CreateDepartment';
import DepartmentDashboard from './pages/DepartmentDashboard';
import Departments from './pages/Departments';
import EditDepartment from './pages/EditDepartment';
import FactModelAdmin from './pages/FactModelAdmin';
import FollowUpPackAuditV2 from './pages/FollowUpPackAuditV2';
import FollowUpPackManagerV2 from './pages/FollowUpPackManagerV2';
import FollowUpPackQuickAssign from './pages/FollowUpPackQuickAssign';
import FollowupPackManager from './pages/FollowupPackManager';
import Home from './pages/Home';
import HomeHub from './pages/HomeHub';
import Interview from './pages/Interview';
import InterviewBridge from './pages/InterviewBridge';
import InterviewDashboard from './pages/InterviewDashboard';
import InterviewStructureManager from './pages/InterviewStructureManager';
import interviewv2StableDoNotEditAiProbingTranscriptsVerified from './pages/InterviewV2 – STABLE - DO NOT EDIT (AI probing + transcripts verified)';
import InterviewV2 from './pages/InterviewV2';
import ManageDepartmentUsers from './pages/ManageDepartmentUsers';
import QuestionsManager from './pages/QuestionsManager';
import SessionDetails from './pages/SessionDetails';
import StartInterview from './pages/StartInterview';
import StartInterviewTest from './pages/StartInterviewTest';
import SystemAdminDashboard from './pages/SystemAdminDashboard';
import SystemConfiguration from './pages/SystemConfiguration';
import TrialSignup from './pages/TrialSignup';
import startinterviewSentinel from './pages/_STARTINTERVIEW_SENTINEL';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminDashboard": AdminDashboard,
    "AdminLogin": AdminLogin,
    "AiSettings": AiSettings,
    "BackfillSummaries": BackfillSummaries,
    "CandidateInterview": CandidateInterview,
    "CandidateInterviewSession": CandidateInterviewSession,
    "CandidateInterview_CLEAN": candidateinterviewClean,
    "CreateDepartment": CreateDepartment,
    "DepartmentDashboard": DepartmentDashboard,
    "Departments": Departments,
    "EditDepartment": EditDepartment,
    "FactModelAdmin": FactModelAdmin,
    "FollowUpPackAuditV2": FollowUpPackAuditV2,
    "FollowUpPackManagerV2": FollowUpPackManagerV2,
    "FollowUpPackQuickAssign": FollowUpPackQuickAssign,
    "FollowupPackManager": FollowupPackManager,
    "Home": Home,
    "HomeHub": HomeHub,
    "Interview": Interview,
    "InterviewBridge": InterviewBridge,
    "InterviewDashboard": InterviewDashboard,
    "InterviewStructureManager": InterviewStructureManager,
    "InterviewV2 – STABLE - DO NOT EDIT (AI probing + transcripts verified)": interviewv2StableDoNotEditAiProbingTranscriptsVerified,
    "InterviewV2": InterviewV2,
    "ManageDepartmentUsers": ManageDepartmentUsers,
    "QuestionsManager": QuestionsManager,
    "SessionDetails": SessionDetails,
    "StartInterview": StartInterview,
    "StartInterviewTest": StartInterviewTest,
    "SystemAdminDashboard": SystemAdminDashboard,
    "SystemConfiguration": SystemConfiguration,
    "TrialSignup": TrialSignup,
    "_STARTINTERVIEW_SENTINEL": startinterviewSentinel,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};