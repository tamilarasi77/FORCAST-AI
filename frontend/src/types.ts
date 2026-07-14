export interface HistoricalPoint {
  date: string;
  googleSpend: number;
  googleRevenue: number;
  metaSpend: number;
  metaRevenue: number;
  msftSpend: number;
  msftRevenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  totalRevenue: number;
  totalRoas: number;
}

export interface CampaignPerformance {
  campaign_name: string;
  campaign_type: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface DailyForecastPoint {
  date: string;
  expectedRevenue: number;
  minRevenue: number;
  maxRevenue: number;
  expectedRoas: number;
  minRoas: number;
  maxRoas: number;
  googleSpend: number;
  metaSpend: number;
  msftSpend: number;
  googleRevenue: number;
  metaRevenue: number;
  msftRevenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface ForecastSummary {
  expectedRevenue: number;
  minRevenue: number;
  maxRevenue: number;
  expectedRoas: number;
  minRoas: number;
  maxRoas: number;
  totalSpend: number;
  confidenceInterval: number;
  accuracy: number;
  bestModel: string;
  channelContributions: {
    google: number;
    meta: number;
    msft: number;
  };
}

export interface ForecastResult {
  summary: ForecastSummary;
  dailyForecast: DailyForecastPoint[];
}

export interface BusinessInsights {
  executiveSummary: string;
  positiveDrivers: string[];
  negativeDrivers: string[];
  seasonalImpact: string;
  campaignPerformance: string;
  marketingRecommendations: string[];
  budgetOptimization: string[];
  risks: string[];
  opportunities: string[];
  bestChannel: string;
  worstChannel: string;
}

export interface SimulationResult {
  estimatedRevenue: number;
  estimatedRoas: number;
  googleRevenue: number;
  metaRevenue: number;
  msftRevenue: number;
  googleRoas: number;
  metaRoas: number;
  msftRoas: number;
  budgetEfficiency: string;
}

export interface ConsistencyCheck {
  id: string;
  rule: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
}
