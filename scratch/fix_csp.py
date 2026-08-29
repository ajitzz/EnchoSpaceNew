import re

with open('server.ts', 'r') as f:
    content = f.read()

# Add https://unpkg.com to styleSrc
style_src_pattern = r'styleSrc: \["\'self\'", "\'unsafe-inline\'", "https:\/\/fonts\.googleapis\.com"\]'
style_src_new = r'styleSrc: ["\'self\'", "\'unsafe-inline\'", "https://fonts.googleapis.com", "https://unpkg.com"]'
content = re.sub(style_src_pattern, style_src_new, content)

# Add https://va.vercel-scripts.com to scriptSrc
script_src_pattern = r'scriptSrc: \["\'self\'", "\'unsafe-inline\'", "\'unsafe-eval\'", "https:\/\/js\.stripe\.com", "https:\/\/maps\.googleapis\.com", "https:\/\/\*\.googleapis\.com", "https:\/\/accounts\.google\.com"\]'
script_src_new = r'scriptSrc: ["\'self\'", "\'unsafe-inline\'", "\'unsafe-eval\'", "https://js.stripe.com", "https://maps.googleapis.com", "https://*.googleapis.com", "https://accounts.google.com", "https://va.vercel-scripts.com", "https://unpkg.com"]'
content = re.sub(script_src_pattern, script_src_new, content)

# If the regex didn't match perfectly, let's just do a direct string replace
if not re.search(r'https://va\.vercel-scripts\.com', content):
    content = content.replace(
        'scriptSrc: ["\'self\'", "\'unsafe-inline\'", "\'unsafe-eval\'", "https://js.stripe.com", "https://maps.googleapis.com", "https://*.googleapis.com", "https://accounts.google.com"],',
        'scriptSrc: ["\'self\'", "\'unsafe-inline\'", "\'unsafe-eval\'", "https://js.stripe.com", "https://maps.googleapis.com", "https://*.googleapis.com", "https://accounts.google.com", "https://va.vercel-scripts.com", "https://unpkg.com"],'
    )

if not re.search(r'unpkg\.com', content):
    content = content.replace(
        'styleSrc: ["\'self\'", "\'unsafe-inline\'", "https://fonts.googleapis.com"],',
        'styleSrc: ["\'self\'", "\'unsafe-inline\'", "https://fonts.googleapis.com", "https://unpkg.com"],'
    )

with open('server.ts', 'w') as f:
    f.write(content)
print("Patched CSP")
