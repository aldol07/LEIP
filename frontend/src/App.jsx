import { Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { AdminDashboardScreen } from "./screens/AdminDashboardScreen";
import { AlertManagerScreen } from "./screens/AlertManagerScreen";
import { AnalysisPanelScreen } from "./screens/AnalysisPanelScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { EventBrowserScreen } from "./screens/EventBrowserScreen";
import { LiveEventScreen } from "./screens/LiveEventScreen";
import { PostEventReportScreen } from "./screens/PostEventReportScreen";
import { PredictionBoardScreen } from "./screens/PredictionBoardScreen";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="/events" element={<EventBrowserScreen />} />
        <Route path="/live" element={<LiveEventScreen />} />
        <Route path="/analysis" element={<AnalysisPanelScreen />} />
        <Route path="/predictions" element={<PredictionBoardScreen />} />
        <Route path="/alerts" element={<AlertManagerScreen />} />
        <Route path="/reports" element={<PostEventReportScreen />} />
        <Route path="/admin" element={<AdminDashboardScreen />} />
      </Routes>
    </Layout>
  );
}
