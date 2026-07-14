#!/usr/bin/env bash
# NetElixir Automated Scoring pipeline entry point.
# Contract: ./run.sh <DATA_DIR> <MODEL_PATH> <OUTPUT_PATH>
# Sensible defaults applied if run with no arguments.

set -euo pipefail

# Accept positional arguments or fall back to defaults
DATA_DIR="${1:-./data}"
MODEL_PATH="${2:-./pickle/model.pkl}"
OUTPUT_PATH="${3:-./output/predictions.csv}"

# Display paths for audit logging
echo "========================================="
echo "  AIgition 3.0 E-commerce Forecast Run"
echo "========================================="
echo "Data Directory: $DATA_DIR"
echo "Model Path:     $MODEL_PATH"
echo "Output Path:    $OUTPUT_PATH"
echo "========================================="

# Create output parent directory if missing
mkdir -p "$(dirname "$OUTPUT_PATH")"

# Step 1: Feature Aggregation
echo "Step 1/2: Running feature extraction pipeline..."
python src/generate_features.py \
  --data-dir "$DATA_DIR" \
  --out features.parquet

# Step 2: Model Prediction Inference
echo "Step 2/2: Running model inference and aggregate forecasting..."
python src/predict.py \
  --features features.parquet \
  --model "$MODEL_PATH" \
  --output "$OUTPUT_PATH"

echo "Done. Aggregate predictions successfully written to $OUTPUT_PATH."
