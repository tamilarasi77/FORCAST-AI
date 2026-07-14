import { HistoricalRow } from './forecaster';

export interface CampaignRow {
  date: string;
  campaignName: string;
  campaignType: string;
  googleSpend: number;
  googleRevenue: number;
  metaSpend: number;
  metaRevenue: number;
  msftSpend: number;
  msftRevenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  roas: number;
}

export function generateSampleData(days = 180): { campaigns: CampaignRow[]; aggregated: HistoricalRow[] } {
  const campaigns: CampaignRow[] = [];
  const aggregated: HistoricalRow[] = [];

  const campaignTemplates = [
    { name: 'Google Search - Brand', type: 'Search', channel: 'google', baseSpend: 300, baseRoas: 4.5, ctr: 0.08, cvr: 0.05 },
    { name: 'Google Performance Max - Core', type: 'PMax', channel: 'google', baseSpend: 500, baseRoas: 3.2, ctr: 0.02, cvr: 0.025 },
    { name: 'Meta Prospecting - Lookalike', type: 'Social', channel: 'meta', baseSpend: 600, baseRoas: 2.8, ctr: 0.015, cvr: 0.02 },
    { name: 'Meta Retargeting - DABA', type: 'Social', channel: 'meta', baseSpend: 250, baseRoas: 5.2, ctr: 0.035, cvr: 0.06 },
    { name: 'Microsoft Search - Generic', type: 'Search', channel: 'msft', baseSpend: 100, baseRoas: 3.5, ctr: 0.05, cvr: 0.03 }
  ];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  for (let d = 0; d < days; d++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + d);
    const dateStr = currentDate.toISOString().split('T')[0];

    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
    // Weekly seasonality: E-commerce sales peak on Tuesday/Wednesday and dip on Saturday
    let seasonalityFactor = 1.0;
    if (dayOfWeek === 2 || dayOfWeek === 3) seasonalityFactor = 1.15; // +15% midweek
    if (dayOfWeek === 6) seasonalityFactor = 0.8; // -20% Saturday
    if (dayOfWeek === 0) seasonalityFactor = 0.95; // -5% Sunday

    // Monthly seasonality (salary cycles at start/end of month)
    const dayOfMonth = currentDate.getDate();
    if (dayOfMonth >= 28 || dayOfMonth <= 3) {
      seasonalityFactor *= 1.12; // +12% salary week
    }

    // Add some random noise
    const noise = 0.9 + Math.random() * 0.2; // +/- 10% noise
    const totalDayFactor = seasonalityFactor * noise;

    let dailyGoogleSpend = 0;
    let dailyGoogleRev = 0;
    let dailyMetaSpend = 0;
    let dailyMetaRev = 0;
    let dailyMsftSpend = 0;
    let dailyMsftRev = 0;
    let dailyImpressions = 0;
    let dailyClicks = 0;
    let dailyConversions = 0;
    let dailyRevenue = 0;

    for (const temp of campaignTemplates) {
      // Scale spend slightly with seasonality
      const spend = Math.round(temp.baseSpend * (0.9 + Math.random() * 0.2) * 100) / 100;
      
      // Calculate conversions based on clicks
      const cpm = temp.channel === 'google' ? 12 : temp.channel === 'meta' ? 16 : 8; // cost per 1k impressions
      const impressions = Math.round((spend / cpm) * 1000);
      const clicks = Math.round(impressions * temp.ctr * (0.95 + Math.random() * 0.1));
      const conversions = Math.round(clicks * temp.cvr * (0.9 + Math.random() * 0.2));

      // Calculate revenue using target ROAS, seasonality, and random fluctuations
      const baseExpectedRev = spend * temp.baseRoas;
      const revenue = Math.round(baseExpectedRev * totalDayFactor * 100) / 100;
      const roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0;

      const row: CampaignRow = {
        date: dateStr,
        campaignName: temp.name,
        campaignType: temp.type,
        googleSpend: temp.channel === 'google' ? spend : 0,
        googleRevenue: temp.channel === 'google' ? revenue : 0,
        metaSpend: temp.channel === 'meta' ? spend : 0,
        metaRevenue: temp.channel === 'meta' ? revenue : 0,
        msftSpend: temp.channel === 'msft' ? spend : 0,
        msftRevenue: temp.channel === 'msft' ? revenue : 0,
        impressions,
        clicks,
        conversions,
        revenue,
        roas
      };

      campaigns.push(row);

      // Accumulate aggregates
      if (temp.channel === 'google') {
        dailyGoogleSpend += spend;
        dailyGoogleRev += revenue;
      } else if (temp.channel === 'meta') {
        dailyMetaSpend += spend;
        dailyMetaRev += revenue;
      } else if (temp.channel === 'msft') {
        dailyMsftSpend += spend;
        dailyMsftRev += revenue;
      }

      dailyImpressions += impressions;
      dailyClicks += clicks;
      dailyConversions += conversions;
      dailyRevenue += revenue;
    }

    const aggRow: HistoricalRow = {
      date: dateStr,
      googleSpend: Math.round(dailyGoogleSpend * 100) / 100,
      googleRevenue: Math.round(dailyGoogleRev * 100) / 100,
      metaSpend: Math.round(dailyMetaSpend * 100) / 100,
      metaRevenue: Math.round(dailyMetaRev * 100) / 100,
      msftSpend: Math.round(dailyMsftSpend * 100) / 100,
      msftRevenue: Math.round(dailyMsftRev * 100) / 100,
      impressions: dailyImpressions,
      clicks: dailyClicks,
      conversions: dailyConversions,
      totalRevenue: Math.round(dailyRevenue * 100) / 100,
      totalRoas: Math.round((dailyRevenue / (dailyGoogleSpend + dailyMetaSpend + dailyMsftSpend)) * 100) / 100
    };

    aggregated.push(aggRow);
  }

  return { campaigns, aggregated };
}
