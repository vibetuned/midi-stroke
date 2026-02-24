import os
import json

def generate_json_for_instrument(instrument_name):
    public_dir = os.path.join(os.getcwd(), 'public')
    target_dir = os.path.join(public_dir, instrument_name)
    output_json = os.path.join(public_dir, f'{instrument_name}_files.json')
    
    mei_files = []
    
    if not os.path.exists(target_dir):
        print(f"Directory {target_dir} not found. Skipping {instrument_name}.")
        return

    # Walk through the target directory
    for root, dirs, files in os.walk(target_dir):
        for file in files:
            if file.endswith('.mei'):
                # Get relative path from public directory
                rel_path = os.path.relpath(root, public_dir)
                
                entry = {
                    "path": rel_path if rel_path != '.' else "",
                    "name": file
                }
                mei_files.append(entry)
    
    # Sort by path then name for deterministic output
    mei_files.sort(key=lambda x: (x['path'], x['name']))
    
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(mei_files, f, indent=2, ensure_ascii=False)
        
    print(f"Updated {output_json} with {len(mei_files)} entries.")

def main():
    instruments = ['piano', 'drums']
    for inst in instruments:
        generate_json_for_instrument(inst)

if __name__ == "__main__":
    main()
