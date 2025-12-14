import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TradeModeProvider } from "@/contexts/TradeModeContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PortfolioPage from "./pages/PortfolioPage";
import PositionsPage from "./pages/PositionsPage";
import OrdersPage from "./pages/OrdersPage";
import FillsPage from "./pages/FillsPage";
import AgentsPage from "./pages/AgentsPage";
import AgentDetailPage from "./pages/AgentDetailPage";
import GenerationsPage from "./pages/GenerationsPage";
import GenerationDetailPage from "./pages/GenerationDetailPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TradeModeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/positions" element={<PositionsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/fills" element={<FillsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/agents/:agentId" element={<AgentDetailPage />} />
            <Route path="/generations" element={<GenerationsPage />} />
            <Route path="/generations/:genId" element={<GenerationDetailPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </TradeModeProvider>
  </QueryClientProvider>
);

export default App;
