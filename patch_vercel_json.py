import json

with open('vercel.json', 'r') as f:
    data = json.load(f)

data["functions"] = {
    "api/**/*.ts": {
        "maxDuration": 60
    },
    "api/index.ts": {
        "maxDuration": 60
    }
}

with open('vercel.json', 'w') as f:
    json.dump(data, f, indent=2)

print("Patched vercel.json")
