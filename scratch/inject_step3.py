with open('components/HostForm.tsx', 'r') as f:
    content = f.read()

start_idx = content.find('{currentStep === 3 && (')
end_idx = content.find('{currentStep === 4 && (', start_idx)

if start_idx != -1 and end_idx != -1:
    with open('scratch/rewrite_step3.tsx', 'r') as f:
        new_step3 = f.read()
    
    # We need to make sure rewrite_step3.tsx ends with a newline, which it does.
    # We replace from start_idx to end_idx.
    content = content[:start_idx] + new_step3 + "\n                " + content[end_idx:]
    with open('components/HostForm.tsx', 'w') as f:
        f.write(content)
    print("Injected Step 3 successfully.")
else:
    print("Could not find step 3 bounds")
