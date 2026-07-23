import re

with open('App.tsx', 'r') as f:
    content = f.read()

new_settings = """  const [globalExperiencesSettings, setGlobalExperiencesSettings] = useState<any>({
      hero_title: 'Find Somewhere\\nWorth Going.',
      hero_subtitle: 'Explore curated journeys, secret hideaways, and unforgettable moments across the globe.',
      badge_text: 'The Amigove Collection',"""

content = re.sub(
    r'  const \[globalExperiencesSettings, setGlobalExperiencesSettings\] = useState<any>\(\{\s*hero_title: [^\n]+,\s*hero_subtitle: [^\n]+,\s*badge_text: [^\n]+,',
    new_settings,
    content
)

with open('App.tsx', 'w') as f:
    f.write(content)
