import math
import os
import pandas as pd
import numpy as np

# Resolve default data paths relative to this file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_EXCEL_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "DATA BHOPAL ZONE.xlsx"))
DEFAULT_CSV_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "QA Reports - New - ATR Report (3).csv"))


def sanitize_records(records: list) -> list:
    """
    Replace any float NaN / Inf values in a list of dicts with None
    so that the result is safe for JSON serialization.
    """
    def _clean(val):
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        if isinstance(val, dict):
            return {k: _clean(v) for k, v in val.items()}
        if isinstance(val, list):
            return [_clean(v) for v in val]
        return val

    return [_clean(record) for record in records]

def load_outlets(file_path=None):
    """
    Loads outlets from DATA BHOPAL ZONE.xlsx
    Columns: Customer Number, Customer Name, LAT, LON, SBU, Zone, Regional Office, 
             Sales Area, Last Inspection Date, District, Inspection Gap (Years), Outlets Never Inspected
    """
    if file_path is None:
        file_path = DEFAULT_EXCEL_PATH
        
    if not os.path.exists(file_path):
        # Fallback to local workspace if directory structure differs
        file_path = "DATA BHOPAL ZONE.xlsx"
        
    df = pd.read_excel(file_path)
    
    # Clean data
    df['Customer Number'] = df['Customer Number'].astype(int)
    df['Customer Name'] = df['Customer Name'].astype(str).str.strip()
    df['LAT'] = pd.to_numeric(df['LAT'], errors='coerce')
    df['LON'] = pd.to_numeric(df['LON'], errors='coerce')
    df['SBU'] = df['SBU'].astype(str).str.strip()
    df['Zone'] = df['Zone'].astype(str).str.strip()
    df['Regional Office'] = df['Regional Office'].astype(str).str.strip()
    df['Sales Area'] = df['Sales Area'].astype(str).str.strip()
    
    # Handle Inspection Gap
    # If it is NaN, use 0 or None (JSON serialization likes None)
    df['Inspection Gap (Years)'] = df['Inspection Gap (Years)'].replace({np.nan: None})
    
    # Outlets Never Inspected: bool
    df['Outlets Never Inspected'] = df['Outlets Never Inspected'].astype(bool)
    
    # District
    df['District'] = df['District'].astype(str).str.strip().str.upper()
    
    # Clean last inspection date (convert datetime objects to string or format them nicely)
    df['Last Inspection Date'] = df['Last Inspection Date'].apply(
        lambda x: x.strftime('%Y-%m-%d') if isinstance(x, pd.Timestamp) else str(x).strip()
    )
    
    # Filter out rows with invalid coordinates
    df = df.dropna(subset=['LAT', 'LON'])
    
    return sanitize_records(df.to_dict(orient='records'))

def load_qa_reports(file_path=None):
    """
    Loads QA reports from QA Reports - New - ATR Report (3).csv
    Columns: Inspection Month, Zone, Regional Office, State, Sales Area, Outlet ID, 
             Outlet Name, Date, Severity, Observation, ATR, Penality, Remark, 
             Original Compilance, Current Compliance
    """
    if file_path is None:
        file_path = DEFAULT_CSV_PATH
        
    if not os.path.exists(file_path):
        # Fallback to local workspace
        file_path = "QA Reports - New - ATR Report (3).csv"
        
    # Read tab separated utf-16 encoded file
    df = pd.read_csv(file_path, sep='\t', encoding='utf-16')
    
    # Strip spaces from column names
    df.columns = [col.strip() for col in df.columns]
    
    # If there is a trailing empty column like 'Unnamed: 15', drop it
    if 'Unnamed: 15' in df.columns:
        df = df.drop(columns=['Unnamed: 15'])
        
    # Standardize data types
    df['Outlet ID'] = pd.to_numeric(df['Outlet ID'], errors='coerce').replace({np.nan: 0}).astype(int)
    df['Outlet Name'] = df['Outlet Name'].astype(str).str.strip()
    df['Inspection Month'] = df['Inspection Month'].astype(str).str.strip()
    df['Zone'] = df['Zone'].astype(str).str.strip()
    df['Regional Office'] = df['Regional Office'].astype(str).str.strip()
    df['State'] = df['State'].astype(str).str.strip()
    df['Sales Area'] = df['Sales Area'].astype(str).str.strip()
    df['Date'] = df['Date'].astype(str).str.strip()
    
    # Severity
    df['Severity'] = df['Severity'].astype(str).str.strip()
    df['Severity'] = df['Severity'].replace({'nan': 'Others', '': 'Others'})
    
    # Text columns
    df['Observation'] = df['Observation'].fillna('').astype(str).str.strip()
    df['ATR'] = df['ATR'].fillna('').astype(str).str.strip()
    df['Remark'] = df['Remark'].fillna('').astype(str).str.strip()
    
    # Penality - fill NaN with 0
    df['Penality'] = pd.to_numeric(df['Penality'], errors='coerce').fillna(0.0)
    
    # Compliance fields
    df['Original Compilance'] = df['Original Compilance'].astype(str).str.strip().replace({'nan': 'NC'})
    df['Current Compliance'] = df['Current Compliance'].astype(str).str.strip().replace({'nan': 'NC'})
    
    # Return as records (sanitize any remaining NaN/inf floats for JSON safety)
    return sanitize_records(df.to_dict(orient='records'))

if __name__ == '__main__':
    print("Testing data loader...")
    try:
        outlets = load_outlets()
        print(f"Successfully loaded {len(outlets)} outlets from Excel.")
        print("Sample outlet:", outlets[0])
    except Exception as e:
        print("Error loading outlets:", e)
        
    try:
        qa = load_qa_reports()
        print(f"Successfully loaded {len(qa)} QA reports from CSV.")
        print("Sample QA report:", qa[0])
    except Exception as e:
        print("Error loading QA reports:", e)
