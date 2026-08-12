import fs from 'fs';

const path = 'src/lib/metaGraphClient.ts';
let content = fs.readFileSync(path, 'utf8');

const regex = /if \(!data\.id\) \{[\s\S]*?return \{[\s\S]*?check_name,[\s\S]*?expected: \`Accessible Page \$\{pageId\}\`,[\s\S]*?actual: \`Page Verified: "\$\{data\.name\}" \(\$\{data\.id\}\)\`,/g;

const replacement = `if (!data.id) {
      return {
        check_name,
        expected: \`Accessible Page \${pageId}\`,
        actual: 'Page Object returned without a valid ID',
        source,
        timestamp,
        correlation_id: correlationId,
        status: 'FAILED',
        failure_code: 'META_PAGE_ACCESS_DENIED',
        message: \`Master System Access Token cannot verify identity on Page \${pageId}.\`
      };
    }

    // ADVERTISING CAPABILITY CHECK:
    // If the token can retrieve the Page access_token, it proves we have sufficient roles (like CREATE_ADS / MANAGE)
    // without needing the deprecated 'tasks' field.
    if (!data.access_token) {
      return {
        check_name,
        expected: \`Publishing capability on Page \${pageId}\`,
        actual: 'Page Object returned without access_token',
        source,
        timestamp,
        correlation_id: correlationId,
        status: 'FAILED',
        failure_code: 'META_PAGE_MISSING_PUBLISH_CAPABILITY',
        message: \`Master System Access Token lacks sufficient permissions to publish on Page \${pageId}.\`
      };
    }

    return {
      check_name,
      expected: \`Accessible Page \${pageId}\`,
      actual: \`Page Verified: "\${data.name}" (\${data.id})\`,`

content = content.replace(regex, replacement);
fs.writeFileSync(path, content);
console.log("Fixed Page Identity");
