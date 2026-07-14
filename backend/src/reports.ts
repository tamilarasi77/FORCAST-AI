import PDFDocument from 'pdfkit';
import { ForecastResult, DailyForecastPoint } from './forecaster';
import { BusinessInsights } from './insights';

// Generate CSV Report string
export function generateCSVReport(dailyForecast: DailyForecastPoint[]): string {
  const headers = [
    'Date',
    'Google Ads Spend',
    'Google Ads Revenue',
    'Meta Ads Spend',
    'Meta Ads Revenue',
    'Microsoft Ads Spend',
    'Microsoft Ads Revenue',
    'Predicted Impressions',
    'Predicted Clicks',
    'Predicted Conversions',
    'Expected Total Revenue',
    'Min Total Revenue',
    'Max Total Revenue',
    'Expected ROAS'
  ];

  const rows = dailyForecast.map(d => [
    d.date,
    d.googleSpend.toFixed(2),
    d.googleRevenue.toFixed(2),
    d.metaSpend.toFixed(2),
    d.metaRevenue.toFixed(2),
    d.msftSpend.toFixed(2),
    d.msftRevenue.toFixed(2),
    d.impressions,
    d.clicks,
    d.conversions,
    d.expectedRevenue.toFixed(2),
    d.minRevenue.toFixed(2),
    d.maxRevenue.toFixed(2),
    d.expectedRoas.toFixed(2)
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

// Generate PDF Report Buffer
export function generatePDFReport(
  forecast: ForecastResult,
  insights: BusinessInsights
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const summary = forecast.summary;

      // Color Palette (Indigo, Blue, Dark neutral)
      const primaryColor = '#6366f1'; // Indigo
      const secondaryColor = '#3b82f6'; // Blue
      const accentColor = '#8b5cf6'; // Purple
      const textDark = '#1f2937'; // Slate 800
      const textLight = '#6b7280'; // Slate 500
      const bgLight = '#f9fafb'; // Slate 50

      // --- PAGE 1: HEADER & KPI SUMMARY ---
      
      // Top Gradient Header Bar
      doc.rect(0, 0, doc.page.width, 120).fill(`non-zero`);
      // We can simulate gradient with simple color filled rect or solid primary
      doc.rect(0, 0, doc.page.width, 120).fill(primaryColor);
      
      // Draw secondary color accent band
      doc.rect(0, 115, doc.page.width, 5).fill(secondaryColor);

      // Title Text
      doc.fillColor('#ffffff');
      doc.font('Helvetica-Bold').fontSize(22).text('PROBABILISTIC REVENUE & ROAS FORECAST', 50, 40);
      doc.font('Helvetica').fontSize(11).text(`Generated: ${new Date().toLocaleDateString()}  |  AI Business Intelligence Report`, 50, 70);

      // Reset text color
      doc.fillColor(textDark);

      // Section: Executive Summary
      doc.font('Helvetica-Bold').fontSize(14).text('Executive Summary', 50, 150);
      doc.font('Helvetica').fontSize(10.5).lineGap(4).text(insights.executiveSummary, 50, 175, { width: 500 });
      doc.lineGap(0); // Reset lineGap

      // Section: KPI Grid
      doc.font('Helvetica-Bold').fontSize(14).text('Performance Forecast Summary', 50, 260);

      const drawKPICard = (x: number, y: number, w: number, h: number, title: string, value: string, subValue?: string) => {
        doc.rect(x, y, w, h).fillAndStroke(bgLight, '#e5e7eb');
        doc.fillColor(textLight).font('Helvetica-Bold').fontSize(9).text(title.toUpperCase(), x + 12, y + 12);
        doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(18).text(value, x + 12, y + 26);
        if (subValue) {
          doc.fillColor(textLight).font('Helvetica').fontSize(8.5).text(subValue, x + 12, y + 48);
        }
      };

      // Row 1 KPI
      drawKPICard(50, 285, 155, 65, 'Expected Revenue', `$${summary.expectedRevenue.toLocaleString()}`, `Range: $${Math.round(summary.minRevenue).toLocaleString()} - $${Math.round(summary.maxRevenue).toLocaleString()}`);
      drawKPICard(220, 285, 155, 65, 'Expected ROAS', `${summary.expectedRoas.toFixed(2)}x`, `Range: ${summary.minRoas.toFixed(2)}x - ${summary.maxRoas.toFixed(2)}x`);
      drawKPICard(390, 285, 155, 65, 'Total Ad Budget', `$${summary.totalSpend.toLocaleString()}`, `Avg: $${Math.round(summary.totalSpend / forecast.dailyForecast.length).toLocaleString()}/day`);

      // Row 2 KPI
      drawKPICard(50, 365, 155, 65, 'Forecast Model', summary.bestModel.split(' ')[0], `Accuracy: ${(summary.accuracy * 100).toFixed(0)}%`);
      drawKPICard(220, 365, 155, 65, 'Confidence Level', '95% (Probabilistic)', 'Standard Error Bounds');
      drawKPICard(390, 365, 155, 65, 'Forecast Period', `${forecast.dailyForecast.length} Days`, `Target: ${forecast.dailyForecast[forecast.dailyForecast.length-1].date}`);

      // Channel Contributions Table
      doc.fillColor(textDark).font('Helvetica-Bold').fontSize(12).text('Channel Attribution Predictions', 50, 460);
      
      const tableTop = 485;
      doc.rect(50, tableTop, 495, 20).fill(primaryColor);
      
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5);
      doc.text('Channel Name', 65, tableTop + 6);
      doc.text('Forecasted Contribution %', 220, tableTop + 6);
      doc.text('Performance Efficiency', 390, tableTop + 6);

      const drawTableRow = (y: number, channelName: string, contribution: string, efficiency: string) => {
        doc.rect(50, y, 495, 20).fillAndStroke(bgLight, '#e5e7eb');
        doc.fillColor(textDark).font('Helvetica').fontSize(9.5);
        doc.text(channelName, 65, y + 6);
        doc.text(contribution, 220, y + 6);
        doc.text(efficiency, 390, y + 6);
      };

      drawTableRow(tableTop + 20, 'Google Ads', `${summary.channelContributions.google}%`, 'High Efficiency (Targeting)');
      drawTableRow(tableTop + 40, 'Meta Ads', `${summary.channelContributions.meta}%`, 'Medium-High (Audience Scaling)');
      drawTableRow(tableTop + 60, 'Microsoft Ads', `${summary.channelContributions.msft}%`, 'Stable (Search Intent)');

      // Footer
      doc.fillColor(textLight).font('Helvetica').fontSize(8).text('Page 1 of 2  •  Forecast AI Marketing Intelligence Utility', 50, 780, { align: 'center' });


      // --- PAGE 2: INSIGHTS & RECOMMENDATIONS ---
      doc.addPage();
      
      // Page 2 header
      doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(16).text('AI Business Insights & Budget Optimization', 50, 50);
      doc.rect(50, 72, 495, 2).fill(secondaryColor);
      doc.fillColor(textDark);

      let currentY = 90;

      // Section: Key Growth Drivers
      doc.font('Helvetica-Bold').fontSize(12).text('Key Growth Drivers', 50, currentY);
      currentY += 18;
      
      doc.font('Helvetica').fontSize(9.5).fillColor(textDark);
      insights.positiveDrivers.forEach(bullet => {
        doc.text('•', 55, currentY);
        doc.text(bullet, 70, currentY, { width: 470 });
        currentY += doc.heightOfString(bullet, { width: 470 }) + 5;
      });

      currentY += 10;

      // Section: Marketing Recommendations
      doc.font('Helvetica-Bold').fontSize(12).text('Actionable Marketing Recommendations', 50, currentY);
      currentY += 18;

      insights.marketingRecommendations.forEach(bullet => {
        doc.text('•', 55, currentY);
        doc.text(bullet, 70, currentY, { width: 470 });
        currentY += doc.heightOfString(bullet, { width: 470 }) + 5;
      });

      currentY += 10;

      // Section: Budget Optimization Advice
      doc.font('Helvetica-Bold').fontSize(12).text('Budget Reallocation Strategy', 50, currentY);
      currentY += 18;

      insights.budgetOptimization.forEach(bullet => {
        doc.text('•', 55, currentY);
        doc.text(bullet, 70, currentY, { width: 470 });
        currentY += doc.heightOfString(bullet, { width: 470 }) + 5;
      });

      currentY += 10;

      // Section: Business Risks
      doc.font('Helvetica-Bold').fontSize(12).text('Potential Risk Factors', 50, currentY);
      currentY += 18;

      insights.risks.forEach(bullet => {
        doc.text('•', 55, currentY);
        doc.text(bullet, 70, currentY, { width: 470 });
        currentY += doc.heightOfString(bullet, { width: 470 }) + 5;
      });

      // Bottom disclaimer
      doc.rect(50, 710, 495, 45).fillAndStroke('#fef3c7', '#f59e0b');
      doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(8.5).text('DISCLAIMER ON PROBABILISTIC MODELS', 60, 716);
      doc.font('Helvetica').fontSize(8).text('Forecast outputs represent statistical probabilities based on historical performance inputs. Real-world performance may vary due to competitor budgets, search engine algorithm changes, and macro-economic factors.', 60, 728, { width: 475 });

      // Footer
      doc.fillColor(textLight).font('Helvetica').fontSize(8).text('Page 2 of 2  •  Forecast AI Marketing Intelligence Utility', 50, 780, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
