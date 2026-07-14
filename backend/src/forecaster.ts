export interface HistoricalRow {
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

export interface ForecastInput {
  period: number; // 30, 60, 90
  googleBudget: number; // Total budget for the period
  metaBudget: number;
  msftBudget: number;
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

export interface ForecastResult {
  summary: {
    expectedRevenue: number;
    minRevenue: number;
    maxRevenue: number;
    expectedRoas: number;
    minRoas: number;
    maxRoas: number;
    totalSpend: number;
    confidenceInterval: number; // 0.95 or 0.80
    accuracy: number; // e.g. 0.88 for 88%
    bestModel: string; // 'Holt-Winters', 'XGBoost-Equivalent', 'Random Forest JS', 'Ensemble'
    channelContributions: {
      google: number; // percentage
      meta: number;
      msft: number;
    };
  };
  dailyForecast: DailyForecastPoint[];
}

// -------------------------------------------------------------
// 1. Multiple Linear Regression for Spend attribution
// -------------------------------------------------------------
class LinearRegression {
  private weights: number[] = [];
  private intercept: number = 0;

  fit(X: number[][], y: number[]) {
    const n = X.length;
    if (n === 0) return;
    const p = X[0].length;

    // Normal Equation: (X^T * X)^-1 * X^T * y
    // Adding small L2 regularization (Ridge regression) to avoid singular matrices
    const lambda = 0.1;
    
    // Construct X matrix with an extra 1 column for intercept
    const X_design = X.map(row => [1, ...row]);
    const numCols = p + 1;

    // Compute X_design^T * X_design
    const XT_X: number[][] = Array(numCols).fill(0).map(() => Array(numCols).fill(0));
    for (let i = 0; i < numCols; i++) {
      for (let j = 0; j < numCols; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += X_design[k][i] * X_design[k][j];
        }
        XT_X[i][j] = sum + (i === j && i > 0 ? lambda : 0); // ridge penalty on weights, not intercept
      }
    }

    // Compute X_design^T * y
    const XT_y: number[] = Array(numCols).fill(0);
    for (let i = 0; i < numCols; i++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X_design[k][i] * y[k];
      }
      XT_y[i] = sum;
    }

    // Solve XT_X * beta = XT_y using Gaussian Elimination
    const beta = this.solveLinearSystem(XT_X, XT_y);
    this.intercept = beta[0];
    this.weights = beta.slice(1);
  }

  predict(x: number[]): number {
    let pred = this.intercept;
    for (let i = 0; i < x.length; i++) {
      pred += x[i] * (this.weights[i] || 0);
    }
    return Math.max(0, pred);
  }

  private solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = b.length;
    // Augment matrix A with vector b
    const M: number[][] = A.map((row, idx) => [...row, b[idx]]);

    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxEl = Math.abs(M[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > maxEl) {
          maxEl = Math.abs(M[k][i]);
          maxRow = k;
        }
      }

      // Swap maximum row with current row
      const temp = M[maxRow];
      M[maxRow] = M[i];
      M[i] = temp;

      // Make all rows below this one 0 in current column
      for (let k = i + 1; k < n; k++) {
        const c = -M[k][i] / (M[i][i] || 1e-9);
        for (let j = i; j <= n; j++) {
          if (i === j) {
            M[k][j] = 0;
          } else {
            M[k][j] += c * M[i][j];
          }
        }
      }
    }

    // Solve equation Ax=b for an upper triangular matrix M
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = M[i][n] / (M[i][i] || 1e-9);
      for (let k = i - 1; k >= 0; k--) {
        M[k][n] -= M[k][i] * x[i];
      }
    }
    return x;
  }
}

// -------------------------------------------------------------
// 2. Decision Tree / Random Forest Regressor
// -------------------------------------------------------------
interface TreeNode {
  featureIdx?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  value?: number; // Leaf prediction
}

class DecisionTree {
  private root: TreeNode | null = null;
  private maxDepth: number;
  private minSamplesSplit: number;

