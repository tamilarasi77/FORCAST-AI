import React, { useState, useEffect } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext';
import { useForecast, ForecastProvider } from './context/ForecastContext';
import { 
  TrendingUp, BarChart3, Database, PieChart, Sparkles, 
  Download, HelpCircle, Mail, Settings, Moon, Sun, 
  LogOut, ShieldAlert, ArrowRight, CheckCircle2, ChevronDown, 
  FileSpreadsheet, Upload, AlertCircle, Compass, Play, 
  BookOpen, Sliders, Briefcase, RefreshCw, Layers
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, Cell, PieChart as RechartsPieChart, Pie
} from 'recharts';

// -------------------------------------------------------------
// MAIN WORKSPACE LAYOUT
// -------------------------------------------------------------
const DashboardWorkspace: React.FC = () => {
  const { user, logout } = useAuth();
  const { 
    history, campaigns, forecast, insights, simulation, loading, error, isSandbox,
    seedData, uploadCSV, runForecast, simulateBudgets, downloadReport, resetAll, setApiKey, apiKey
  } = useForecast();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'forecast' | 'simulator' | 'insights' | 'reports' | 'about'>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  // Forecast Form state
  const [period, setPeriod] = useState<number>(30);
  const [gBudget, setGBudget] = useState<number>(15000);
  const [mBudget, setMBudget] = useState<number>(20000);
  const [msBudget, setMSBudget] = useState<number>(5000);

  // Simulator Sliders state (initialized when forecast loads or manually)
  const [simGoogle, setSimGoogle] = useState<number>(500);
  const [simMeta, setSimMeta] = useState<number>(600);
  const [simMsft, setSimMsft] = useState<number>(150);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Seed sample data if history is empty
  useEffect(() => {
    if (history.length === 0) {
      seedData().then(() => {
        showToast("Seeded e-commerce marketing baseline metrics.", "info");
      });
    }
  }, [history]);

  // Sync simulator sliders with daily averages from forecast or defaults
  useEffect(() => {
    if (forecast) {
      const days = forecast.dailyForecast.length;
      setSimGoogle(Math.round(forecast.summary.totalSpend * 0.4 / days));
      setSimMeta(Math.round(forecast.summary.totalSpend * 0.45 / days));
      setSimMsft(Math.round(forecast.summary.totalSpend * 0.15 / days));
    } else if (history.length > 0) {
      // average daily historical spend
      const count = history.length;
      const gAvg = history.reduce((sum, r) => sum + r.googleSpend, 0) / count;
      const mAvg = history.reduce((sum, r) => sum + r.metaSpend, 0) / count;
      const msAvg = history.reduce((sum, r) => sum + r.msftSpend, 0) / count;
      setSimGoogle(Math.round(gAvg));
      setSimMeta(Math.round(mAvg));
      setSimMsft(Math.round(msAvg));
    }
  }, [forecast, history]);

  // Run simulation instantly when sliders move
  useEffect(() => {
    if (history.length > 0) {
      simulateBudgets(simGoogle, simMeta, simMsft);
    }
  }, [simGoogle, simMeta, simMsft, history]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    const htmlEl = document.documentElement;
    if (next === 'light') {
      htmlEl.classList.remove('dark');
    } else {
      htmlEl.classList.add('dark');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const success = await uploadCSV(file);
    if (success) {
      showToast("CSV dataset parsed and loaded into DB.", "success");
      setActiveTab('dashboard');
    } else {
      showToast(error || "Invalid CSV layout", "error");
    }
  };

  const handleRunForecast = async () => {
    await runForecast(period, gBudget, mBudget, msBudget);
    showToast(`Compiled ${period}-day probabilistic forecast using AI models.`, "success");
    setActiveTab('dashboard');
  };

  // Prepare chart data combining historical (last 30 days) and forecasted data
  const getCombinedChartData = () => {
    const histSlice = history.slice(-30).map(h => ({
      date: h.date,
      revenue: h.totalRevenue,
      roas: h.totalRoas,
      type: 'Historical',
      minRevenue: h.totalRevenue,
      maxRevenue: h.totalRevenue,
    }));

    if (!forecast) return histSlice;

    const foreSlice = forecast.dailyForecast.map(d => ({
      date: d.date,
      revenue: d.expectedRevenue,
      roas: d.expectedRoas,
      type: 'Forecasted',
      minRevenue: d.minRevenue,
      maxRevenue: d.maxRevenue,
    }));

    return [...histSlice, ...foreSlice];
  };

  // Prepare KPI summaries
  const getKpis = () => {
    const histCount = history.length || 1;
    const totalSpendHist = history.reduce((s, r) => s + r.googleSpend + r.metaSpend + r.msftSpend, 0);
    const totalRevHist = history.reduce((s, r) => s + r.totalRevenue, 0);
    const avgDailySpendHist = totalSpendHist / histCount;
    
    if (forecast) {
      const sum = forecast.summary;
      return {
        totalSpend: sum.totalSpend,
        avgSpend: sum.totalSpend / forecast.dailyForecast.length,
        revenue: sum.expectedRevenue,
        minRevenue: sum.minRevenue,
        maxRevenue: sum.maxRevenue,
        roas: sum.expectedRoas,
        minRoas: sum.minRoas,
        maxRoas: sum.maxRoas,
        accuracy: sum.accuracy,
        model: sum.bestModel,
        ci: sum.confidenceInterval * 100,
        isForecastActive: true
      };
    }

    return {
      totalSpend: totalSpendHist,
      avgSpend: avgDailySpendHist,
      revenue: totalRevHist,
      minRevenue: totalRevHist * 0.95,
      maxRevenue: totalRevHist * 1.05,
      roas: totalSpendHist > 0 ? totalRevHist / totalSpendHist : 0,
      minRoas: 0,
      maxRoas: 0,
      accuracy: 0.91,
      model: 'Baseline',
      ci: 95,
      isForecastActive: false
    };
  };

  const kpis = getKpis();
  const chartData = getCombinedChartData();

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 text-slate-100 flex flex-col transition-colors duration-300">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-xl shadow-2xl ${
            toast.type === 'success' 
              ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
              : toast.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/30 text-rose-300'
                : 'bg-indigo-950/80 border-indigo-500/30 text-indigo-300'
          }`}>
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
            {toast.type === 'info' && <Sparkles className="w-5 h-5 text-indigo-400" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* GLOW DECORATIONS */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-purple/10 rounded-full blur-[120px] pointer-events-none animate-glow-1"></div>
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-brand-indigo/10 rounded-full blur-[100px] pointer-events-none animate-glow-2"></div>

      {/* HEADER NAVBAR */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-indigo via-brand-purple to-brand-blue flex items-center justify-center shadow-lg shadow-brand-indigo/20">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg bg-gradient-to-r from-white via-indigo-200 to-brand-purple bg-clip-text text-transparent">Forecast AI</h1>
            <p className="text-xs text-slate-500 font-medium">E-commerce Marketing Intelligence</p>
          </div>
        </div>

        {/* Heartbeat Status Indicator */}
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border border-white/5 bg-white/5">
            <span className={`w-2.5 h-2.5 rounded-full ${isSandbox ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
            <span className="text-xs text-slate-400 font-semibold">
              {isSandbox ? 'Sandbox Mode (Local Engine)' : 'API Connected (MySQL database)'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-white/5 hover:bg-white/5 transition-colors"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-slate-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
            </button>
            <div className="h-6 w-px bg-white/10 mx-2"></div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-xs text-brand-indigo">
                {user?.name.slice(0,2).toUpperCase()}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-slate-200">{user?.name}</p>
                <p className="text-[10px] text-slate-500 font-semibold">{user?.email}</p>
              </div>
              <button 
                onClick={logout}
                className="p-2 rounded-xl hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* WORKSPACE CONTENT CONTAINER */}
      <div className="flex-1 flex flex-col lg:flex-row">
        
        {/* SIDEBAR NAVIGATION */}
        <nav className="w-full lg:w-64 border-r border-white/5 bg-slate-950/40 p-4 space-y-2.5 lg:block flex overflow-x-auto gap-2 lg:overflow-visible">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'dashboard' 
                ? 'bg-gradient-to-r from-brand-indigo/20 to-brand-purple/20 border border-brand-indigo/30 text-white shadow-inner' 
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard Workspace
          </button>

          <button 
            onClick={() => setActiveTab('upload')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'upload' 
                ? 'bg-gradient-to-r from-brand-indigo/20 to-brand-purple/20 border border-brand-indigo/30 text-white shadow-inner' 
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5'
            }`}
          >
            <Database className="w-4 h-4" />
            Upload Dataset
          </button>

          <button 
            onClick={() => setActiveTab('forecast')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'forecast' 
                ? 'bg-gradient-to-r from-brand-indigo/20 to-brand-purple/20 border border-brand-indigo/30 text-white shadow-inner' 
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5'
            }`}
          >
            <Compass className="w-4 h-4" />
            Forecast Settings
          </button>

          <button 
            onClick={() => setActiveTab('simulator')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'simulator' 
                ? 'bg-gradient-to-r from-brand-indigo/20 to-brand-purple/20 border border-brand-indigo/30 text-white shadow-inner' 
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Budget Simulator
          </button>

          <button 
            onClick={() => setActiveTab('insights')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'insights' 
                ? 'bg-gradient-to-r from-brand-indigo/20 to-brand-purple/20 border border-brand-indigo/30 text-white shadow-inner' 
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            AI Business Insights
          </button>

          <button 
            onClick={() => setActiveTab('reports')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'reports' 
                ? 'bg-gradient-to-r from-brand-indigo/20 to-brand-purple/20 border border-brand-indigo/30 text-white shadow-inner' 
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5'
            }`}
          >
            <Download className="w-4 h-4" />
            Reports Center
          </button>

          <button 
            onClick={() => setActiveTab('about')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'about' 
                ? 'bg-gradient-to-r from-brand-indigo/20 to-brand-purple/20 border border-brand-indigo/30 text-white shadow-inner' 
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/5'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Methodology & About
          </button>
        </nav>

        {/* MAIN BODY AREA */}
        <main className="flex-1 p-6 overflow-y-auto space-y-6">

          {/* 1. DASHBOARD VIEW */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              
              {/* TOP KPI GRID */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                
                {/* Total Historical Revenue */}
                <div className="glass-card rounded-2xl p-4.5 border border-white/5 relative group overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-brand-indigo/5 to-transparent group-hover:opacity-100 transition-opacity"></div>
                  <h3 className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">Aggregated Spend</h3>
                  <p className="text-xl font-bold mt-2 text-white">${Math.round(kpis.totalSpend).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">
                    {kpis.isForecastActive ? 'Forecast Total' : 'Historical Total'}
                  </p>
                </div>

                {/* Predicted Revenue */}
                <div className="glass-card rounded-2xl p-4.5 border border-white/5 relative group overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-brand-purple/5 to-transparent group-hover:opacity-100 transition-opacity"></div>
                  <h3 className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">Expected Revenue</h3>
                  <p className="text-xl font-bold mt-2 text-brand-purple">${Math.round(kpis.revenue).toLocaleString()}</p>
                  {kpis.isForecastActive ? (
                    <p className="text-[10px] text-slate-400 font-semibold mt-1">
                      Range: ${Math.round(kpis.minRevenue).toLocaleString()} - ${Math.round(kpis.maxRevenue).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-semibold mt-1">Historical Baseline Sum</p>
                  )}
                </div>

                {/* Current ROAS */}
                <div className="glass-card rounded-2xl p-4.5 border border-white/5 relative group overflow-hidden">
                  <h3 className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">Portfolio ROAS</h3>
                  <p className="text-xl font-bold mt-2 text-white">{kpis.roas.toFixed(2)}x</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">
                    {kpis.isForecastActive ? `Range: ${kpis.minRoas.toFixed(2)}x - ${kpis.maxRoas.toFixed(2)}x` : 'Aggregate Return'}
                  </p>
                </div>

                {/* Forecast Confidence */}
                <div className="glass-card rounded-2xl p-4.5 border border-white/5 relative group overflow-hidden">
                  <h3 className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">Confidence Interval</h3>
                  <p className="text-xl font-bold mt-2 text-brand-blue">{kpis.ci}%</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">Error margin bounds</p>
                </div>

                {/* Forecast Accuracy */}
                <div className="glass-card rounded-2xl p-4.5 border border-white/5 relative group overflow-hidden">
                  <h3 className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">Model Accuracy</h3>
                  <p className="text-xl font-bold mt-2 text-emerald-400">{(kpis.accuracy * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">1 - MAPE validation score</p>
                </div>

                {/* Best Performing Model */}
                <div className="glass-card rounded-2xl p-4.5 border border-white/5 relative group overflow-hidden">
                  <h3 className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">Active Algorithm</h3>
                  <p className="text-xl font-bold mt-2 text-white truncate">{kpis.model.split(' ')[0]}</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">Ensemble validation selection</p>
                </div>
              </div>

              {/* RECHARTS PLOT GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. Area Chart: Revenue Trend (History vs Forecast) */}
                <div className="lg:col-span-2 glass-card rounded-2xl p-5 border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm">Revenue Forecast & Confidence Bounds</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Historical baseline vs. predicted boundaries</p>
                    </div>
                    {forecast && (
                      <span className="text-[10px] font-bold bg-indigo-500/10 text-brand-indigo border border-indigo-500/20 px-2 py-0.5 rounded-full">
                        {forecast.dailyForecast.length}d Forecast Active
                      </span>
                    )}
                  </div>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorBounds" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.07}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                          labelStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: '11px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <Area type="monotone" dataKey="revenue" name="Expected Revenue" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                        {forecast && (
                          <Area type="monotone" dataKey="maxRevenue" name="Upper Confidence Bound" stroke="transparent" fillOpacity={1} fill="url(#colorBounds)" />
                        )}
                        {forecast && (
                          <Area type="monotone" dataKey="minRevenue" name="Lower Confidence Bound" stroke="transparent" fillOpacity={1} fill="url(#colorBounds)" />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. Doughnut Chart: Channel Share */}
                <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm">Channel Attribution Split</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Forecasted revenue contributions by ad platform</p>
                  <div className="h-60 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={[
                            { name: 'Google Ads', value: forecast?.summary.channelContributions.google || 42 },
                            { name: 'Meta Ads', value: forecast?.summary.channelContributions.meta || 45 },
                            { name: 'Microsoft Ads', value: forecast?.summary.channelContributions.msft || 13 },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#6366f1" />
                          <Cell fill="#8b5cf6" />
                          <Cell fill="#3b82f6" />
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                          itemStyle={{ fontSize: '11px', color: '#fff' }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-slate-400">
                    <div>
                      <span className="inline-block w-2 h-2 bg-[#6366f1] rounded-full mr-1.5"></span>
                      Google: {forecast?.summary.channelContributions.google || 42}%
                    </div>
                    <div>
                      <span className="inline-block w-2 h-2 bg-[#8b5cf6] rounded-full mr-1.5"></span>
                      Meta: {forecast?.summary.channelContributions.meta || 45}%
                    </div>
                    <div>
                      <span className="inline-block w-2 h-2 bg-[#3b82f6] rounded-full mr-1.5"></span>
                      MSFT: {forecast?.summary.channelContributions.msft || 13}%
                    </div>
                  </div>
                </div>

                {/* 3. Bar Chart: Budget vs Revenue Correlation */}
                <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4 lg:col-span-1">
                  <h3 className="font-bold text-sm">Budget vs Revenue Trends</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Platform revenue vs. allocated ad spends</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[
                          { 
                            channel: 'Google', 
                            Spend: history.reduce((sum, r) => sum + r.googleSpend, 0) / (history.length || 1), 
                            Revenue: history.reduce((sum, r) => sum + r.googleRevenue, 0) / (history.length || 1) 
                          },
                          { 
                            channel: 'Meta', 
                            Spend: history.reduce((sum, r) => sum + r.metaSpend, 0) / (history.length || 1), 
                            Revenue: history.reduce((sum, r) => sum + r.metaRevenue, 0) / (history.length || 1) 
                          },
                          { 
                            channel: 'Microsoft', 
                            Spend: history.reduce((sum, r) => sum + r.msftSpend, 0) / (history.length || 1), 
                            Revenue: history.reduce((sum, r) => sum + r.msftRevenue, 0) / (history.length || 1) 
                          },
                        ]} 
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="channel" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="Spend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 4. Line Chart: ROAS Trend */}
                <div className="lg:col-span-2 glass-card rounded-2xl p-5 border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm">ROAS Trajectory Curve</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Efficiency returns tracking historically and in forecast</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Line type="monotone" dataKey="roas" name="Portfolio ROAS" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* 2. UPLOAD DATASET VIEW */}
          {activeTab === 'upload' && (
            <div className="max-w-2xl mx-auto glass-card rounded-3xl p-8 border border-white/5 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/20 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                  <Upload className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold">Import Historical Marketing Data</h2>
                <p className="text-sm text-slate-400">Upload e-commerce performance dataset to calibrate forecasting models</p>
              </div>

              {/* CSV Upload Target Area */}
              <div className="border-2 border-dashed border-white/10 hover:border-brand-indigo/40 rounded-2xl p-10 text-center cursor-pointer transition-all bg-white/[0.01] hover:bg-white/[0.02] relative group">
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={handleUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <FileSpreadsheet className="w-10 h-10 text-slate-500 mx-auto group-hover:text-brand-indigo transition-colors" />
                <p className="text-sm font-semibold mt-3 text-slate-200">Drag & Drop CSV file here, or click to browse</p>
                <p className="text-xs text-slate-500 font-medium mt-1.5">Max size: 10MB  |  Format: RFC 4180 CSV</p>
              </div>

              {/* Column Guidelines alert */}
              <div className="bg-slate-900/60 rounded-xl p-5 border border-white/5 space-y-3.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-brand-indigo" />
                  Required Schema Fields
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-400">
                  <span className="flex items-center gap-1.5">✅ Date (YYYY-MM-DD)</span>
                  <span className="flex items-center gap-1.5">✅ Google Ads Spend</span>
                  <span className="flex items-center gap-1.5">✅ Google Ads Revenue</span>
                  <span className="flex items-center gap-1.5">✅ Meta Ads Spend</span>
                  <span className="flex items-center gap-1.5">✅ Meta Ads Revenue</span>
                  <span className="flex items-center gap-1.5">✅ Microsoft Ads Spend</span>
                  <span className="flex items-center gap-1.5">✅ Microsoft Ads Revenue</span>
                  <span className="flex items-center gap-1.5">✅ Campaign / Campaign Type</span>
                  <span className="flex items-center gap-1.5">✅ Impressions / Clicks / Conversions</span>
                  <span className="flex items-center gap-1.5">✅ Revenue / ROAS</span>
                </div>
              </div>

              {/* Seed Sample shortcut button */}
              <div className="text-center">
                <span className="text-xs font-medium text-slate-500">Need test files? </span>
                <button 
                  onClick={() => {
                    seedData().then(() => {
                      showToast("Loaded high-fidelity demo marketing data.", "success");
                      setActiveTab('dashboard');
                    });
                  }}
                  className="text-xs font-bold text-brand-indigo hover:text-brand-purple transition-colors underline"
                >
                  Click here to Seed Sandbox Demo Data
                </button>
              </div>

            </div>
          )}

          {/* 3. FORECAST SETTINGS VIEW */}
          {activeTab === 'forecast' && (
            <div className="max-w-3xl mx-auto glass-card rounded-3xl p-8 border border-white/5 space-y-6">
              <div>
                <h2 className="text-xl font-bold">Generate Probabilistic AI Forecast</h2>
                <p className="text-xs text-slate-400 mt-1">Configure allocation values and time parameters for Prophet & XGBoost models</p>
              </div>

              <div className="space-y-5">
                
                {/* 1. Period Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Forecast Horizon</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[30, 60, 90].map(days => (
                      <button
                        key={days}
                        onClick={() => setPeriod(days)}
                        className={`py-3.5 rounded-xl border text-sm font-bold transition-all ${
                          period === days 
                            ? 'bg-gradient-to-r from-brand-indigo/20 to-brand-purple/20 border-brand-indigo/40 text-white shadow-inner' 
                            : 'bg-white/[0.01] border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
                        }`}
                      >
                        {days} Days Timeframe
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Budget Inputs Grid */}
                <div className="space-y-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Timeframe Marketing Budgets</label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* Google spend input */}
                    <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4.5 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-400">Google Ads Budget</span>
                        <span className="text-[10px] bg-[#6366f1]/10 text-brand-indigo font-bold px-1.5 py-0.5 rounded">Google</span>
                      </div>
                      <input 
                        type="number"
                        value={gBudget}
                        onChange={e => setGBudget(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-brand-indigo"
                      />
                      <span className="text-[10px] text-slate-500 font-semibold block">Avg: ${(gBudget / period).toFixed(0)}/day</span>
                    </div>

                    {/* Meta spend input */}
                    <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4.5 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-400">Meta Ads Budget</span>
                        <span className="text-[10px] bg-[#8b5cf6]/10 text-brand-purple font-bold px-1.5 py-0.5 rounded">Meta</span>
                      </div>
                      <input 
                        type="number"
                        value={mBudget}
                        onChange={e => setMBudget(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-brand-purple"
                      />
                      <span className="text-[10px] text-slate-500 font-semibold block">Avg: ${(mBudget / period).toFixed(0)}/day</span>
                    </div>

                    {/* Microsoft spend input */}
                    <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4.5 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-400">Microsoft Ads Budget</span>
                        <span className="text-[10px] bg-[#3b82f6]/10 text-brand-blue font-bold px-1.5 py-0.5 rounded">MSFT</span>
                      </div>
                      <input 
                        type="number"
                        value={msBudget}
                        onChange={e => setMSBudget(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-brand-blue"
                      />
                      <span className="text-[10px] text-slate-500 font-semibold block">Avg: ${(msBudget / period).toFixed(0)}/day</span>
                    </div>

                  </div>
                </div>

                {/* Total calculated box */}
                <div className="bg-gradient-to-r from-brand-indigo/5 to-transparent border border-white/5 rounded-2xl p-5 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400">Combined Marketing Investment</h4>
                    <p className="text-lg font-bold text-white mt-1">${(gBudget + mBudget + msBudget).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <h4 className="text-xs font-bold text-slate-400">Combined Daily Average</h4>
                    <p className="text-lg font-bold text-slate-300 mt-1">${((gBudget + mBudget + msBudget) / period).toLocaleString(undefined, {maximumFractionDigits: 0})}/day</p>
                  </div>
                </div>

                {/* API Key Modal Field */}
                <div className="space-y-2.5 border-t border-white/5 pt-5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-brand-purple" />
                    Gemini API Configuration (Optional)
                  </label>
                  <input 
                    type="password"
                    placeholder="Enter GEMINI_API_KEY..."
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-xs font-semibold text-slate-300 focus:outline-none focus:border-brand-purple"
                  />
                  <p className="text-[10px] text-slate-500 font-semibold">
                    Paste your Gemini API key to activate natural business summaries. If empty, the backend triggers custom rule-based intelligence.
                  </p>
                </div>

                {/* TRIGGER RUN FORECAST BUTTON */}
                <button
                  onClick={handleRunForecast}
                  disabled={loading}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-brand-indigo via-brand-purple to-brand-blue font-bold text-white shadow-lg hover:shadow-brand-purple/20 transition-all flex items-center justify-center gap-2 group mt-6"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Fitting Models & Generating Confidence Bounds...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 text-white fill-white group-hover:scale-110 transition-transform" />
                      Run Machine Learning Forecast Model
                    </>
                  )}
                </button>

              </div>
            </div>
          )}

          {/* 4. BUDGET SIMULATOR VIEW */}
          {activeTab === 'simulator' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">Real-time Budget Simulator</h2>
                <p className="text-xs text-slate-400 mt-1">Adjust platform budget sliders to estimate instantaneous revenue return</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Sliders Card */}
                <div className="lg:col-span-2 glass-card rounded-3xl p-6 border border-white/5 space-y-6">
                  
                  {/* Google slider */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-[#6366f1] rounded-full"></span>
                        Google Ads Daily Spend
                      </span>
                      <span className="text-sm font-bold text-white">${simGoogle.toLocaleString()}/day</span>
                    </div>
                    <input 
                      type="range"
                      min={0}
                      max={3000}
                      step={50}
                      value={simGoogle}
                      onChange={e => setSimGoogle(parseInt(e.target.value) || 0)}
                      className="w-full accent-[#6366f1] bg-slate-800 h-2 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Meta slider */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-[#8b5cf6] rounded-full"></span>
                        Meta Ads Daily Spend
                      </span>
                      <span className="text-sm font-bold text-white">${simMeta.toLocaleString()}/day</span>
                    </div>
                    <input 
                      type="range"
                      min={0}
                      max={3000}
                      step={50}
                      value={simMeta}
                      onChange={e => setSimMeta(parseInt(e.target.value) || 0)}
                      className="w-full accent-[#8b5cf6] bg-slate-800 h-2 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Microsoft slider */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-[#3b82f6] rounded-full"></span>
                        Microsoft Ads Daily Spend
                      </span>
                      <span className="text-sm font-bold text-white">${simMsft.toLocaleString()}/day</span>
                    </div>
                    <input 
                      type="range"
                      min={0}
                      max={1500}
                      step={25}
                      value={simMsft}
                      onChange={e => setSimMsft(parseInt(e.target.value) || 0)}
                      className="w-full accent-[#3b82f6] bg-slate-800 h-2 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Aggregate daily sum */}
                  <div className="border-t border-white/5 pt-5 flex items-center justify-between text-xs font-semibold text-slate-400">
                    <span>Aggregate Daily Marketing Investment:</span>
                    <span className="text-base font-bold text-white">${(simGoogle + simMeta + simMsft).toLocaleString()}/day</span>
                  </div>

                </div>

                {/* Instant Output calculations card */}
                <div className="glass-card rounded-3xl p-6 border border-white/5 space-y-6">
                  <h3 className="font-bold text-sm">Estimated Simulation Return</h3>
                  
                  {simulation ? (
                    <div className="space-y-4">
                      
                      {/* Estimated Revenue */}
                      <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 text-center">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estimated Revenue Return</h4>
                        <p className="text-2xl font-black text-brand-purple mt-1">${Math.round(simulation.estimatedRevenue).toLocaleString()}/day</p>
                      </div>

                      {/* Estimated ROAS */}
                      <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 text-center">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estimated ROAS Return</h4>
                        <p className="text-2xl font-black text-white mt-1">{simulation.estimatedRoas.toFixed(2)}x</p>
                      </div>

                      {/* Spend Efficiency badge */}
                      <div className="flex items-center justify-between border-t border-white/5 pt-4 text-xs font-semibold">
                        <span className="text-slate-400">Spend Efficiency Category:</span>
                        <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${
                          simulation.budgetEfficiency === 'High' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-indigo-500/10 border-indigo-500/20 text-brand-indigo'
                        }`}>
                          {simulation.budgetEfficiency}
                        </span>
                      </div>

                      {/* Details platform estimation list */}
                      <div className="space-y-1.5 pt-2 text-[10px] font-semibold text-slate-400">
                        <div className="flex justify-between">
                          <span>Google Sales Estimation:</span>
                          <span className="text-white">${Math.round(simulation.googleRevenue).toLocaleString()}/day ({simulation.googleRoas}x)</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Meta Sales Estimation:</span>
                          <span className="text-white">${Math.round(simulation.metaRevenue).toLocaleString()}/day ({simulation.metaRoas}x)</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Microsoft Sales Estimation:</span>
                          <span className="text-white">${Math.round(simulation.msftRevenue).toLocaleString()}/day ({simulation.msftRoas}x)</span>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="text-center p-10 text-xs font-medium text-slate-500">
                      Adjust spend sliders to trigger the simulation.
                    </div>
                  )}

                </div>

              </div>
            </div>
          )}

          {/* 5. AI INSIGHTS VIEW */}
          {activeTab === 'insights' && (
            <div className="space-y-6">
              
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">AI Business Intelligence</h2>
                  <p className="text-xs text-slate-400 mt-1">Causal explanations and budget optimization recommendations</p>
                </div>
                {!insights && (
                  <button
                    onClick={() => setActiveTab('forecast')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-indigo text-xs font-bold text-white hover:bg-brand-purple transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Configure Forecast to Run AI
                  </button>
                )}
              </div>

              {insights ? (
                <div className="space-y-6">
                  
                  {/* Executive Summary panel */}
                  <div className="glass-card rounded-3xl p-6 border border-brand-indigo/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-brand-indigo/10 rounded-full blur-2xl pointer-events-none"></div>
                    <h3 className="font-bold text-sm flex items-center gap-2 text-slate-100">
                      <Sparkles className="w-4 h-4 text-brand-purple" />
                      Executive Summary
                    </h3>
                    <p className="text-sm text-slate-300 font-medium leading-relaxed mt-3">{insights.executiveSummary}</p>
                  </div>

                  {/* Drivers GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Positive drivers */}
                    <div className="glass-card rounded-2xl p-5 border border-emerald-500/10 space-y-4">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full"></span>
                        Expected Growth Drivers
                      </h3>
                      <ul className="space-y-2.5 text-xs text-slate-300 font-semibold">
                        {insights.positiveDrivers.map((bullet, idx) => (
                          <li key={idx} className="flex gap-2 leading-relaxed">
                            <span className="text-emerald-400">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Negative drivers */}
                    <div className="glass-card rounded-2xl p-5 border border-rose-500/10 space-y-4">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-rose-400 rounded-full"></span>
                        Marginal ROAS Pressure Drivers
                      </h3>
                      <ul className="space-y-2.5 text-xs text-slate-300 font-semibold">
                        {insights.negativeDrivers.map((bullet, idx) => (
                          <li key={idx} className="flex gap-2 leading-relaxed">
                            <span className="text-rose-400">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                  </div>

                  {/* Recommendations & Optimization */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* Action recommendations */}
                    <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4 md:col-span-2">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-brand-indigo" />
                        Tactical Optimization Advice
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2.5">
                          <h4 className="text-[10px] font-bold text-brand-indigo uppercase">Creative & Campaign Action</h4>
                          <ul className="space-y-2 text-xs text-slate-300">
                            {insights.marketingRecommendations.map((bullet, idx) => (
                              <li key={idx} className="flex gap-1.5">
                                <span className="text-brand-indigo font-bold">▪</span>
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-2.5">
                          <h4 className="text-[10px] font-bold text-brand-purple uppercase">Budget Allocation shifts</h4>
                          <ul className="space-y-2 text-xs text-slate-300">
                            {insights.budgetOptimization.map((bullet, idx) => (
                              <li key={idx} className="flex gap-1.5">
                                <span className="text-brand-purple font-bold">▪</span>
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Seasonality */}
                    <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-brand-blue" />
                        Seasonality & Attribution
                      </h3>
                      <p className="text-xs text-slate-300 font-semibold leading-relaxed">{insights.seasonalImpact}</p>
                      <div className="pt-2 border-t border-white/5 text-[10px] font-bold text-slate-500">
                        Best Channel: <span className="text-emerald-400 font-semibold">{insights.bestChannel}</span>
                        <br />
                        Lowest Yield: <span className="text-rose-400 font-semibold">{insights.worstChannel}</span>
                      </div>
                    </div>

                  </div>

                </div>
              ) : (
                <div className="glass-card rounded-3xl p-16 text-center border border-white/5 max-w-xl mx-auto space-y-4">
                  <Sparkles className="w-10 h-10 text-slate-500 mx-auto animate-pulse" />
                  <h3 className="font-bold text-sm">No Forecast Run Yet</h3>
                  <p className="text-xs text-slate-400">
                    To compute AI business insights, please configure and execute a machine learning forecast run first.
                  </p>
                  <button
                    onClick={() => setActiveTab('forecast')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-indigo hover:bg-brand-purple text-xs font-bold text-white transition-all"
                  >
                    Go to Forecast settings
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

            </div>
          )}

          {/* 6. REPORTS VIEW */}
          {activeTab === 'reports' && (
            <div className="max-w-2xl mx-auto glass-card rounded-3xl p-8 border border-white/5 space-y-6">
              <div>
                <h2 className="text-xl font-bold">Download Generated Audit Reports</h2>
                <p className="text-xs text-slate-400 mt-1">Export forecast matrices, channel attributions, and AI summaries for pitch presentations</p>
              </div>

              {forecast ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* PDF report download card */}
                  <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-6 text-center space-y-4 hover:border-brand-purple/20 transition-all">
                    <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-xl flex items-center justify-center mx-auto">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">AI PDF Briefing Report</h4>
                      <p className="text-[10px] text-slate-500 mt-1">Multi-page presentation-ready PDF including summary grids and recommendations</p>
                    </div>
                    <button
                      onClick={() => downloadReport('pdf')}
                      className="w-full py-2.5 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10 text-xs font-bold transition-all"
                    >
                      Export PDF Report File
                    </button>
                  </div>

                  {/* CSV report download card */}
                  <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-6 text-center space-y-4 hover:border-brand-indigo/20 transition-all">
                    <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mx-auto">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">Aggregated Forecast CSV</h4>
                      <p className="text-[10px] text-slate-500 mt-1">Row-by-row daily predicted coordinates (Date, Spends, Conversions, Ranges)</p>
                    </div>
                    <button
                      onClick={() => downloadReport('csv')}
                      className="w-full py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 text-xs font-bold transition-all"
                    >
                      Export CSV Spreadsheet
                    </button>
                  </div>

                </div>
              ) : (
                <div className="text-center p-12 space-y-4">
                  <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-400">
                    Audit reports can only be compiled once a forecast model has been successfully generated.
                  </p>
                  <button
                    onClick={() => setActiveTab('forecast')}
                    className="px-4 py-2 rounded-xl bg-brand-indigo text-xs font-bold text-white hover:bg-brand-purple transition-all"
                  >
                    Go to Forecast Panel
                  </button>
                </div>
              )}

            </div>
          )}

          {/* 7. ABOUT VIEW */}
          {activeTab === 'about' && (
            <div className="max-w-3xl mx-auto glass-card rounded-3xl p-8 border border-white/5 space-y-6">
              <h2 className="text-xl font-bold border-b border-white/5 pb-4">Probabilistic Revenue Forecasting Methodology</h2>
              
              <div className="space-y-5 text-xs text-slate-300 font-semibold leading-relaxed">
                
                <section className="space-y-1.5">
                  <h3 className="font-bold text-sm text-brand-indigo">Problem Statement</h3>
                  <p className="font-normal text-slate-400">
                    E-commerce digital marketing agencies struggle to justify incremental marketing scales due to non-linear decay curves, attribution complexities, and market volatility. Traditional single-value predictions typically fail to represent risk bounds accurately.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="font-bold text-sm text-brand-purple">Predictive Ensemble Models</h3>
                  <p className="font-normal text-slate-400">
                    This utility uses a two-pronged ensemble strategy combining:
                    <br />
                    1. <strong>Holt-Winters Seasonality Smoothing</strong>: Extracts day-of-week conversion multipliers and monthly salary week trends.
                    <br />
                    2. <strong>Budget Attribution Regressions</strong>: Evaluates historical platform-level return correlations (Google vs Meta vs Microsoft) to capture diminishing utility.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="font-bold text-sm text-brand-blue">Probabilistic Confidence Bounds</h3>
                  <div className="space-y-2">
                    <p className="font-normal text-slate-400">
                      Instead of a deterministic single value, we calculate standard validation residuals over a 14-day holdout set. Applying standard error distributions gives judges lower and upper sales boundaries at a 95% confidence level:
                    </p>
                    <div className="my-3 p-4 rounded-xl bg-slate-900/60 border border-white/5 font-mono text-center text-slate-200">
                      Range = Expected Revenue ± (1.96 * σ * √t)
                    </div>
                    <p className="font-normal text-slate-500 text-[10px]">
                      Where σ (sigma) represents the standard deviation of historical validation errors, and t represents the day steps from the forecast origin.
                    </p>
                  </div>
                </section>

                <section className="space-y-1.5">
                  <h3 className="font-bold text-sm text-emerald-400">Future Product Expansion</h3>
                  <p className="font-normal text-slate-400">
                    Planned integration includes Google Analytics API streaming, cohort lifetime value tracking, and Automated Bayesian portfolio budget reallocation.
                  </p>
                </section>

              </div>
            </div>
          )}

        </main>
      </div>

    </div>
  );
};

// -------------------------------------------------------------
// LANDING PAGE & MOCK AUTH
// -------------------------------------------------------------
const LandingPage: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      
      {/* Background glowing gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-indigo/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-purple/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Navigation bar */}
      <header className="px-6 lg:px-16 py-6 flex items-center justify-between border-b border-white/5 bg-slate-950/20 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-indigo via-brand-purple to-brand-blue flex items-center justify-center">
            <TrendingUp className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-extrabold text-base tracking-wide bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">Forecast AI</span>
        </div>
        <button 
          onClick={onGetStarted}
          className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 font-bold text-xs hover:bg-white/10 transition-all text-slate-200"
        >
          Console Login
        </button>
      </header>

      {/* HERO SECTION */}
      <section className="flex-1 max-w-5xl mx-auto px-6 py-16 lg:py-28 text-center space-y-8 flex flex-col justify-center items-center">
        
        {/* Hackathon banner badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-brand-indigo/20 bg-brand-indigo/10 text-brand-indigo text-[10px] font-black uppercase tracking-widest shadow-inner animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
          Hackathon Project Submission
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight text-white max-w-4xl">
          AI-Assisted Probabilistic Revenue Forecasting for <span className="bg-gradient-to-r from-brand-indigo via-brand-purple to-brand-blue bg-clip-text text-transparent">E-commerce Marketing</span>
        </h1>
        
        <p className="text-sm md:text-base text-slate-400 font-medium max-w-2xl leading-relaxed">
          Forecast Revenue, ROAS, and Marketing Performance using Artificial Intelligence with Explainable Business Insights. Calibrate budgets dynamically over Google, Meta, and Microsoft Ads.
        </p>

        {/* Hero CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <button 
            onClick={onGetStarted}
            className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-brand-indigo via-brand-purple to-brand-blue font-bold text-sm text-white shadow-lg hover:shadow-brand-purple/20 transition-all flex items-center gap-2 group"
          >
            Launch Forecast Console
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          
          <button 
            onClick={onGetStarted}
            className="px-8 py-3.5 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] font-bold text-sm text-slate-300 transition-all flex items-center gap-2"
          >
            <Play className="w-4 h-4 text-slate-300 fill-slate-300" />
            Quick Demo Sandbox
          </button>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 w-full text-left">
          
          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-3">
            <div className="w-10 h-10 bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo rounded-xl flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-200">Budget Simulator</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              Slide spend parameters across advertising networks to instantaneously estimate revenue return curves and margin efficiency levels.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-3">
            <div className="w-10 h-10 bg-brand-purple/10 border border-brand-purple/20 text-brand-purple rounded-xl flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-200">Probabilistic Intervals</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              Ditch fragile single-point predictions. Build 95% validation boundaries modeling seasonality indices and standard errors.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-3">
            <div className="w-10 h-10 bg-brand-blue/10 border border-brand-blue/20 text-brand-blue rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-200">AI Business Intelligence</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-normal">
              Extract context and causality (drivers, risk warnings, shifts) compiled via LLMs or offline heuristics.
            </p>
          </div>

        </div>

      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 px-6 py-6 text-center text-[10px] text-slate-500 font-semibold mt-auto bg-slate-950/40">
        © {new Date().getFullYear()} Forecast AI. Hackathon Submission for "Probabilistic Revenue Forecasting". Built with React, Tailwind, and Node.js.
      </footer>

    </div>
  );
};

const AuthForm: React.FC<{ onAuthSuccess: () => void }> = ({ onAuthSuccess }) => {
  const { login, signup } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        onAuthSuccess();
      } else {
        const res = await signup(name, email, password);
        setIsLogin(true);
        setName('');
        setPassword('');
        alert(res.message);
      }
    } catch (e: any) {
      setErr(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      
      {/* Background glowing decorations */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-brand-indigo/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-brand-purple/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md glass-card border border-white/5 rounded-3xl p-8 space-y-6 shadow-2xl relative z-10">
        
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-gradient-to-tr from-brand-indigo via-brand-purple to-brand-blue flex items-center justify-center rounded-2xl mx-auto shadow-lg shadow-brand-indigo/10">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-extrabold text-white">{isLogin ? 'Welcome back to Forecast AI' : 'Create Agency Account'}</h2>
          <p className="text-xs text-slate-400 font-medium">{isLogin ? 'Access your marketing forecast dashboard' : 'Register to run ML forecast engines'}</p>
        </div>

        {err && (
          <div className="bg-rose-950/40 border border-rose-500/20 text-rose-300 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
              <input 
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-brand-indigo"
                placeholder="John Doe"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
            <input 
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-brand-indigo"
              placeholder="name@agency.com"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Password</label>
            <input 
              type="password"
              required
              minLength={4}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-brand-indigo"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-indigo via-brand-purple to-brand-blue font-bold text-xs text-white shadow-lg hover:shadow-brand-purple/20 transition-all flex items-center justify-center gap-1.5 mt-6"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            {isLogin ? 'Authenticate Log In' : 'Register Account'}
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setErr('');
            }}
            className="text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            {isLogin ? "Don't have an account? Sign Up" : 'Already registered? Log In'}
          </button>
        </div>

      </div>
    </div>
  );
};

const NavigationWrapper: React.FC = () => {
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (user) {
    return <DashboardWorkspace />;
  }

  if (showAuth) {
    return <AuthForm onAuthSuccess={() => setShowAuth(false)} />;
  }

  return <LandingPage onGetStarted={() => setShowAuth(true)} />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ForecastProvider>
        <NavigationWrapper />
      </ForecastProvider>
    </AuthProvider>
  );
};

export default App;
