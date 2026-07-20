with open('.env.example', 'r') as f:
    content = f.read()

content = content.replace('META_ACCESS_TOKEN=', 'META_ACCESS_TOKEN=\nMETA_PAGE_ID=\nMETA_INSTAGRAM_ACCOUNT_ID=')

with open('.env.example', 'w') as f:
    f.write(content)
