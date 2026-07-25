import pandas as pd
import json
import os

excel_file = "/Users/thanakonkhamwiset/Desktop/BAB12067/DB/ร้านคาเฟ่ ยอดขายจำลอง 2568-2569.xlsx"
json_file = os.path.join(os.path.dirname(__file__), "data.json")

def extract_data():
    try:
        # Read the excel file
        df = pd.read_excel(excel_file)
        
        # We know columns are: ['เดือน', 'อารีย์', 'เอกมัย', 'พระราม9', 'บางแค', 'รวม']
        # Let's convert it to a list of dictionaries
        data_records = df.to_dict(orient="records")
        
        # Prepare data structure for the dashboard
        dashboard_data = {
            "months": df['เดือน'].tolist(),
            "branches": {
                "Ari": df['อารีย์'].tolist(),
                "Ekkamai": df['เอกมัย'].tolist(),
                "Rama9": df['พระราม9'].tolist(),
                "BangKhae": df['บางแค'].tolist()
            },
            "total_monthly": df['รวม'].tolist()
        }
        
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(dashboard_data, f, ensure_ascii=False, indent=2)
            
        print(f"Data successfully extracted to {json_file}")
        
    except Exception as e:
        print(f"Error processing data: {e}")

if __name__ == "__main__":
    extract_data()
