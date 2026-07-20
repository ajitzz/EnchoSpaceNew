import re
with open('components/HostMarketing.tsx', 'r') as f:
    content = f.read()

target = """      } else {
        const errorData = await res.json();
        addToast('Error', errorData.error || 'Failed to create campaign draft', 'error');
      }"""

replacement = """      } else {
        let errorMsg = 'Failed to create campaign draft';
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch(e) {
          errorMsg = `Server error (${res.status}). Please try again.`;
        }
        addToast('Error', errorMsg, 'error');
      }"""

if target in content:
    content = content.replace(target, replacement)
    with open('components/HostMarketing.tsx', 'w') as f:
        f.write(content)
    print("Patched HostMarketing 2")
else:
    print("Target not found")
