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
import Layout from './Layout.jsx';


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
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: Layout,
};