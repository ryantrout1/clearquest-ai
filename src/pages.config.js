import Home from './pages/Home';
import StartInterview from './pages/StartInterview';
import Interview from './pages/Interview';
import AdminDashboard from './pages/AdminDashboard';
import SessionDetails from './pages/SessionDetails';
import Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "StartInterview": StartInterview,
    "Interview": Interview,
    "AdminDashboard": AdminDashboard,
    "SessionDetails": SessionDetails,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: Layout,
};