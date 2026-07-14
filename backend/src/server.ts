import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { dbManager } from './db';
import { generateSampleData, CampaignRow } from './generator';
import { runForecasting, HistoricalRow } from './forecaster';
import { generateAIInsights } from './insights';
import { generateCSVReport, generatePDFReport } from './reports';

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());

// Setup Multer for CSV uploads (in-memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed.'));
    }
  }
});

// Helper: Custom robust CSV parser to avoid library version mismatches
function parseCSV(csvText: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = '';

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentVal += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentVal.trim());
      if (row.length > 1 || row[0] !== '') {
        result.push(row);
      }
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  
  if (currentVal !== '' || row.length > 0) {
    row.push(currentVal.trim());
    result.push(row);
  }

  return result;
}

// -------------------------------------------------------------
// Database Initialization
// -------------------------------------------------------------
dbManager.initializeTables()
  .then(() => console.log('Database system initialized.'))
  .catch(err => console.error('Database initialization failed:', err));

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  try {
    const db = await dbManager.getConnection();
    const existing = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Simple hash (for prototype/hackathon purposes)
    const mockHash = Buffer.from(password).toString('base64');
    await db.execute(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, mockHash]
    );

    res.status(201).json({ message: 'User registered successfully. Proceed to login.' });
  } catch (err: any) {
    res.status(500).json({ error: `Signup failed: ${err.message}` });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const db = await dbManager.getConnection();
    const rows = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];
    const inputHash = Buffer.from(password).toString('base64');
    if (user.password_hash !== inputHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json({
      token: `mock-jwt-token-for-${user.id}`,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err: any) {
    res.status(500).json({ error: `Login failed: ${err.message}` });
  }
});

// -------------------------------------------------------------
// Data Upload & Seed Endpoints
// -------------------------------------------------------------

// Populate with Sample Demo Data (for immediate testing)
app.get('/api/sample-data', async (req, res) => {
  try {
    console.log('Generating and loading sample marketing data...');
    const { campaigns, aggregated } = generateSampleData(180);
    const db = await dbManager.getConnection();

    // Clear existing data
    await db.execute('DELETE FROM marketing_data');
    await db.execute('DELETE FROM campaign_performance');

    // Insert Campaign Rows
    for (const r of campaigns) {
      await db.execute(`
        INSERT INTO campaign_performance (campaign_name, campaign_type, spend, revenue, impressions, clicks, conversions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [r.campaignName, r.campaignType, r.googleSpend + r.metaSpend + r.msftSpend, r.revenue, r.impressions, r.clicks, r.conversions]);
    }

    // Insert Aggregated daily Rows
    for (const r of aggregated) {
      await db.execute(`
        INSERT INTO marketing_data (date, google_spend, google_revenue, meta_spend, meta_revenue, msft_spend, msft_revenue, impressions, clicks, conversions, total_revenue, total_roas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [r.date, r.googleSpend, r.googleRevenue, r.metaSpend, r.metaRevenue, r.msftSpend, r.msftRevenue, r.impressions, r.clicks, r.conversions, r.totalRevenue, r.totalRoas]);
    }

    res.json({ message: 'Sample data seeded successfully.', count: aggregated.length });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to seed data: ${err.message}` });
  }
});

// Fetch active historical marketing data
app.get('/api/historical-data', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    const rows = await db.query('SELECT * FROM marketing_data ORDER BY date ASC');
    const campaigns = await db.query('SELECT campaign_name, campaign_type, SUM(spend) as spend, SUM(revenue) as revenue, SUM(impressions) as impressions, SUM(clicks) as clicks, SUM(conversions) as conversions FROM campaign_performance GROUP BY campaign_name, campaign_type');
    
    // Map to response formats
    const formattedHistory = rows.map((r: any) => ({
      date: r.date,
      googleSpend: r.google_spend,
      googleRevenue: r.google_revenue,
      metaSpend: r.meta_spend,
      metaRevenue: r.meta_revenue,
      msftSpend: r.msft_spend,
      msftRevenue: r.msft_revenue,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      totalRevenue: r.total_revenue,
      totalRoas: r.total_roas
    }));

    res.json({ history: formattedHistory, campaigns });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch data: ${err.message}` });
  }
});

