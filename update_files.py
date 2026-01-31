import os
import json

def update_files_json():
    public_dir = os.path.join(os.getcwd(), 'public')
    files_json_path = os.path.join(public_dir, 'files.json')
    
    mei_files = []
    
    # Walk through the public directory
    for root, dirs, files in os.walk(public_dir):
        for file in files:
            if file.endswith('.mei'):
                # Get relative path from public directory
                rel_path = os.path.relpath(root, public_dir)
                
                # If the file is directly in public, rel_path will be '.', we might want to handle that
                # strictly speaking based on the existing json, it seems to expect subdirectories.
                # If rel_path is '.', it means it's in the root public folder.
                # The existing JSON shows "path": "first_two_hand_exercises", so it expects theFolderName.
                
                entry = {
                    "path": rel_path if rel_path != '.' else "",
                    "name": file
                }
                mei_files.append(entry)
    
    # Sort by path then name for deterministic output
    mei_files.sort(key=lambda x: (x['path'], x['name']))
    
    with open(files_json_path, 'w', encoding='utf-8') as f:
        json.dump(mei_files, f, indent=2, ensure_ascii=False)
        
    print(f"Updated {files_json_path} with {len(mei_files)} entries.")

if __name__ == "__main__":
    update_files_json()
