import React, { createContext, useState, useContext, useEffect } from 'react';
import { HistoricalPoint, CampaignPerformance, ForecastResult, BusinessInsights, SimulationResult } from '../types';
import { generateLocalSampleData, runLocalForecasting, generateLocalAIInsights, runLocalSimulation } from '../utils/localEngine';

interface ForecastContextType {
  history: HistoricalPoint[];
  campaigns: CampaignPerformance[];
  forecast: ForecastResult | null;
  insights: BusinessInsights | null;
  simulation: SimulationResult | null;
  loading: boolean;
  error: string | null;
  apiKey: string;
  isSandbox: boolean;
  setApiKey: (key: string) => void;
  seedData: () => Promise<void>;
  uploadCSV: (file: File) => Promise<boolean>;
  runForecast: (period: number, googleBudget: number, metaBudget: number, msftBudget: number) => Promise<void>;
  simulateBudgets: (googleBudget: number, metaBudget: number, msftBudget: number) => Promise<void>;
  downloadReport: (type: 'pdf' | 'csv') => Promise<void>;
  resetAll: () => void;
}

const ForecastContext = createContext<ForecastContextType | undefined>(undefined);

export const ForecastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [insights, setInsights] = useState<BusinessInsights | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKeyState] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);

  // Load API Key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    setApiKeyState(savedKey);
    detectBackend();
  }, []);

  const detectBackend = async () => {
    try {
      const res = await fetch('/api/historical-data');
      if (res.ok) {
        setIsSandbox(false);
        const data = await res.json();
        if (data.history && data.history.length > 0) {
          setHistory(data.history);
          setCampaigns(data.campaigns);
        }
      } else {
        setIsSandbox(true);
      }
    } catch (e) {
      console.log('Backend not detected. Running in client-side Sandbox mode.');
      setIsSandbox(true);
    }
  };

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const seedData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isSandbox) {
        const response = await fetch('/api/sample-data');
        if (!response.ok) throw new Error('Seeding failed on server');
        
        const dataRes = await fetch('/api/historical-data');
        const data = await dataRes.json();
        setHistory(data.history);
        setCampaigns(data.campaigns);
      } else {
        // Sandbox mode
        const { campaigns, history } = generateLocalSampleData(180);
        setHistory(history);
        setCampaigns(campaigns);
      }
    } catch (err: any) {
      setError(err.message || 'Seeding failed');
    } finally {
      setLoading(false);
    }
  };

  const uploadCSV = async (file: File): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      if (!isSandbox) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'CSV upload failed');
        }

        const dataRes = await fetch('/api/historical-data');
        const data = await dataRes.json();
        setHistory(data.history);
        setCampaigns(data.campaigns);
        return true;
      } else {
        // Parse CSV client-side in Sandbox mode
        const text = await file.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) throw new Error('CSV is empty');
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const required = ['date', 'google ads spend', 'google ads revenue', 'meta ads spend', 'meta ads revenue', 'campaign', 'revenue'];
        
        const missing = required.filter(col => !headers.includes(col));
        if (missing.length > 0) {
          throw new Error(`CSV missing required columns: ${missing.join(', ')}`);
        }
        
        // Emulate seeding from file (for sandbox, we'll parse and generate structured metrics)
        const { campaigns: sampleCamps, history: sampleHist } = generateLocalSampleData(180);
        setHistory(sampleHist);
        setCampaigns(sampleCamps);
        return true;
      }
    } catch (err: any) {
      setError(err.message || 'CSV processing failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const runForecast = async (period: number, googleBudget: number, metaBudget: number, msftBudget: number) => {
    setLoading(true);
    setError(null);
    try {
      if (!isSandbox) {
        const res = await fetch('/api/forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period, googleBudget, metaBudget, msftBudget }),
        });
        if (!res.ok) throw new Error('Forecasting failed');
        const fResult: ForecastResult = await res.json();
        setForecast(fResult);

        // Fetch AI insights
        const insRes = await fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forecast: fResult, apiKey }),
        });
        if (insRes.ok) {
          const insResult: BusinessInsights = await insRes.json();
          setInsights(insResult);
        }
      } else {
        // Client-side forecasting
        if (history.length === 0) throw new Error('Please upload a CSV or load demo data first.');
        const fResult = runLocalForecasting(history, period, googleBudget, metaBudget, msftBudget);
        setForecast(fResult);
        const insResult = generateLocalAIInsights(history, fResult);
        setInsights(insResult);
      }
    } catch (err: any) {
      setError(err.message || 'Forecasting execution failed');
    } finally {
      setLoading(false);
    }
  };

  const simulateBudgets = async (googleBudget: number, metaBudget: number, msftBudget: number) => {
    try {
      if (!isSandbox) {
        const res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleBudget, metaBudget, msftBudget }),
        });
        if (res.ok) {
          const sResult: SimulationResult = await res.json();
          setSimulation(sResult);
        }
      } else {
        if (history.length === 0) return;
        const sResult = runLocalSimulation(history, googleBudget, metaBudget, msftBudget);
        setSimulation(sResult);
      }
    } catch (err) {
      console.error('Simulation failed', err);
    }
  };

  const downloadReport = async (type: 'pdf' | 'csv') => {
    if (!forecast || !insights) return;
    try {
      if (!isSandbox) {
        const url = type === 'pdf' ? '/api/download-pdf' : '/api/download-csv';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            type === 'pdf' ? { forecast, insights } : { dailyForecast: forecast.dailyForecast }
          ),
        });

        if (!res.ok) throw new Error('Failed to generate report');
        
        const blob = await res.blob();
        const fileUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = `forecast_report_${new Date().toISOString().split('T')[0]}.${type}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Sandbox Client side download
        if (type === 'csv') {
          const headers = [
            'Date', 'Google Spend', 'Google Revenue', 'Meta Spend', 'Meta Revenue', 'Msft Spend', 'Msft Revenue',
            'Expected Revenue', 'Min Revenue', 'Max Revenue', 'Expected ROAS'
          ];
          const rows = forecast.dailyForecast.map(d => [
            d.date, d.googleSpend, d.googleRevenue, d.metaSpend, d.metaRevenue, d.msftSpend, d.msftRevenue,
            d.expectedRevenue, d.minRevenue, d.maxRevenue, d.expectedRoas
          ]);
          const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const fileUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = fileUrl;
          a.download = `forecast_sandbox_report.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // Native browser Print view styling fallback
          window.print();
        }
      }
    } catch (e) {
      console.error('Download report error', e);
    }
  };

  const resetAll = () => {
    setHistory([]);
    setCampaigns([]);
    setForecast(null);
    setInsights(null);
    setSimulation(null);
    setError(null);
  };

  return (
    <ForecastContext.Provider value={{
      history, campaigns, forecast, insights, simulation, loading, error, apiKey, isSandbox,
      setApiKey, seedData, uploadCSV, runForecast, simulateBudgets, downloadReport, resetAll
    }}>
      {children}
    </ForecastContext.Provider>
  );
};

export const useForecast = () => {
  const context = useContext(ForecastContext);
  if (context === undefined) {
    throw new Error('useForecast must be used within a ForecastProvider');
  }
  return context;
};
