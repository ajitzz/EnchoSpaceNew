import re
with open('components/HostMarketing.tsx', 'r') as f:
    content = f.read()

target = """      if (!res.ok) {
         const d = await res.json();
         throw new Error(d.error || 'Failed to submit campaign');
      }"""

replacement = """      if (!res.ok) {
         let errorMsg = 'Failed to submit campaign';
         try {
           const d = await res.json();
           errorMsg = d.error || errorMsg;
         } catch(e) {
           errorMsg = `Server error (${res.status}). Please try again.`;
         }
         throw new Error(errorMsg);
      }"""

if target in content:
    content = content.replace(target, replacement)
    with open('components/HostMarketing.tsx', 'w') as f:
        f.write(content)
    print("Patched HostMarketing")
else:
    print("Target not found")
