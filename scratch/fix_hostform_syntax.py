with open('components/HostForm.tsx', 'r') as f:
    content = f.read()

content = content.replace(r"const \[submitted, setSubmitted\] = useState\(false\);", "const [submitted, setSubmitted] = useState(false);")
content = content.replace("const const [submitted, setSubmitted]", "const [submitted, setSubmitted]")

with open('components/HostForm.tsx', 'w') as f:
    f.write(content)
