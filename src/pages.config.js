import Home from './pages/Home';
import StartInterview from './pages/StartInterview';
import Interview from './pages/Interview';
import AdminDashboard from './pages/AdminDashboard';
import SessionDetails from './pages/SessionDetails';
import AdminLogin from './pages/AdminLogin';
import Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "StartInterview": StartInterview,
    "Interview": Interview,
    "AdminDashboard": AdminDashboard,
    "SessionDetails": SessionDetails,
    "AdminLogin": AdminLogin,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: Layout,
};