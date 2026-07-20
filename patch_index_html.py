with open('index.html', 'r') as f:
    content = f.read()

content = content.replace('<meta name="apple-mobile-web-app-capable" content="yes">', '<meta name="mobile-web-app-capable" content="yes">')

with open('index.html', 'w') as f:
    f.write(content)

print("Patched index.html")