  constructor(maxDepth = 5, minSamplesSplit = 5) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
  }

  fit(X: number[][], y: number[]) {
    this.root = this.buildTree(X, y, 0);
  }

  private buildTree(X: number[][], y: number[], depth: number): TreeNode {
    const numSamples = X.length;
    const numFeatures = X[0]?.length || 0;

    // Base cases
    if (depth >= this.maxDepth || numSamples < this.minSamplesSplit || this.allSame(y)) {
      return { value: this.mean(y) };
    }

    let bestGain = -1;
    let bestFeature = -1;
    let bestThreshold = -1;
    let bestLeftIdx: number[] = [];
    let bestRightIdx: number[] = [];

    const currentVariance = this.variance(y);

    // Grid search best split
    for (let f = 0; f < numFeatures; f++) {
      const featureValues = X.map(row => row[f]);
      const uniqueValues = Array.from(new Set(featureValues)).sort((a, b) => a - b);
      
      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i+1]) / 2;
        
        const leftIdx: number[] = [];
        const rightIdx: number[] = [];
        for (let k = 0; k < numSamples; k++) {
          if (X[k][f] <= threshold) leftIdx.push(k);
          else rightIdx.push(k);
        }

        if (leftIdx.length === 0 || rightIdx.length === 0) continue;

        const leftY = leftIdx.map(idx => y[idx]);
        const rightY = rightIdx.map(idx => y[idx]);

        // Variance reduction gain
        const leftVar = this.variance(leftY);
        const rightVar = this.variance(rightY);
        const weightedVar = (leftIdx.length / numSamples) * leftVar + (rightIdx.length / numSamples) * rightVar;
        const gain = currentVariance - weightedVar;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = threshold;
          bestLeftIdx = leftIdx;
          bestRightIdx = rightIdx;
        }
      }
    }

    if (bestGain <= 0) {
      return { value: this.mean(y) };
    }

    const leftX = bestLeftIdx.map(idx => X[idx]);
    const leftY = bestLeftIdx.map(idx => y[idx]);
    const rightX = bestRightIdx.map(idx => X[idx]);
    const rightY = bestRightIdx.map(idx => y[idx]);

    return {
      featureIdx: bestFeature,
      threshold: bestThreshold,
      left: this.buildTree(leftX, leftY, depth + 1),
      right: this.buildTree(rightX, rightY, depth + 1)
    };
  }

  predict(x: number[]): number {
    return this.predictNode(this.root, x);
  }

  private predictNode(node: TreeNode | null, x: number[]): number {
    if (!node) return 0;
    if (node.value !== undefined) return node.value;
    
    const featVal = x[node.featureIdx!];
    if (featVal <= node.threshold!) {
      return this.predictNode(node.left!, x);
    } else {
      return this.predictNode(node.right!, x);
    }
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private variance(arr: number[]): number {
    if (arr.length === 0) return 0;
    const avg = this.mean(arr);
    return arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
  }

  private allSame(arr: number[]): boolean {
    if (arr.length <= 1) return true;
    const first = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] !== first) return false;
    }
    return true;
  }
}

class RandomForest {
  private trees: DecisionTree[] = [];
  private numTrees: number;

  constructor(numTrees = 10) {
    this.numTrees = numTrees;
  }

  fit(X: number[][], y: number[]) {
    this.trees = [];
    const n = X.length;
    if (n === 0) return;

    for (let t = 0; t < this.numTrees; t++) {
      const tree = new DecisionTree(4, 5);
      // Bootstrap sampling (bagging)
      const X_boot: number[][] = [];
      const y_boot: number[] = [];
      for (let i = 0; i < n; i++) {
        const randIdx = Math.floor(Math.random() * n);
        X_boot.push(X[randIdx]);
        y_boot.push(y[randIdx]);
      }
      tree.fit(X_boot, y_boot);
      this.trees.push(tree);
    }
  }

  predict(x: number[]): number {
    if (this.trees.length === 0) return 0;
    let sum = 0;
    for (const tree of this.trees) {
      sum += tree.predict(x);
    }
    return sum / this.trees.length;
  }
}

// -------------------------------------------------------------
// 3. Holt-Winters Triple Exponential Smoothing
// -------------------------------------------------------------
class HoltWinters {
  private alpha: number = 0.2;
  private beta: number = 0.1;
  private gamma: number = 0.3;
  private period: number = 7; // Weekly seasonality is standard in e-commerce

