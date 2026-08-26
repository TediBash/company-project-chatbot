import pandas as pd
import re
import uuid
from sqlalchemy import create_engine

# --- CONFIGURATION ---
# Replace with your actual PostgreSQL credentials
DB_USER = "postgres"
DB_PASS = "tedidb"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "MachineChatbot"

EXCEL_FILE = "AROL_Q2_synthetic_fleet_dataset.xlsx"

# Map the Excel sheets to their target DB schemas and table names.
# Adjust the schema or table names below if your database differs.
TABLE_MAPPING = {
    "Companies": {"schema": "app_tenant", "table": "companies"},
    "Users": {"schema": "app_tenant", "table": "users"},
    "MachineModels": {"schema": "app_tenant", "table": "machine_models"},
    "Machines": {"schema": "app_tenant", "table": "machines"},
    "Quotes": {"schema": "app_commercial", "table": "quotes"},
    "QuoteRevisions": {"schema": "app_commercial", "table": "quote_revisions"},
    "QuoteLines": {"schema": "app_commercial", "table": "quote_lines"},
    "Orders": {"schema": "app_commercial", "table": "orders"},
    "OrderLines": {"schema": "app_commercial", "table": "order_lines"},
    "TelemetrySnapshots": {"schema": "app_operational", "table": "telemetry_snapshots"},
    "Alarms": {"schema": "app_operational", "table": "alarms"},
    "MaintenanceTickets": {"schema": "app_operational", "table": "maintenance_tickets"}
}

COLUMN_RENAME_MAP = {
    "quote_revisions": {"quote_revision_id": "revision_id"}, # Change to "id" if your DB uses id
    "quote_lines": {"quote_line_id": "line_id"},             # Change to "id" if your DB uses id
    "order_lines": {"order_line_id": "line_id"},             # Change to "id" if your DB uses id
}

def camel_to_snake(name):
    """Converts camelCase to snake_case."""
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

def generate_deterministic_uuid(text_id):
    """Converts a string like 'CMP-001' into a valid, repeatable UUID."""
    if pd.isna(text_id) or not str(text_id).strip():
        return None
    # Using a DNS namespace ensures the same string always yields the same UUID
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, str(text_id).strip()))

def load_data_to_db():
    db_url = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(db_url)
    
    print(f"Loading data from {EXCEL_FILE}...")
    
    try:
        xls = pd.ExcelFile(EXCEL_FILE)
    except Exception as e:
        print(f"Error reading Excel file: {e}")
        return

    for sheet_name, db_info in TABLE_MAPPING.items():
        if sheet_name not in xls.sheet_names:
            continue
            
        table_name = db_info['table']
        schema_name = db_info['schema']
        print(f"Processing sheet: {sheet_name} -> {schema_name}.{table_name}")
        
        df = pd.read_excel(xls, sheet_name=sheet_name)
        df.columns = [camel_to_snake(col) for col in df.columns]
        
        # 1. Apply specific column renaming for this table (if any)
        if table_name in COLUMN_RENAME_MAP:
            df.rename(columns=COLUMN_RENAME_MAP[table_name], inplace=True)
        
        # 2. Convert all string IDs to UUIDs (applies to columns ending in '_id')
        for col in df.columns:
            if col.endswith('_id'):
                df[col] = df[col].apply(generate_deterministic_uuid)
                
        # Insert into PostgreSQL
        try:
            df.to_sql(
                name=table_name,
                con=engine,
                schema=schema_name,
                if_exists='append',
                index=False
            )
            print(f"  ✓ Successfully loaded {len(df)} rows.")
        except Exception as e:
            print(f"  X Error loading {sheet_name}: {e}")

if __name__ == "__main__":
    load_data_to_db()