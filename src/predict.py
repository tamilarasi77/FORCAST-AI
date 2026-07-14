import os
import pickle
import argparse
import numpy as np
import pandas as pd

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", required=True, help="Path to features parquet file")
    parser.add_argument("--model", required=True, help="Path to pickled model file")
    parser.add_argument("--output", required=True, help="Path to write the predictions CSV file")
    return parser.parse_args()

def predict_forecasts(features_path, model_path, output_path):
    # Load features
    df = pd.read_parquet(features_path)
    
    # Load pickled model
    with open(model_path, "rb") as f:
        model_pipeline = pickle.load(f)
        
    # Calculate historical baseline
    total_spend = df["Google Ads Spend"].sum() + df["Meta Ads Spend"].sum() + df["Microsoft Ads Spend"].sum()
    total_rev = df["Revenue"].sum()
    historical_roas = total_rev / total_spend if total_spend > 0 else 3.5
    
    # Platform attribution ratios from history
    g_spend = df["Google Ads Spend"].sum()
    m_spend = df["Meta Ads Spend"].sum()
    ms_spend = df["Microsoft Ads Spend"].sum()
    sum_spend = g_spend + m_spend + ms_spend or 1
    
    g_rev = df["Google Ads Revenue"].sum()
    m_rev = df["Meta Ads Revenue"].sum()
    ms_rev = df["Microsoft Ads Revenue"].sum()
    sum_rev = g_rev + m_rev + ms_rev or 1
    
    g_roas_base = g_rev / g_spend if g_spend > 0 else 4.0
    m_roas_base = m_rev / m_spend if m_spend > 0 else 3.0
    ms_roas_base = ms_rev / ms_spend if ms_spend > 0 else 3.2
    
    # Standard deviation of residuals for confidence bounds
    X_hist = df[["Google Ads Spend", "Meta Ads Spend", "Microsoft Ads Spend", "DayOfWeek", "DayOfMonth", "TotalSpend"]]
    y_hist = df["Revenue"]
    preds_hist = model_pipeline.predict(X_hist)
    residuals = y_hist - preds_hist
    std_dev = np.std(residuals) if len(residuals) > 0 else 1000.0
    
    # We will forecast for three aggregate periods: 30, 60, and 90 days.
    # We assume the average daily spends match the historical daily averages.
    avg_daily_g = df["Google Ads Spend"].mean()
    avg_daily_m = df["Meta Ads Spend"].mean()
    avg_daily_ms = df["Microsoft Ads Spend"].mean()
    avg_daily_total = avg_daily_g + avg_daily_m + avg_daily_ms
    
    records = []
    
    for period in [30, 60, 90]:
        # Generate virtual features for the forecast days
        forecast_dates = pd.date_range(start=df["Date"].max() + pd.Timedelta(days=1), periods=period)
        forecast_features = pd.DataFrame({
            "Google Ads Spend": [avg_daily_g] * period,
            "Meta Ads Spend": [avg_daily_m] * period,
            "Microsoft Ads Spend": [avg_daily_ms] * period,
            "DayOfWeek": forecast_dates.dayofweek,
            "DayOfMonth": forecast_dates.day,
            "TotalSpend": [avg_daily_total] * period
        })
        
        # Predict daily expected revenues
        daily_preds = model_pipeline.predict(forecast_features)
        
        # Aggregate forecasts
        expected_revenue = np.sum(daily_preds)
        total_period_spend = avg_daily_total * period
        
        # Probabilistic error bounds (Z=1.96 for 95% CI)
        # Scaled by square root of steps to account for cumulative forecasting uncertainty
        cumulative_uncertainty = std_dev * np.sqrt(period)
        min_revenue = max(0.0, expected_revenue - 1.96 * cumulative_uncertainty)
        max_revenue = expected_revenue + 1.96 * cumulative_uncertainty
        
        expected_roas = expected_revenue / total_period_spend if total_period_spend > 0 else historical_roas
        min_roas = min_revenue / total_period_spend if total_period_spend > 0 else historical_roas * 0.8
        max_roas = max_revenue / total_period_spend if total_period_spend > 0 else historical_roas * 1.2
        
        # Channel-level contribution forecasts
        google_share = np.round((g_rev / sum_rev) * 100, 1)
        meta_share = np.round((m_rev / sum_rev) * 100, 1)
        msft_share = np.round((ms_rev / sum_rev) * 100, 1)
        
        records.append({
            "Planning Period (Days)": period,
            "Total Budget Allocated": np.round(total_period_spend, 2),
            "Expected Revenue": np.round(expected_revenue, 2),
            "Min Revenue (95% CI)": np.round(min_revenue, 2),
            "Max Revenue (95% CI)": np.round(max_revenue, 2),
            "Expected ROAS": np.round(expected_roas, 2),
            "Min ROAS": np.round(min_roas, 2),
            "Max ROAS": np.round(max_roas, 2),
            "Google Rev Contribution %": google_share,
            "Meta Rev Contribution %": meta_share,
            "Microsoft Rev Contribution %": msft_share,
            "Google Expected ROAS": np.round(g_roas_base, 2),
            "Meta Expected ROAS": np.round(m_roas_base, 2),
            "Microsoft Expected ROAS": np.round(ms_roas_base, 2)
        })
        
    predictions_df = pd.DataFrame(records)
    
    # Ensure output folder exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Write output fresh
    predictions_df.to_csv(output_path, index=False)
    print(f"Predictions successfully written to {output_path}.")

if __name__ == "__main__":
    args = parse_args()
    predict_forecasts(args.features, args.model, args.output)