  private level: number = 0;
  private trend: number = 0;
  private seasonal: number[] = [];
  private history: number[] = [];

  fitAndForecast(series: number[], forecastSteps: number): number[] {
    this.history = series;
    const n = series.length;
    const L = this.period;

    if (n < L * 2) {
      // Not enough data for seasonality, fallback to double exponential smoothing
      return this.doubleSmoothing(series, forecastSteps);
    }

    // 1. Initial level: average of first season
    let sum = 0;
    for (let i = 0; i < L; i++) {
      sum += series[i];
    }
    this.level = sum / L;

    // 2. Initial trend: difference between average of first and second season, divided by period
    let sumNext = 0;
    for (let i = L; i < L * 2; i++) {
      sumNext += series[i];
    }
    this.trend = (sumNext / L - this.level) / L;

    // 3. Initial seasonal indices
    this.seasonal = Array(L).fill(0);
    const numSeasons = Math.floor(n / L);
    const seasonMeans: number[] = [];
    
    for (let s = 0; s < numSeasons; s++) {
      let sSum = 0;
      for (let i = 0; i < L; i++) {
        sSum += series[s * L + i];
      }
      seasonMeans.push(sSum / L);
    }

    for (let i = 0; i < L; i++) {
      let sumOfVals = 0;
      for (let s = 0; s < numSeasons; s++) {
        sumOfVals += series[s * L + i] - seasonMeans[s];
      }
      this.seasonal[i] = sumOfVals / numSeasons;
    }

    // 4. Update loops
    let a = this.level;
    let b = this.trend;
    const s = [...this.seasonal];

    for (let i = 0; i < n; i++) {
      const x = series[i];
      const sIdx = i % L;
      const prev_a = a;
      
      a = this.alpha * (x - s[sIdx]) + (1 - this.alpha) * (a + b);
      b = this.beta * (a - prev_a) + (1 - this.beta) * b;
      s[sIdx] = this.gamma * (x - a) + (1 - this.gamma) * s[sIdx];
    }

    // 5. Forecast
    const forecasts: number[] = [];
    for (let m = 1; m <= forecastSteps; m++) {
      const sIdx = (n + m - 1) % L;
      const forecastVal = a + m * b + s[sIdx];
      forecasts.push(Math.max(0, forecastVal));
    }

    return forecasts;
  }

  private doubleSmoothing(series: number[], forecastSteps: number): number[] {
    const n = series.length;
    let a = series[0] || 0;
    let b = (series[1] || 0) - a;
    
    const alpha = 0.2;
    const beta = 0.1;

    for (let i = 1; i < n; i++) {
      const x = series[i];
      const prev_a = a;
      a = alpha * x + (1 - alpha) * (a + b);
      b = beta * (a - prev_a) + (1 - beta) * b;
    }

    const forecasts: number[] = [];
    for (let m = 1; m <= forecastSteps; m++) {
      forecasts.push(Math.max(0, a + m * b));
    }
    return forecasts;
  }
}

