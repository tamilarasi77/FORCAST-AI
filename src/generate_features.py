import os
import glob
import argparse
import pandas as pd

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True, help="Folder containing input CSV data")
    parser.add_argument("--out", required=True, help="Path to write the extracted features parquet file")
    return parser.parse_args()

def extract_features(data_dir, output_path):
    # Scan for CSV files
    csv_files = glob.glob(os.path.join(data_dir, "*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"No CSV datasets found in data directory: {data_dir}")
        
    # Read and concatenate all CSV files in the folder
    dfs = []
    for file_path in csv_files:
        try:
            df = pd.read_csv(file_path)
            dfs.append(df)
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            
    if not dfs:
        raise ValueError("Could not read any valid data from CSV files.")
        
    combined_df = pd.concat(dfs, ignore_index=True)
    
    # Standardize column casing
    combined_df.columns = [col.strip() for col in combined_df.columns]
    
    # 1. Store campaign-level attribution information as metadata in features file
    # We will write campaign aggregates into a sub-sheet or append it as rows, or serialize it.
    # To keep features.parquet simple for standard models, we'll output the aggregated daily spends,
    # and embed campaign weights as temporary extra columns or keep them.
    # Let's save daily aggregated metrics
    daily_df = combined_df.groupby("Date").agg({
        "Google Ads Spend": "sum",
        "Meta Ads Spend": "sum",
        "Microsoft Ads Spend": "sum",
        "Google Ads Revenue": "sum",
        "Meta Ads Revenue": "sum",
        "Microsoft Ads Revenue": "sum",
        "Impressions": "sum",
        "Clicks": "sum",
        "Conversions": "sum",
        "Revenue": "sum"
      }).reset_index()
      
    daily_df["Date"] = pd.to_datetime(daily_df["Date"])
    daily_df = daily_df.sort_values("Date").reset_index(drop=True)
    
    # Features
    daily_df["DayOfWeek"] = daily_df["Date"].dt.dayofweek
    daily_df["DayOfMonth"] = daily_df["Date"].dt.day
    daily_df["TotalSpend"] = daily_df["Google Ads Spend"] + daily_df["Meta Ads Spend"] + daily_df["Microsoft Ads Spend"]
    
    # Write to parquet
    daily_df.to_parquet(output_path, index=False)
    print(f"Features successfully written to {output_path}. Total records: {len(daily_df)}")

if __name__ == "__main__":
    args = parse_args()
    extract_features(args.data_dir, args.out)
