import re

with open('components/HostForm.tsx', 'r') as f:
    content = f.read()

# Add draftId to state
state_pattern = r'const \[submitted, setSubmitted\] = useState\(false\);\n'
if 'draftId' not in content:
    content = re.sub(state_pattern, state_pattern + '  const [draftId, setDraftId] = useState<number | null>(null);\n', content)

# Change endpoint in handleSubmit
endpoint_pattern = r'const endpoint = existingListing\?\.id \? `\/api\/listings\/\$\{existingListing\.id\}` : \'\/api\/listings\';\n      const method = existingListing\?\.id \? \'PUT\' : \'POST\';'
new_endpoint = """
      // CQRS DRAFT SAVE (PHASE B)
      const endpoint = '/api/listings/draft';
      const method = 'POST';
      if (draftId) payload.draftId = draftId;
      if (existingListing?.id) payload.published_listing_id = existingListing.id;
"""
content = re.sub(endpoint_pattern, new_endpoint, content)

# Update onSuccess message
success_pattern = r'addToast\(\{ title: \'Success\', description: \'Property listed successfully\' \}\);'
new_success = r"addToast({ title: 'Draft Saved', description: 'Property draft saved securely in CQRS Vault' });"
content = re.sub(success_pattern, new_success, content)

# Change Save button text
button_pattern = r'\{currentStep === STEPS\.length \? \(existingListing \? \'Update Listing\' : \'Publish Listing\'\) : \'Next\'\}'
new_button = r"{currentStep === STEPS.length ? 'Save to Draft Vault' : 'Next'}"
content = re.sub(button_pattern, new_button, content)

with open('components/HostForm.tsx', 'w') as f:
    f.write(content)
print("Patched HostForm for Drafts")
