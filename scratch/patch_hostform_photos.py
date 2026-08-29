import re

with open('components/HostForm.tsx', 'r') as f:
    content = f.read()

pattern = r'specs: photo\.specs \|\| \'\'\n          \}\);'
new_code = """specs: photo.specs || '',
            lightingTime: photo.lightingTime || '',
            isHero: photo.isHero || false
          });"""
content = re.sub(pattern, new_code, content)

with open('components/HostForm.tsx', 'w') as f:
    f.write(content)
print("Patched HostForm spatialPhotos payload")
