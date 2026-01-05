import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import AiSettings from './pages/AiSettings';
import BackfillSummaries from './pages/BackfillSummaries';
import CandidateInterview from './pages/CandidateInterview';
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
import InterviewBridge from './pages/InterviewBridge';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminDashboard": AdminDashboard,
    "AdminLogin": AdminLogin,
    "AiSettings": AiSettings,
    "BackfillSummaries": BackfillSummaries,
    "CandidateInterview": CandidateInterview,
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
    "InterviewBridge": InterviewBridge,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};