// CSV Upload & Validation Endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    const csvContent = req.file.buffer.toString('utf-8');
    const parsedRows = parseCSV(csvContent);

    if (parsedRows.length < 2) {
      return res.status(400).json({ error: 'The uploaded file is empty or missing content.' });
    }

    const headers = parsedRows[0].map(h => h.trim().toLowerCase());
    
    // Required Columns Mapping (case-insensitive)
    const requiredCols = [
      'date',
      'google ads spend',
      'google ads revenue',
      'meta ads spend',
      'meta ads revenue',
      'microsoft ads spend',
      'microsoft ads revenue',
      'campaign',
      'campaign type',
      'impressions',
      'clicks',
      'conversions',
      'revenue',
      'roas'
    ];

    const missingCols = requiredCols.filter(col => !headers.includes(col));
    if (missingCols.length > 0) {
      return res.status(400).json({
        error: `CSV validation failed. Missing required columns: ${missingCols.join(', ')}`
      });
    }

    // Get column indexes
    const idx = (colName: string) => headers.indexOf(colName);
    
    const db = await dbManager.getConnection();
    
    // Clear old records
    await db.execute('DELETE FROM marketing_data');
    await db.execute('DELETE FROM campaign_performance');

    // Temporal storage for aggregation by date
    const dailyAggregates: Record<string, {
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
    }> = {};

    // Parse data rows
    for (let i = 1; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      if (row.length < headers.length) continue; // Skip malformed rows

      const date = row[idx('date')];
      const campName = row[idx('campaign')];
      const campType = row[idx('campaign type')];
      
      const gSpend = parseFloat(row[idx('google ads spend')]) || 0;
      const gRev = parseFloat(row[idx('google ads revenue')]) || 0;
      const mSpend = parseFloat(row[idx('meta ads spend')]) || 0;
      const mRev = parseFloat(row[idx('meta ads revenue')]) || 0;
      const msSpend = parseFloat(row[idx('microsoft ads spend')]) || 0;
      const msRev = parseFloat(row[idx('microsoft ads revenue')]) || 0;
      
      const impressions = parseInt(row[idx('impressions')]) || 0;
      const clicks = parseInt(row[idx('clicks')]) || 0;
      const conversions = parseInt(row[idx('conversions')]) || 0;
      const revenue = parseFloat(row[idx('revenue')]) || 0;
      
      const spend = gSpend + mSpend + msSpend;

      // Insert into detailed campaigns table
      await db.execute(`
        INSERT INTO campaign_performance (campaign_name, campaign_type, spend, revenue, impressions, clicks, conversions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [campName, campType, spend, revenue, impressions, clicks, conversions]);

      // Aggregate daily
      if (!dailyAggregates[date]) {
        dailyAggregates[date] = {
          googleSpend: 0, googleRevenue: 0,
          metaSpend: 0, metaRevenue: 0,
          msftSpend: 0, msftRevenue: 0,
          impressions: 0, clicks: 0, conversions: 0, totalRevenue: 0
        };
      }

      const agg = dailyAggregates[date];
      agg.googleSpend += gSpend;
      agg.googleRevenue += gRev;
      agg.metaSpend += mSpend;
      agg.metaRevenue += mRev;
      agg.msftSpend += msSpend;
      agg.msftRevenue += msRev;
      agg.impressions += impressions;
      agg.clicks += clicks;
      agg.conversions += conversions;
      agg.totalRevenue += revenue;
    }

    // Insert aggregated rows into DB
    const dates = Object.keys(dailyAggregates).sort();
    for (const d of dates) {
      const agg = dailyAggregates[d];
      const totalSpend = agg.googleSpend + agg.metaSpend + agg.msftSpend;
      const totalRoas = totalSpend > 0 ? agg.totalRevenue / totalSpend : 0;

      await db.execute(`
        INSERT INTO marketing_data (date, google_spend, google_revenue, meta_spend, meta_revenue, msft_spend, msft_revenue, impressions, clicks, conversions, total_revenue, total_roas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [d, agg.googleSpend, agg.googleRevenue, agg.metaSpend, agg.metaRevenue, agg.msftSpend, agg.msftRevenue, agg.impressions, agg.clicks, agg.conversions, agg.totalRevenue, totalRoas]);
    }

    res.json({
      message: 'CSV validated and uploaded successfully.',
      recordsInserted: dates.length,
      campaignsInserted: parsedRows.length - 1
    });

  } catch (err: any) {
    res.status(500).json({ error: `File processing failed: ${err.message}` });
  }
});

