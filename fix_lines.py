with open('server.ts', 'r') as f:
    lines = f.readlines()

bad_lines = [240, 242, 2323, 2328, 2511, 2516, 7239, 7244]
for l in bad_lines:
    if "}" in lines[l-1]:
        lines[l-1] = "\n"

with open('server.ts', 'w') as f:
    f.writelines(lines)
