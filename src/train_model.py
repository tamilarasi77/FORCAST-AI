import os
import pickle
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# Ensure target directories exist
os.makedirs("data", exist_ok=True)
os.makedirs("pickle", exist_ok=True)

def generate_sample_data(days=180):
    """Generates synthetic daily campaign data with google, meta, and msft spends/revenues."""
    np.random.seed(42)
    start_date = pd.to_datetime("2026-01-01")
    date_range = pd.date_range(start=start_date, periods=days)
    
    records = []
    campaign_templates = [
        {"name": "Google Search - Brand", "type": "Search", "channel": "google", "base_spend": 300, "base_roas": 4.5, "ctr": 0.08, "cvr": 0.05},
        {"name": "Google Performance Max - Core", "type": "PMax", "channel": "google", "base_spend": 500, "base_roas": 3.2, "ctr": 0.02, "cvr": 0.025},
        {"name": "Meta Prospecting - Lookalike", "type": "Social", "channel": "meta", "base_spend": 600, "base_roas": 2.8, "ctr": 0.015, "cvr": 0.02},
        {"name": "Meta Retargeting - DABA", "type": "Social", "channel": "meta", "base_spend": 250, "base_roas": 5.2, "ctr": 0.035, "cvr": 0.06},
        {"name": "Microsoft Search - Generic", "type": "Search", "channel": "msft", "base_spend": 100, "base_roas": 3.5, "ctr": 0.05, "cvr": 0.03}
    ]
    
    for current_date in date_range:
        day_of_week = current_date.weekday()
        # Seasonality: higher sales Tuesday-Wednesday, lower on Saturdays
        seasonality = 1.0
        if day_of_week in [1, 2]:  # Tue, Wed
            seasonality = 1.15
        elif day_of_week == 5:     # Sat
            seasonality = 0.8
            
        # Salary cycle peak (end and start of month)
        day_of_month = current_date.day
        if day_of_month >= 28 or day_of_month <= 3:
            seasonality *= 1.12
            
        for camp in campaign_templates:
            noise = np.random.uniform(0.9, 1.1)
            spend = np.round(camp["base_spend"] * np.random.uniform(0.85, 1.15), 2)
            cpm = 12 if camp["channel"] == "google" else (16 if camp["channel"] == "meta" else 8)
            impressions = int((spend / cpm) * 1000)
            clicks = int(impressions * camp["ctr"] * np.random.uniform(0.9, 1.1))
            conversions = int(clicks * camp["cvr"] * np.random.uniform(0.85, 1.15))
            
            revenue = np.round(spend * camp["base_roas"] * seasonality * noise, 2)
            roas = np.round(revenue / spend, 2) if spend > 0 else 0.0
            
            records.append({
                "Date": current_date.strftime("%Y-%m-%d"),
                "Google Ads Spend": spend if camp["channel"] == "google" else 0.0,
                "Google Ads Revenue": revenue if camp["channel"] == "google" else 0.0,
                "Meta Ads Spend": spend if camp["channel"] == "meta" else 0.0,
                "Meta Ads Revenue": revenue if camp["channel"] == "meta" else 0.0,
                "Microsoft Ads Spend": spend if camp["channel"] == "msft" else 0.0,
                "Microsoft Ads Revenue": revenue if camp["channel"] == "msft" else 0.0,
                "Campaign": camp["name"],
                "Campaign Type": camp["type"],
                "Impressions": impressions,
                "Clicks": clicks,
                "Conversions": conversions,
                "Revenue": revenue,
                "ROAS": roas
            })
            
    df = pd.DataFrame(records)
    df.to_csv("data/historical_data.csv", index=False)
    print("Generated data/historical_data.csv successfully.")
    return df

def train_model(df):
    """Preprocesses data, extracts features, and trains the model pipeline."""
    # Aggregate daily for training standard metrics
    daily_df = df.groupby("Date").agg({
        "Google Ads Spend": "sum",
        "Meta Ads Spend": "sum",
        "Microsoft Ads Spend": "sum",
        "Revenue": "sum"
    }).reset_index()
    
    # Feature extraction
    daily_df["Date"] = pd.to_datetime(daily_df["Date"])
    daily_df["DayOfWeek"] = daily_df["Date"].dt.dayofweek
    daily_df["DayOfMonth"] = daily_df["Date"].dt.day
    daily_df["TotalSpend"] = daily_df["Google Ads Spend"] + daily_df["Meta Ads Spend"] + daily_df["Microsoft Ads Spend"]
    
    # Target and features
    X = daily_df[["Google Ads Spend", "Meta Ads Spend", "Microsoft Ads Spend", "DayOfWeek", "DayOfMonth", "TotalSpend"]]
    y = daily_df["Revenue"]
    
    # Simple Random Forest Regressor pipeline
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", RandomForestRegressor(n_estimators=30, random_state=42))
    ])
    
    pipeline.fit(X, y)
    
    # Save the model
    with open("pickle/model.pkl", "wb") as f:
        pickle.dump(pipeline, f)
    print("Trained and saved model to pickle/model.pkl.")

if __name__ == "__main__":
    df = generate_sample_data()
    train_model(df)