// -------------------------------------------------------------
// Forecast & Simulation Endpoints
// -------------------------------------------------------------
app.post('/api/forecast', async (req, res) => {
  const { period, googleBudget, metaBudget, msftBudget } = req.body;
  
  if (!period || googleBudget === undefined || metaBudget === undefined || msftBudget === undefined) {
    return res.status(400).json({ error: 'Forecast period and marketing budgets are required.' });
  }

  try {
    const db = await dbManager.getConnection();
    const rows = await db.query('SELECT * FROM marketing_data ORDER BY date ASC');
    
    if (!rows || rows.length < 7) {
      return res.status(400).json({ error: 'Insufficient historical data. Please seed sample data or upload a valid CSV first.' });
    }

    const history: HistoricalRow[] = rows.map((r: any) => ({
      date: r.date,
      googleSpend: r.google_spend,
      googleRevenue: r.google_revenue,
      metaSpend: r.meta_spend,
      metaRevenue: r.meta_revenue,
      msftSpend: r.msft_spend,
      msftRevenue: r.msft_revenue,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      totalRevenue: r.total_revenue,
      totalRoas: r.total_roas
    }));

    const result = runForecasting(history, {
      period: parseInt(period),
      googleBudget: parseFloat(googleBudget),
      metaBudget: parseFloat(metaBudget),
      msftBudget: parseFloat(msftBudget)
    });

    // Save run audit log in DB
    const sum = result.summary;
    const today = new Date().toISOString().split('T')[0];
    await db.execute(`
      INSERT INTO forecast_runs (run_date, forecast_period, google_budget, meta_budget, msft_budget, expected_revenue, expected_roas, min_revenue, max_revenue, confidence_interval, accuracy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [today, period, googleBudget, metaBudget, msftBudget, sum.expectedRevenue, sum.expectedRoas, sum.minRevenue, sum.maxRevenue, sum.confidenceInterval, sum.accuracy]);

    res.json(result);

  } catch (err: any) {
    res.status(500).json({ error: `Forecasting run failed: ${err.message}` });
  }
});

// Budget Simulator Endpoint (instant adjustments)
app.post('/api/simulate', async (req, res) => {
  const { googleBudget, metaBudget, msftBudget } = req.body;

  try {
    const db = await dbManager.getConnection();
    const rows = await db.query('SELECT * FROM marketing_data ORDER BY date ASC');
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'No historical database found.' });
    }

    // Standard high-speed simulator using platform attribution multipliers based on recent data
    // We compute average platform ROAS based on history
    let gSpendSum = 0, gRevSum = 0;
    let mSpendSum = 0, mRevSum = 0;
    let msSpendSum = 0, msRevSum = 0;

    for (const r of rows) {
      gSpendSum += r.google_spend; gRevSum += r.google_revenue;
      mSpendSum += r.meta_spend; mRevSum += r.meta_revenue;
      msSpendSum += r.msft_spend; msRevSum += r.microsoft_revenue || r.msft_revenue;
    }

    // Base ROAS (adding small numbers to prevent division by zero)
    const googleRoasBase = gSpendSum > 0 ? gRevSum / gSpendSum : 3.8;
    const metaRoasBase = mSpendSum > 0 ? mRevSum / mSpendSum : 2.9;
    const msftRoasBase = msSpendSum > 0 ? msRevSum / msSpendSum : 3.2;

    // Diminishing returns curve simulation: ROAS drops slightly at scale
    const calcDiminishingRoas = (spend: number, baseRoas: number, historicalTotalSpend: number) => {
      const avgDaily = (historicalTotalSpend / rows.length) || 500;
      if (spend <= 0) return 0;
      const ratio = spend / avgDaily;
      // Scale multiplier: if spend is double the average, ROAS drops by roughly 10%
      const decayMultiplier = Math.max(0.5, 1 - 0.08 * Math.log(Math.max(1, ratio)));
      return baseRoas * decayMultiplier;
    };

    const gRoas = calcDiminishingRoas(googleBudget, googleRoasBase, gSpendSum);
    const mRoas = calcDiminishingRoas(metaBudget, metaRoasBase, mSpendSum);
    const msRoas = calcDiminishingRoas(msftBudget, msftRoasBase, msSpendSum);

    const gRev = googleBudget * gRoas;
    const mRev = metaBudget * mRoas;
    const msRev = msftBudget * msRoas;

    const totalSpend = googleBudget + metaBudget + msftBudget;
    const totalRev = gRev + mRev + msRev;
    const overallRoas = totalSpend > 0 ? totalRev / totalSpend : 0;

    res.json({
      estimatedRevenue: Math.round(totalRev * 100) / 100,
      estimatedRoas: Math.round(overallRoas * 100) / 100,
      googleRevenue: Math.round(gRev * 100) / 100,
      metaRevenue: Math.round(mRev * 100) / 100,
      msftRevenue: Math.round(msRev * 100) / 100,
      googleRoas: Math.round(gRoas * 100) / 100,
      metaRoas: Math.round(mRoas * 100) / 100,
      msftRoas: Math.round(msRoas * 100) / 100,
      budgetEfficiency: overallRoas > 3.0 ? 'High' : overallRoas > 2.0 ? 'Optimal' : 'Low Efficiency'
    });
  } catch (err: any) {
    res.status(500).json({ error: `Simulation run failed: ${err.message}` });
  }
});

// AI Insights Generator endpoint
app.post('/api/insights', async (req, res) => {
  const { forecast, apiKey } = req.body;
  if (!forecast) {
    return res.status(400).json({ error: 'Forecast payload is required to compile insights.' });
  }

  try {
    const db = await dbManager.getConnection();
    const rows = await db.query('SELECT * FROM marketing_data ORDER BY date ASC');
    
    const history: HistoricalRow[] = rows.map((r: any) => ({
      date: r.date,
      googleSpend: r.google_spend,
      googleRevenue: r.google_revenue,
      metaSpend: r.meta_spend,
      metaRevenue: r.meta_revenue,
      msftSpend: r.msft_spend,
      msftRevenue: r.msft_revenue,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      totalRevenue: r.total_revenue,
      totalRoas: r.total_roas
    }));

    const insights = await generateAIInsights(history, forecast, apiKey);
    res.json(insights);
  } catch (err: any) {
    res.status(500).json({ error: `Insights failed to compile: ${err.message}` });
  }
});

// -------------------------------------------------------------
// Reports Downloads Endpoints
// -------------------------------------------------------------
app.post('/api/download-csv', (req, res) => {
  const { dailyForecast } = req.body;
  if (!dailyForecast || !Array.isArray(dailyForecast)) {
    return res.status(400).json({ error: 'Forecast metrics are required.' });
  }

  try {
    const csvContent = generateCSVReport(dailyForecast);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=marketing_forecast_report.csv');
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ error: `CSV download failed: ${err.message}` });
  }
});

app.post('/api/download-pdf', async (req, res) => {
  const { forecast, insights } = req.body;
  if (!forecast || !insights) {
    return res.status(400).json({ error: 'Forecast and AI insights data are required to build a PDF.' });
  }

  try {
    const pdfBuffer = await generatePDFReport(forecast, insights);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=marketing_forecast_report.pdf');
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: `PDF creation failed: ${err.message}` });
  }
});

// -------------------------------------------------------------
// Server Start
// -------------------------------------------------------------
app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