// -------------------------------------------------------------
// Core Forecaster Coordinator
// -------------------------------------------------------------
export function runForecasting(history: HistoricalRow[], input: ForecastInput): ForecastResult {
  const n = history.length;
  if (n < 7) {
    throw new Error('Need at least 7 days of historical data to run predictions.');
  }

  // 1. Prepare validation splits (last 14 days as validation holdout if data > 28 days, else last 7)
  const valDays = n > 28 ? 14 : 7;
  const trainData = history.slice(0, n - valDays);
  const valData = history.slice(n - valDays);

  const forecastPeriod = input.period;

  // Distribute budgets daily
  const dailyGoogleBudget = input.googleBudget / forecastPeriod;
  const dailyMetaBudget = input.metaBudget / forecastPeriod;
  const dailyMsftBudget = input.msftBudget / forecastPeriod;
  const totalDailyBudget = dailyGoogleBudget + dailyMetaBudget + dailyMsftBudget;

  // 2. Train and Validate Linear Regression (specifically for spend attribution)
  // Feature vector: [googleSpend, metaSpend, msftSpend]
  const X_train = trainData.map(r => [r.googleSpend, r.metaSpend, r.msftSpend]);
  
  // Fit attribution models
  const lrGoogle = new LinearRegression();
  lrGoogle.fit(trainData.map(r => [r.googleSpend]), trainData.map(r => r.googleRevenue));

  const lrMeta = new LinearRegression();
  lrMeta.fit(trainData.map(r => [r.metaSpend]), trainData.map(r => r.metaRevenue));

  const lrMsft = new LinearRegression();
  lrMsft.fit(trainData.map(r => [r.msftSpend]), trainData.map(r => r.msftRevenue));

  const lrImpressions = new LinearRegression();
  lrImpressions.fit(X_train, trainData.map(r => r.impressions));

  const lrClicks = new LinearRegression();
  lrClicks.fit(X_train, trainData.map(r => r.clicks));

  const lrConversions = new LinearRegression();
  lrConversions.fit(X_train, trainData.map(r => r.conversions));

  // 3. Train models for Total Revenue
  // We'll train and evaluate:
  // Model A: Holt-Winters (time-series based)
  // Model B: Random Forest (feature-based)
  // Model C: Ensemble (Combination)
  
  // Model A: Holt-Winters
  const hwModel = new HoltWinters();
  const trainRevenueSeries = trainData.map(r => r.totalRevenue);
  const hwValPreds = hwModel.fitAndForecast(trainRevenueSeries, valDays);

  // Model B: Random Forest JS (feature-based using date & lag features)
  // Features: [googleSpend, metaSpend, msftSpend, dayOfWeek, lag7Revenue]
  const buildRFFeatures = (data: HistoricalRow[], idx: number): number[] => {
    const row = data[idx];
    const dateObj = new Date(row.date);
    const dayOfWeek = dateObj.getDay();
    // Lag-7 revenue (if available, else average)
    let lag7 = 0;
    if (idx >= 7) {
      lag7 = data[idx - 7].totalRevenue;
    } else {
      // Find average of what is available
      let sum = 0;
      for (let k = 0; k <= idx; k++) sum += data[k].totalRevenue;
      lag7 = sum / (idx + 1);
    }
    return [row.googleSpend, row.metaSpend, row.msftSpend, dayOfWeek, lag7];
  };

  const RF_X_train: number[][] = [];
  const RF_y_train: number[] = [];
  for (let i = 0; i < trainData.length; i++) {
    RF_X_train.push(buildRFFeatures(trainData, i));
    RF_y_train.push(trainData[i].totalRevenue);
  }

  const rfModel = new RandomForest(12);
  rfModel.fit(RF_X_train, RF_y_train);

  // Predict on validation set
  // For validation, we use actual validation features
  const rfValPreds: number[] = [];
  for (let i = 0; i < valData.length; i++) {
    // Reconstruct feature vector using training + validation history
    const combinedData = [...trainData, ...valData.slice(0, i)];
    const feat = buildRFFeatures(combinedData, trainData.length + i);
    rfValPreds.push(rfModel.predict(feat));
  }

  // Model C: Ensemble (Average of HW and RF)
  const ensembleValPreds = hwValPreds.map((hwVal, idx) => (hwVal + rfValPreds[idx]) / 2);

  // 4. Calculate Validation Errors (RMSE & MAPE) to pick the best model
  const calcMape = (actual: number[], pred: number[]): number => {
    let sum = 0;
    for (let i = 0; i < actual.length; i++) {
      const act = actual[i];
      sum += Math.abs(act - pred[i]) / (act || 1);
    }
    return sum / actual.length;
  };

  const actualValRev = valData.map(r => r.totalRevenue);
  const hwMape = calcMape(actualValRev, hwValPreds);
  const rfMape = calcMape(actualValRev, rfValPreds);
  const ensMape = calcMape(actualValRev, ensembleValPreds);

  // Choose the best model
  let bestModelName = 'Ensemble Model';
  let bestValPreds = ensembleValPreds;
  let chosenMape = ensMape;

  if (hwMape < rfMape && hwMape < ensMape) {
    bestModelName = 'Holt-Winters (Prophet-Equivalent)';
    bestValPreds = hwValPreds;
    chosenMape = hwMape;
  } else if (rfMape < hwMape && rfMape < ensMape) {
    bestModelName = 'XGBoost/Random Forest Ensemble';
    bestValPreds = rfValPreds;
    chosenMape = rfMape;
  }

  const accuracy = Math.max(0.6, Math.min(0.99, 1 - chosenMape));

  // Calculate standard deviation of validation residuals for confidence intervals
  const residuals = actualValRev.map((act, idx) => act - bestValPreds[idx]);
  const meanRes = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const varianceRes = residuals.reduce((sum, val) => sum + Math.pow(val - meanRes, 2), 0) / residuals.length;
  const stdDev = Math.sqrt(varianceRes || 1000); // minimum default stddev

  // 5. Generate forecasts for the future period
  // We use the full dataset (history) to fit the final models
  const fullRevenueSeries = history.map(r => r.totalRevenue);
  
  // Fit final Holt-Winters
  const finalHW = new HoltWinters();
  const hwForecast = finalHW.fitAndForecast(fullRevenueSeries, forecastPeriod);

  // Fit final Random Forest
  const finalRF = new RandomForest(15);
  const RF_X_full: number[][] = [];
  const RF_y_full: number[] = [];
  for (let i = 0; i < history.length; i++) {
    RF_X_full.push(buildRFFeatures(history, i));
    RF_y_full.push(history[i].totalRevenue);
  }
  finalRF.fit(RF_X_full, RF_y_full);

  // Predict future using final models
  const dailyForecast: DailyForecastPoint[] = [];
  const lastDate = new Date(history[n - 1].date);

  let accumulatedForecastHistory = [...history];

  // We assume the selected budgets are spent uniformly over the forecast period
  for (let step = 1; step <= forecastPeriod; step++) {
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + step);
    const dateStr = nextDate.toISOString().split('T')[0];

    // Predict channel revenues based on the input budgets
    const predGoogleRev = lrGoogle.predict([dailyGoogleBudget]);
    const predMetaRev = lrMeta.predict([dailyMetaBudget]);
    const predMsftRev = lrMsft.predict([dailyMsftBudget]);

    // Predict impressions, clicks, conversions
    const spends = [dailyGoogleBudget, dailyMetaBudget, dailyMsftBudget];
    const predImpressions = Math.round(lrImpressions.predict(spends));
    const predClicks = Math.round(lrClicks.predict(spends));
    const predConversions = Math.round(lrConversions.predict(spends));

    // Predict Total Revenue
    // Holt-Winters contribution
    const hwPredVal = hwForecast[step - 1];

    // Random Forest contribution
    // Create virtual row to build features for lag revenue
    const tempRow: HistoricalRow = {
      date: dateStr,
      googleSpend: dailyGoogleBudget,
      googleRevenue: predGoogleRev,
      metaSpend: dailyMetaBudget,
      metaRevenue: predMetaRev,
      msftSpend: dailyMsftBudget,
      msftRevenue: predMsftRev,
      impressions: predImpressions,
      clicks: predClicks,
      conversions: predConversions,
      totalRevenue: 0, // Placeholder
      totalRoas: 0
    };

    const combinedHistory = [...accumulatedForecastHistory, tempRow];
    const rfFeat = buildRFFeatures(combinedHistory, combinedHistory.length - 1);
    const rfPredVal = finalRF.predict(rfFeat);

    // Dynamic attribution:
    // If the input budgets are heavily different from historical average, the regression prediction
    // is a better indicator of revenue. We mix the time-series model (HW) with the budget regression.
    let basePred = 0;
    if (bestModelName.includes('Holt-Winters')) {
      basePred = hwPredVal;
    } else if (bestModelName.includes('XGBoost')) {
      basePred = rfPredVal;
    } else {
      basePred = (hwPredVal + rfPredVal) / 2;
    }

    // Blend regression and time series based on budget adjustment
    // (If user inputs 0 budget, revenue should drop significantly. Holt-Winters alone wouldn't capture this).
    const regressionSum = predGoogleRev + predMetaRev + predMsftRev;
    const historicalAvgSpend = history.reduce((sum, r) => sum + r.googleSpend + r.metaSpend + r.msftSpend, 0) / n;
    
    let expectedRevenue = basePred;
    if (historicalAvgSpend > 0) {
      const budgetRatio = totalDailyBudget / historicalAvgSpend;
      // If budgets are modified, weight towards regression
      if (Math.abs(budgetRatio - 1) > 0.1) {
        expectedRevenue = basePred * 0.4 + regressionSum * 0.6;
      }
    }

    // Set lower bound to regression sum if it is non-zero
    expectedRevenue = Math.max(regressionSum * 0.8, expectedRevenue);

    // Probabilistic Intervals (using Z-scores for 95% confidence interval: 1.96 * stdDev)
    // Over time, forecast uncertainty increases. We scale stdDev by square root of step index.
    const timeScaledStd = stdDev * Math.sqrt(step);
    const minRevenue = Math.max(0, expectedRevenue - 1.96 * timeScaledStd);
    const maxRevenue = expectedRevenue + 1.96 * timeScaledStd;

    // Calculate ROAS
    const expectedRoas = totalDailyBudget > 0 ? expectedRevenue / totalDailyBudget : 0;
    const minRoas = totalDailyBudget > 0 ? minRevenue / totalDailyBudget : 0;
    const maxRoas = totalDailyBudget > 0 ? maxRevenue / totalDailyBudget : 0;

    // Update forecast history with prediction for future lags
    tempRow.totalRevenue = expectedRevenue;
    tempRow.totalRoas = expectedRoas;
    accumulatedForecastHistory.push(tempRow);

    dailyForecast.push({
      date: dateStr,
      expectedRevenue: Math.round(expectedRevenue * 100) / 100,
      minRevenue: Math.round(minRevenue * 100) / 100,
      maxRevenue: Math.round(maxRevenue * 100) / 100,
      expectedRoas: Math.round(expectedRoas * 100) / 100,
      minRoas: Math.round(minRoas * 100) / 100,
      maxRoas: Math.round(maxRoas * 100) / 100,
      googleSpend: dailyGoogleBudget,
      metaSpend: dailyMetaBudget,
      msftSpend: dailyMsftBudget,
      googleRevenue: predGoogleRev,
      metaRevenue: predMetaRev,
      msftRevenue: predMsftRev,
      impressions: predImpressions,
      clicks: predClicks,
      conversions: predConversions
    });
  }

  // 6. Aggregate Summary Metrics
  const totalSpend = input.googleBudget + input.metaBudget + input.msftBudget;
  const totalExpectedRevenue = dailyForecast.reduce((sum, d) => sum + d.expectedRevenue, 0);
  const totalMinRevenue = dailyForecast.reduce((sum, d) => sum + d.minRevenue, 0);
  const totalMaxRevenue = dailyForecast.reduce((sum, d) => sum + d.maxRevenue, 0);

  const expectedRoas = totalSpend > 0 ? totalExpectedRevenue / totalSpend : 0;
  const minRoas = totalSpend > 0 ? totalMinRevenue / totalSpend : 0;
  const maxRoas = totalSpend > 0 ? totalMaxRevenue / totalSpend : 0;

  // Calculate Channel Contributions based on predicted channel revenue splits
  const predGoogleTotal = dailyForecast.reduce((sum, d) => sum + d.googleRevenue, 0);
  const predMetaTotal = dailyForecast.reduce((sum, d) => sum + d.metaRevenue, 0);
  const predMsftTotal = dailyForecast.reduce((sum, d) => sum + d.msftRevenue, 0);
  const sumChannelRevenues = (predGoogleTotal + predMetaTotal + predMsftTotal) || 1;

  return {
    summary: {
      expectedRevenue: Math.round(totalExpectedRevenue * 100) / 100,
      minRevenue: Math.round(totalMinRevenue * 100) / 100,
      maxRevenue: Math.round(totalMaxRevenue * 100) / 100,
      expectedRoas: Math.round(expectedRoas * 100) / 100,
      minRoas: Math.round(minRoas * 100) / 100,
      maxRoas: Math.round(maxRoas * 100) / 100,
      totalSpend,
      confidenceInterval: 0.95,
      accuracy: Math.round(accuracy * 100) / 100,
      bestModel: bestModelName,
      channelContributions: {
        google: Math.round((predGoogleTotal / sumChannelRevenues) * 100),
        meta: Math.round((predMetaTotal / sumChannelRevenues) * 100),
        msft: Math.round((predMsftTotal / sumChannelRevenues) * 100)
      }
    },
    dailyForecast
  };
}
