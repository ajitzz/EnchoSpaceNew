import re

with open('App.tsx', 'r') as f:
    content = f.read()

# Replace the H1
new_h1 = """<h1 className="text-3xl md:text-5xl font-display font-extrabold text-canvas tracking-tight mb-2">
                         {city === 'Anywhere' ? "Where are we going, friend?" : `Find somewhere worth going in ${city}`}
                      </h1>"""

content = re.sub(
    r'<h1 className="text-2xl md:text-3xl font-extrabold text-canvas tracking-tight">Places to stay in \{city\}<\/h1>',
    new_h1,
    content
)

with open('App.tsx', 'w') as f:
    f.write(content)
