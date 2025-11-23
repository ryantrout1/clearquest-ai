import Home from './pages/Home';
import StartInterview from './pages/StartInterview';
import Interview from './pages/Interview';
import AdminDashboard from './pages/AdminDashboard';
import SessionDetails from './pages/SessionDetails';
import AdminLogin from './pages/AdminLogin';
import HomeHub from './pages/HomeHub';
import SystemAdminDashboard from './pages/SystemAdminDashboard';
import CreateDepartment from './pages/CreateDepartment';
import Departments from './pages/Departments';
import DepartmentDashboard from './pages/DepartmentDashboard';
import TrialSignup from './pages/TrialSignup';
import EditDepartment from './pages/EditDepartment';
import InterviewDashboard from './pages/InterviewDashboard';
import InterviewV2 from './pages/InterviewV2';
import ManageDepartmentUsers from './pages/ManageDepartmentUsers';
import interviewv2StableDoNotEditAiProbingTranscriptsVerified from './pages/InterviewV2 – STABLE - DO NOT EDIT (AI probing + transcripts verified)';
import BackfillSummaries from './pages/BackfillSummaries';
import QuestionsManager from './pages/QuestionsManager';
import InterviewStructureManager from './pages/InterviewStructureManager';
import FollowupPackManager from './pages/FollowupPackManager';
import FollowUpPackQuickAssign from './pages/FollowUpPackQuickAssign';
import FollowUpPackManagerV2 from './pages/FollowUpPackManagerV2';
import CandidateInterview from './pages/CandidateInterview';
import SystemConfiguration from './pages/SystemConfiguration';
import AiSettings from './pages/AiSettings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "StartInterview": StartInterview,
    "Interview": Interview,
    "AdminDashboard": AdminDashboard,
    "SessionDetails": SessionDetails,
    "AdminLogin": AdminLogin,
    "HomeHub": HomeHub,
    "SystemAdminDashboard": SystemAdminDashboard,
    "CreateDepartment": CreateDepartment,
    "Departments": Departments,
    "DepartmentDashboard": DepartmentDashboard,
    "TrialSignup": TrialSignup,
    "EditDepartment": EditDepartment,
    "InterviewDashboard": InterviewDashboard,
    "InterviewV2": InterviewV2,
    "ManageDepartmentUsers": ManageDepartmentUsers,
    "InterviewV2 – STABLE - DO NOT EDIT (AI probing + transcripts verified)": interviewv2StableDoNotEditAiProbingTranscriptsVerified,
    "BackfillSummaries": BackfillSummaries,
    "QuestionsManager": QuestionsManager,
    "InterviewStructureManager": InterviewStructureManager,
    "FollowupPackManager": FollowupPackManager,
    "FollowUpPackQuickAssign": FollowUpPackQuickAssign,
    "FollowUpPackManagerV2": FollowUpPackManagerV2,
    "CandidateInterview": CandidateInterview,
    "SystemConfiguration": SystemConfiguration,
    "AiSettings": AiSettings,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};