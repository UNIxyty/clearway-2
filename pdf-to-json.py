import camelot
import pandas as pd
import json

# === INPUT ===
PDF_FILE = "EETU_AIP_AD2.pdf"

# === STEP 1: Extract tables from PDF ===
tables = camelot.read_pdf(PDF_FILE, pages="all")

print(f"Found {tables.n} tables")

all_tables_json = []

# === STEP 2: Process each table ===
for i, table in enumerate(tables):
    df = table.df  # pandas DataFrame

    # Save CSV (optional)
    csv_filename = f"table_{i}.csv"
    df.to_csv(csv_filename, index=False)
    print(f"Saved {csv_filename}")

    # Convert to JSON
    json_data = df.to_dict(orient="records")
    all_tables_json.append(json_data)

# === STEP 3: Save combined JSON ===
with open("output.json", "w", encoding="utf-8") as f:
    json.dump(all_tables_json, f, indent=2, ensure_ascii=False)

print("Saved output.json")