import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TradeModeProvider } from "@/contexts/TradeModeContext";
import { SystemSnapshotProvider } from "@/contexts/SystemSnapshotContext";
import { useAlertNotifications } from "@/hooks/useAlertNotifications";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PortfolioPage from "./pages/PortfolioPage";
import PositionsPage from "./pages/PositionsPage";
import OrdersPage from "./pages/OrdersPage";
import FillsPage from "./pages/FillsPage";
import TradesPage from "./pages/TradesPage";
import AgentsPage from "./pages/AgentsPage";
import AgentDetailPage from "./pages/AgentDetailPage";
import AgentComparePage from "./pages/AgentComparePage";
import GenerationsPage from "./pages/GenerationsPage";
import GenerationDetailPage from "./pages/GenerationDetailPage";
import AlertsPage from "./pages/AlertsPage";
import DecisionLogPage from "./pages/DecisionLogPage";
import AuthPage from "./pages/AuthPage";

const queryClient = new QueryClient();

function AlertNotificationsRoot() {
  // Toast only (safe default)
  useAlertNotifications({ enabled: true, toast: true, desktop: false, sound: false });
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TradeModeProvider>
      <SystemSnapshotProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AlertNotificationsRoot />
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/portfolio" element={<ProtectedRoute><PortfolioPage /></ProtectedRoute>} />
              <Route path="/positions" element={<ProtectedRoute><PositionsPage /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
              <Route path="/fills" element={<ProtectedRoute><FillsPage /></ProtectedRoute>} />
              <Route path="/trades" element={<ProtectedRoute><TradesPage /></ProtectedRoute>} />
              <Route path="/agents" element={<ProtectedRoute><AgentsPage /></ProtectedRoute>} />
              <Route path="/agents/compare" element={<ProtectedRoute><AgentComparePage /></ProtectedRoute>} />
              <Route path="/agents/:agentId" element={<ProtectedRoute><AgentDetailPage /></ProtectedRoute>} />
              <Route path="/generations" element={<ProtectedRoute><GenerationsPage /></ProtectedRoute>} />
              <Route path="/generations/:genId" element={<ProtectedRoute><GenerationDetailPage /></ProtectedRoute>} />
              <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
              <Route path="/decisions" element={<ProtectedRoute><DecisionLogPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SystemSnapshotProvider>
    </TradeModeProvider>
  </QueryClientProvider>
);

export default App;
